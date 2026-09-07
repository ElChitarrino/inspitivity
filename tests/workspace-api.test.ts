import assert from "node:assert/strict";
import test from "node:test";
import { workspaceApi, type WorkspaceEnv } from "../worker/workspace.js";

function fixture() {
  const rows=new Map<string,{revision:number;projects:string}>();
  const DB={prepare:(sql:string)=>({bind:(...values:unknown[])=>({first:async()=>{
    const owner=String(values[0]),row=rows.get(owner);
    if(sql.startsWith("SELECT"))return row ?? null;
    if(row && row.revision!==values[2])return null;
    const next={revision:(row?.revision??0)+1,projects:String(values[1])};rows.set(owner,next);return {revision:next.revision};
  }})})};
  const env={DB,RECORDINGS:{}} as unknown as WorkspaceEnv;
  const request=(method="GET",owner="alice",body?:unknown,origin="https://music.test")=>new Request("https://music.test/api/workspace",{method,headers:{"oai-authenticated-user-id":owner,"Origin":origin,"Content-Type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {env,request};
}
test("workspace API requires identity and same-origin writes",async()=>{
  const {env,request}=fixture();
  assert.equal((await workspaceApi(request("GET",""),env)).status,401);
  assert.equal((await workspaceApi(request("PUT","alice",{revision:0,projects:[]},"https://evil.test"),env)).status,403);
  assert.equal((await workspaceApi(request("PUT","alice",{revision:0,projects:[{}]}),env)).status,400);
});
test("workspace API isolates users and rejects stale revisions",async()=>{
  const {env,request}=fixture();
  assert.deepEqual(await (await workspaceApi(request(),env)).json(),{revision:0,projects:[]});
  assert.equal((await workspaceApi(request("PUT","alice",{revision:0,projects:[]}),env)).status,200);
  assert.equal((await workspaceApi(request("PUT","alice",{revision:0,projects:[]}),env)).status,409);
  assert.deepEqual(await (await workspaceApi(request("GET","bob"),env)).json(),{revision:0,projects:[]});
  assert.equal((await workspaceApi(request("PUT","alice",{revision:1,projects:[]}),env)).status,200);
});
