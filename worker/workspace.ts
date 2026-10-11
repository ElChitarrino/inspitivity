import { recordingIds, validProjects, type Project } from "../packages/workspace/index.js";

export interface WorkspaceEnv { DB: D1Database; RECORDINGS: R2Bucket }
type Identity = { owner: string; email: string; displayName: string };
type SharedRow = { project_id: string; owner_id: string; project: string; updated_at: number };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
const database = (env: WorkspaceEnv) => env.DB;
const normalizeEmail = (value: string) => value.trim().toLowerCase();
const validEmail = (value: string) => value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

function identity(request: Request): Identity | null {
  const email = normalizeEmail(request.headers.get("oai-authenticated-user-email") ?? "");
  const owner = request.headers.get("oai-authenticated-user-id")?.trim() || (email ? `email:${email}` : "");
  if (!owner) return null;
  const encodedName = request.headers.get("oai-authenticated-user-full-name");
  let displayName = email;
  if (encodedName && request.headers.get("oai-authenticated-user-full-name-encoding") === "percent-encoded-utf-8") {
    try { displayName = decodeURIComponent(encodedName); } catch { /* email remains the fallback */ }
  }
  return { owner, email, displayName };
}

async function registerUser(env: WorkspaceEnv, user: Identity) {
  if (!user.email) return;
  await database(env).prepare(`INSERT INTO users (user_id, email, display_name, last_seen_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET email = excluded.email, display_name = excluded.display_name, last_seen_at = excluded.last_seen_at`)
    .bind(user.owner, user.email, user.displayName, Date.now()).run();
}

async function limitedBody(request: Request, limit: number) {
  const reader=request.body?.getReader();
  if(!reader)return new Uint8Array();
  const chunks: Uint8Array[]=[];let size=0;
  while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw new RangeError("Too large");}chunks.push(value);}
  const result=new Uint8Array(size);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}return result;
}

async function readBody(request: Request, limit = 2_000_000) {
  if (Number(request.headers.get("Content-Length")) > limit) throw new RangeError("Too large");
  return JSON.parse(new TextDecoder().decode(await limitedBody(request, limit)));
}

async function sharedProjectsFor(env: WorkspaceEnv, user: Identity) {
  const statement = user.email
    ? database(env).prepare(`SELECT DISTINCT sp.project_id, sp.owner_id, sp.project, sp.updated_at
        FROM shared_projects sp LEFT JOIN project_members pm ON pm.project_id = sp.project_id
        WHERE sp.owner_id = ? OR pm.member_email = ?`).bind(user.owner, user.email)
    : database(env).prepare("SELECT project_id, owner_id, project, updated_at FROM shared_projects WHERE owner_id = ?").bind(user.owner);
  const result = await statement.all<SharedRow>();
  return result.results ?? [];
}

async function ownWorkspace(env: WorkspaceEnv, owner: string) {
  return database(env).prepare("SELECT revision, projects FROM workspaces WHERE owner = ?")
    .bind(owner).first<{ revision: number; projects: string }>();
}

async function projectForShare(env: WorkspaceEnv, user: Identity, projectId: string) {
  const shared = await database(env).prepare("SELECT project_id, owner_id, project, updated_at FROM shared_projects WHERE project_id = ?")
    .bind(projectId).first<SharedRow>();
  if (shared) return { shared, project: JSON.parse(shared.project) as Project };
  const workspace = await ownWorkspace(env, user.owner);
  const projects: unknown = workspace ? JSON.parse(workspace.projects) : [];
  if (!validProjects(projects)) return null;
  const project = projects.find((candidate) => candidate.id === projectId);
  return project ? { shared: null, project } : null;
}

async function shareInfo(env: WorkspaceEnv, user: Identity, projectId: string) {
  const source = await projectForShare(env, user, projectId);
  if (!source) return null;
  const ownerId = source.shared?.owner_id ?? user.owner;
  const members = await database(env).prepare("SELECT member_email, role FROM project_members WHERE project_id = ? ORDER BY member_email")
    .bind(projectId).all<{ member_email: string; role: string }>();
  const ownerRow = await database(env).prepare("SELECT email FROM users WHERE user_id = ?")
    .bind(ownerId).first<{ email: string }>();
  const member = members.results?.find((candidate) => candidate.member_email === user.email);
  const canManage = ownerId === user.owner;
  if (!canManage && !member) return null;
  return {
    projectId,
    ownerEmail: ownerRow?.email ?? (canManage ? user.email : "Project owner"),
    members: (members.results ?? []).map((candidate) => ({ email: candidate.member_email, role: candidate.role })),
    canManage,
    currentRole: canManage ? "owner" : "editor",
  };
}

async function handleShares(request: Request, env: WorkspaceEnv, user: Identity, url: URL) {
  if (!user.email) return json({ error: "A verified account email is required for sharing." }, 400);
  const projectId = url.searchParams.get("project_id")?.trim() ?? "";
  if (request.method === "GET") {
    if (!projectId) return json({ error: "Project required." }, 400);
    const info = await shareInfo(env, user, projectId);
    return info ? json(info) : json({ error: "Project not found." }, 404);
  }
  if (request.method === "POST") {
    const body = await readBody(request, 20_000) as { projectId?: unknown; email?: unknown };
    const id = typeof body.projectId === "string" ? body.projectId.trim() : "";
    const memberEmail = typeof body.email === "string" ? normalizeEmail(body.email) : "";
    if (!id || !validEmail(memberEmail)) return json({ error: "Enter a valid collaborator email." }, 400);
    if (memberEmail === user.email) return json({ error: "This project is already in your account." }, 400);
    const source = await projectForShare(env, user, id);
    if (!source) return json({ error: "Project not found." }, 404);
    if (source.shared && source.shared.owner_id !== user.owner) return json({ error: "Only the project owner can add collaborators." }, 403);
    const statements = [
      database(env).prepare(`INSERT INTO shared_projects (project_id, owner_id, project, revision, updated_at) VALUES (?, ?, ?, 1, ?)
        ON CONFLICT(project_id) DO UPDATE SET project = excluded.project, updated_at = excluded.updated_at WHERE shared_projects.owner_id = excluded.owner_id`)
        .bind(id, user.owner, JSON.stringify(source.project), source.project.updated),
      database(env).prepare(`INSERT INTO project_members (project_id, member_email, role, added_at) VALUES (?, ?, 'editor', ?)
        ON CONFLICT(project_id, member_email) DO UPDATE SET role = 'editor'`)
        .bind(id, memberEmail, Date.now()),
      ...recordingIds([source.project]).map((recordingId) => database(env)
        .prepare("INSERT OR IGNORE INTO shared_recordings (project_id, recording_id, owner_id) VALUES (?, ?, ?)")
        .bind(id, recordingId, user.owner)),
    ];
    await database(env).batch(statements);
    return json(await shareInfo(env, user, id));
  }
  if (request.method === "DELETE") {
    if (!projectId) return json({ error: "Project required." }, 400);
    const source = await projectForShare(env, user, projectId);
    if (!source?.shared) return json({ error: "Shared project not found." }, 404);
    const access = await shareInfo(env, user, projectId);
    if (!access) return json({ error: "Shared project not found." }, 404);
    const requestedEmail = normalizeEmail(url.searchParams.get("email") ?? "");
    if (source.shared.owner_id === user.owner) {
      if (!requestedEmail) return json({ error: "Collaborator required." }, 400);
      await database(env).prepare("DELETE FROM project_members WHERE project_id = ? AND member_email = ?").bind(projectId, requestedEmail).run();
      return json(await shareInfo(env, user, projectId));
    }
    if (requestedEmail && requestedEmail !== user.email) return json({ error: "You can only leave for your own account." }, 403);
    await database(env).prepare("DELETE FROM project_members WHERE project_id = ? AND member_email = ?").bind(projectId, user.email).run();
    return json({ left: true });
  }
  return json({ error: "Method not allowed." }, 405);
}

async function handleWorkspace(request: Request, env: WorkspaceEnv, user: Identity) {
  if (request.method === "GET") {
    const [row, shared] = await Promise.all([ownWorkspace(env, user.owner), sharedProjectsFor(env, user)]);
    const personal: unknown = row ? JSON.parse(row.projects) : [];
    if (!validProjects(personal)) throw new SyntaxError("Invalid stored workspace");
    const sharedProjects = shared.map((item) => JSON.parse(item.project)).filter((item): item is Project => validProjects([item]));
    const sharedIds = new Set(sharedProjects.map((project) => project.id));
    const projects = [...sharedProjects, ...personal.filter((project) => !sharedIds.has(project.id))]
      .sort((a, b) => b.updated - a.updated);
    return json({ revision: row?.revision ?? 0, projects });
  }
  if (request.method !== "PUT") return json({ error: "Method not allowed." }, 405);
  const body = await readBody(request);
  if (!Number.isSafeInteger(body.revision) || body.revision < 0 || !validProjects(body.projects)) return json({ error: "Invalid workspace." }, 400);
  const shared = await sharedProjectsFor(env, user);
  const sharedById = new Map(shared.map((row) => [row.project_id, row]));
  const incomingById = new Map<string, Project>(body.projects.map((project: Project) => [project.id, project]));
  const personal = body.projects.filter((project: Project) => !sharedById.has(project.id));
  const saved = await database(env).prepare(`INSERT INTO workspaces (owner, revision, projects) VALUES (?, 1, ?)
    ON CONFLICT(owner) DO UPDATE SET revision = workspaces.revision + 1, projects = excluded.projects
    WHERE workspaces.revision = ? RETURNING revision`).bind(user.owner, JSON.stringify(personal), body.revision).first<{ revision: number }>();
  if (!saved) return json({ error: "Another device has changes. Retry with the latest version." }, 409);

  const statements: D1Statement[] = [];
  for (const row of shared) {
    const incoming = incomingById.get(row.project_id);
    if (!incoming) {
      if (row.owner_id === user.owner) {
        statements.push(database(env).prepare("DELETE FROM project_members WHERE project_id = ?").bind(row.project_id));
        statements.push(database(env).prepare("DELETE FROM shared_recordings WHERE project_id = ?").bind(row.project_id));
        statements.push(database(env).prepare("DELETE FROM shared_projects WHERE project_id = ? AND owner_id = ?").bind(row.project_id, user.owner));
      } else if (user.email) {
        statements.push(database(env).prepare("DELETE FROM project_members WHERE project_id = ? AND member_email = ?").bind(row.project_id, user.email));
      }
      continue;
    }
    if (incoming.updated <= row.updated_at) continue;
    statements.push(database(env).prepare(`UPDATE shared_projects SET project = ?, revision = revision + 1, updated_at = ?
      WHERE project_id = ? AND (owner_id = ? OR EXISTS (SELECT 1 FROM project_members WHERE project_id = ? AND member_email = ?))`)
      .bind(JSON.stringify(incoming), incoming.updated, row.project_id, user.owner, row.project_id, user.email));
    const currentRecordingIds = recordingIds([incoming]);
    if (currentRecordingIds.length) {
      const placeholders = currentRecordingIds.map(() => "?").join(", ");
      statements.push(database(env).prepare(`DELETE FROM shared_recordings WHERE project_id = ? AND recording_id NOT IN (${placeholders})`)
        .bind(row.project_id, ...currentRecordingIds));
    } else statements.push(database(env).prepare("DELETE FROM shared_recordings WHERE project_id = ?").bind(row.project_id));
    for (const recordingId of currentRecordingIds)
      statements.push(database(env).prepare("INSERT OR IGNORE INTO shared_recordings (project_id, recording_id, owner_id) VALUES (?, ?, ?)")
        .bind(row.project_id, recordingId, user.owner));
  }
  if (statements.length) await database(env).batch(statements);
  return json(saved);
}

async function sharedRecordingOwner(env: WorkspaceEnv, user: Identity, recordingId: string) {
  const statement = user.email
    ? database(env).prepare(`SELECT sr.owner_id FROM shared_recordings sr
        JOIN shared_projects sp ON sp.project_id = sr.project_id
        LEFT JOIN project_members pm ON pm.project_id = sp.project_id
        WHERE sr.recording_id = ? AND (sp.owner_id = ? OR pm.member_email = ?) LIMIT 1`).bind(recordingId, user.owner, user.email)
    : database(env).prepare(`SELECT sr.owner_id FROM shared_recordings sr JOIN shared_projects sp ON sp.project_id = sr.project_id
        WHERE sr.recording_id = ? AND sp.owner_id = ? LIMIT 1`).bind(recordingId, user.owner);
  return statement.first<{ owner_id: string }>();
}

async function handleRecording(request: Request, env: WorkspaceEnv, user: Identity, url: URL) {
  const id = decodeURIComponent(url.pathname.slice("/api/recordings/".length));
  if (!/^[a-zA-Z0-9_-]{1,150}$/.test(id)) return json({ error: "Invalid recording." }, 400);
  const ownKey = `${encodeURIComponent(user.owner)}/${id}`;
  if (request.method === "HEAD") {
    let key = ownKey;
    let object = await env.RECORDINGS.head(key);
    if (!object) {
      const sharedOwner = await sharedRecordingOwner(env, user, id);
      if (sharedOwner) {
        key = `${encodeURIComponent(sharedOwner.owner_id)}/${id}`;
        object = await env.RECORDINGS.head(key);
      }
    }
    return new Response(null, { status: object ? 200 : 404, headers: { "Cache-Control": "private, no-store" } });
  }
  if (request.method === "GET") {
    let key = ownKey;
    let object = await env.RECORDINGS.get(key);
    if (!object) {
      const sharedOwner = await sharedRecordingOwner(env, user, id);
      if (sharedOwner) {
        key = `${encodeURIComponent(sharedOwner.owner_id)}/${id}`;
        object = await env.RECORDINGS.get(key);
      }
    }
    if (!object) return json({ error: "Recording not found." }, 404);
    return new Response(object.body, { headers: { "Content-Type": object.httpMetadata?.contentType ?? "audio/webm", "Content-Length": String(object.size), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  }
  if (request.method !== "PUT") return json({ error: "Method not allowed." }, 405);
  const size = Number(request.headers.get("Content-Length"));
  if (size > 25_000_000) return json({ error: "Recording exceeds 25 MB." }, 413);
  const type = request.headers.get("Content-Type") ?? "";
  if (!/^audio\/[a-zA-Z0-9.+-]+(?:;.*)?$/.test(type)) return json({ error: "Audio required." }, 415);
  const bytes = (await limitedBody(request,25_000_000)).buffer as ArrayBuffer;
  if (bytes.byteLength > 25_000_000) return json({ error: "Recording exceeds 25 MB." }, 413);
  await env.RECORDINGS.put(ownKey, bytes, { httpMetadata: { contentType: type }, onlyIf: { etagDoesNotMatch: "*" } });
  return json({ saved: true });
}

export async function workspaceApi(request: Request, env: WorkspaceEnv) {
  const user = identity(request);
  if (!user) return json({ error: "Sign in to sync your ideas." }, 401);
  const url = new URL(request.url);
  if (!["GET", "HEAD"].includes(request.method) && request.headers.get("Origin") !== url.origin)
    return json({ error: "Invalid origin." }, 403);
  try {
    await registerUser(env, user);
    if (url.pathname === "/api/workspace") return handleWorkspace(request, env, user);
    if (url.pathname === "/api/shares") return handleShares(request, env, user, url);
    return handleRecording(request, env, user, url);
  } catch (error) {
    if(error instanceof RangeError)return json({error:"Upload is too large."},413);
    if(error instanceof SyntaxError)return json({error:"Invalid JSON."},400);
    return json({ error: "Sync is unavailable. Your device copy is safe; try again." }, 503);
  }
}
