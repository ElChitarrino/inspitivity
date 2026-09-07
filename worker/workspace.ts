import { validProjects } from "../packages/workspace/index.js";

export interface WorkspaceEnv { DB: D1Database; RECORDINGS: R2Bucket }
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
const database = (env: WorkspaceEnv) => env.DB;
async function limitedBody(request: Request, limit: number) {
  const reader=request.body?.getReader();
  if(!reader)return new Uint8Array();
  const chunks: Uint8Array[]=[];let size=0;
  while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw new RangeError("Too large");}chunks.push(value);}
  const result=new Uint8Array(size);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}return result;
}

export async function workspaceApi(request: Request, env: WorkspaceEnv) {
  const owner = request.headers.get("oai-authenticated-user-id");
  if (!owner) return json({ error: "Sign in to sync your ideas." }, 401);
  const url = new URL(request.url);
  if (!["GET", "HEAD"].includes(request.method) && request.headers.get("Origin") !== url.origin)
    return json({ error: "Invalid origin." }, 403);
  try {
    if (url.pathname === "/api/workspace") {
      if (request.method === "GET") {
        const row = await database(env).prepare("SELECT revision, projects FROM workspaces WHERE owner = ?").bind(owner).first<{ revision: number; projects: string }>();
        return json(row ? { revision: row.revision, projects: JSON.parse(row.projects) } : { revision: 0, projects: [] });
      }
      if (request.method !== "PUT") return json({ error: "Method not allowed." }, 405);
      if (Number(request.headers.get("Content-Length")) > 2_000_000) return json({ error: "Workspace exceeds 2 MB." }, 413);
      const raw = new TextDecoder().decode(await limitedBody(request,2_000_000));
      if (raw.length > 2_000_000) return json({ error: "Workspace exceeds 2 MB." }, 413);
      const body = JSON.parse(raw);
      if (!Number.isSafeInteger(body.revision) || body.revision < 0 || !validProjects(body.projects)) return json({ error: "Invalid workspace." }, 400);
      const row = await database(env).prepare(`INSERT INTO workspaces (owner, revision, projects) VALUES (?, 1, ?)
        ON CONFLICT(owner) DO UPDATE SET revision = workspaces.revision + 1, projects = excluded.projects
        WHERE workspaces.revision = ? RETURNING revision`).bind(owner, JSON.stringify(body.projects), body.revision).first<{ revision: number }>();
      if (!row) return json({ error: "Another device has changes. Retry with the latest version." }, 409);
      return json(row);
    }
    const id = decodeURIComponent(url.pathname.slice("/api/recordings/".length));
    if (!/^[a-zA-Z0-9_-]{1,150}$/.test(id)) return json({ error: "Invalid recording." }, 400);
    const key = `${encodeURIComponent(owner)}/${id}`;
    if (request.method === "HEAD") return new Response(null, { status: await env.RECORDINGS.head(key) ? 200 : 404, headers: { "Cache-Control": "private, no-store" } });
    if (request.method === "GET") {
      const obj = await env.RECORDINGS.get(key);
      if (!obj) return json({ error: "Recording not found." }, 404);
      return new Response(obj.body, { headers: { "Content-Type": obj.httpMetadata?.contentType ?? "audio/webm", "Content-Length": String(obj.size), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
    }
    if (request.method !== "PUT") return json({ error: "Method not allowed." }, 405);
    const size = Number(request.headers.get("Content-Length"));
    if (size > 25_000_000) return json({ error: "Recording exceeds 25 MB." }, 413);
    const type = request.headers.get("Content-Type") ?? "";
    if (!/^audio\/[a-zA-Z0-9.+-]+(?:;.*)?$/.test(type)) return json({ error: "Audio required." }, 415);
    const bytes = (await limitedBody(request,25_000_000)).buffer as ArrayBuffer;
    if (bytes.byteLength > 25_000_000) return json({ error: "Recording exceeds 25 MB." }, 413);
    // Recording IDs are immutable. A retry must not overwrite an existing take.
    await env.RECORDINGS.put(key, bytes, { httpMetadata: { contentType: type }, onlyIf: { etagDoesNotMatch: "*" } });
    return json({ saved: true });
  } catch (error) {
    if(error instanceof RangeError)return json({error:"Upload is too large."},413);
    if(error instanceof SyntaxError)return json({error:"Invalid JSON."},400);
    return json({ error: "Sync is unavailable. Your device copy is safe; try again." }, 503);
  }
}
