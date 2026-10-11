import assert from "node:assert/strict";
import test from "node:test";
import { localAIProfile } from "../packages/workspace/local-ai-policy.js";

test("mobile devices receive the compact model including iPadOS desktop identity",()=>{
  for(const environment of [
    {userAgent:"Mozilla/5.0 (iPad; CPU OS 18)",platform:"iPad",maxTouchPoints:5},
    {userAgent:"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Safari",platform:"MacIntel",maxTouchPoints:5},
    {userAgent:"Mozilla/5.0 (iPhone; CPU iPhone OS 18)",platform:"iPhone",maxTouchPoints:5},
    {userAgent:"Mozilla/5.0 (Linux; Android 14)",platform:"Linux",maxTouchPoints:5},
  ]) assert.equal(localAIProfile(environment),"compact");
});

test("reported low memory receives compact AI while eligible desktops receive the LLM",()=>{
  const desktop={userAgent:"Mozilla/5.0 (Macintosh; Intel Mac OS X)",platform:"MacIntel",maxTouchPoints:0};
  assert.equal(localAIProfile({...desktop,deviceMemory:4}),"compact");
  assert.equal(localAIProfile({...desktop,deviceMemory:8}),"desktop");
  assert.equal(localAIProfile(desktop),"desktop");
});
