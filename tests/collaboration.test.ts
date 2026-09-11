import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import test from "node:test";
import type { Project } from "../packages/workspace/index.js";
import { workspaceApi, type WorkspaceEnv } from "../worker/workspace.js";

class SqliteD1Statement implements D1Statement {
  constructor(private db: DatabaseSync, private sql: string, private values: unknown[] = []) {}
  bind(...values: unknown[]) { return new SqliteD1Statement(this.db, this.sql, values); }
  async first<T>() { return (this.db.prepare(this.sql).get(...this.values as SQLInputValue[]) as T | undefined) ?? null; }
  async all<T>() { return { results:this.db.prepare(this.sql).all(...this.values as SQLInputValue[]) as T[], success:true }; }
  async run<T>() {
    const result = this.db.prepare(this.sql).run(...this.values as SQLInputValue[]);
    return { results:[] as T[], success:true, meta:{ changes:Number(result.changes) } };
  }
}

async function collaborationFixture() {
  const sqlite = new DatabaseSync(":memory:");
  const migration = await readFile(resolve(process.cwd(), "drizzle/0001_normal_sumo.sql"), "utf8");
  const initial = await readFile(resolve(process.cwd(), "drizzle/0000_small_maggott.sql"), "utf8");
  for (const statement of `${initial}\n${migration}`.split("--> statement-breakpoint").map((value)=>value.trim()).filter(Boolean)) sqlite.exec(statement);
  const DB: D1Database = {
    prepare:(sql:string)=>new SqliteD1Statement(sqlite,sql),
    batch:async<T>(statements:D1Statement[])=>{
      sqlite.exec("BEGIN");
      try {
        const results=[];
        for(const statement of statements) results.push(await statement.run<T>());
        sqlite.exec("COMMIT");
        return results;
      } catch(error) { sqlite.exec("ROLLBACK"); throw error; }
    },
  };
  const env={ DB, RECORDINGS:{} } as WorkspaceEnv;
  const request=(path:string,method:string,userId:string,email:string,body?:unknown)=>new Request(`https://music.test${path}`,{
    method,
    headers:{"oai-authenticated-user-id":userId,"oai-authenticated-user-email":email,"Origin":"https://music.test","Content-Type":"application/json"},
    ...(body===undefined?{}:{body:JSON.stringify(body)}),
  });
  return {sqlite,env,request};
}

const project: Project = {
  id:"shared-song",
  name:"Joint sketch",
  bpm:120,
  meter:"4/4",
  key:"E Dorian",
  updated:100,
  sections:[{id:"verse",name:"Verse",bars:4,color:"mint",ideas:[]}],
};

test("account collaborators receive and edit one shared project, then can leave", async () => {
  const {sqlite,env,request}=await collaborationFixture();
  try {
    const ownerSave=await workspaceApi(request("/api/workspace","PUT","alice","alice@example.com",{revision:0,projects:[project]}),env);
    assert.equal(ownerSave.status,200);
    const invitation=await workspaceApi(request("/api/shares","POST","alice","alice@example.com",{projectId:project.id,email:"Bob@Example.com"}),env);
    assert.equal(invitation.status,200);
    const access=await invitation.json() as {members:Array<{email:string}>};
    assert.deepEqual(access.members.map((member)=>member.email),["bob@example.com"]);

    const collaboratorWorkspace=await workspaceApi(request("/api/workspace","GET","bob","bob@example.com"),env);
    const received=await collaboratorWorkspace.json() as {revision:number;projects:Project[]};
    assert.equal(received.projects[0].name,"Joint sketch");
    const edited={...received.projects[0],name:"Joint sketch — Bob edit",updated:200};
    assert.equal((await workspaceApi(request("/api/workspace","PUT","bob","bob@example.com",{revision:received.revision,projects:[edited]}),env)).status,200);

    const ownerWorkspace=await workspaceApi(request("/api/workspace","GET","alice","alice@example.com"),env);
    const ownerView=await ownerWorkspace.json() as {projects:Project[]};
    assert.equal(ownerView.projects[0].name,"Joint sketch — Bob edit");

    assert.equal((await workspaceApi(request(`/api/shares?project_id=${project.id}`,"DELETE","bob","bob@example.com"),env)).status,200);
    const afterLeaving=await workspaceApi(request("/api/workspace","GET","bob","bob@example.com"),env);
    assert.deepEqual((await afterLeaving.json() as {projects:Project[]}).projects,[]);
  } finally { sqlite.close(); }
});

test("non-owners cannot invite people into someone else’s project", async () => {
  const {sqlite,env,request}=await collaborationFixture();
  try {
    await workspaceApi(request("/api/workspace","PUT","alice","alice@example.com",{revision:0,projects:[project]}),env);
    await workspaceApi(request("/api/shares","POST","alice","alice@example.com",{projectId:project.id,email:"bob@example.com"}),env);
    const response=await workspaceApi(request("/api/shares","POST","bob","bob@example.com",{projectId:project.id,email:"mallory@example.com"}),env);
    assert.equal(response.status,403);
  } finally { sqlite.close(); }
});
