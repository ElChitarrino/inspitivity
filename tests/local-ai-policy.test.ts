import assert from "node:assert/strict";
import test from "node:test";
import { localAIBlockReason } from "../packages/workspace/local-ai-policy.js";

test("mobile model loading is blocked including iPadOS desktop identity",()=>{
  for(const environment of [
    {userAgent:"Mozilla/5.0 (iPad; CPU OS 18)",platform:"iPad",maxTouchPoints:5},
    {userAgent:"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Safari",platform:"MacIntel",maxTouchPoints:5},
    {userAgent:"Mozilla/5.0 (iPhone; CPU iPhone OS 18)",platform:"iPhone",maxTouchPoints:5},
    {userAgent:"Mozilla/5.0 (Linux; Android 14)",platform:"Linux",maxTouchPoints:5},
  ]) assert.match(localAIBlockReason(environment)||"",/disabled on phones and tablets/);
});

test("reported low memory is blocked while desktop identity alone stays eligible",()=>{
  const desktop={userAgent:"Mozilla/5.0 (Macintosh; Intel Mac OS X)",platform:"MacIntel",maxTouchPoints:0};
  assert.match(localAIBlockReason({...desktop,deviceMemory:4})||"",/less than 8 GB/);
  assert.equal(localAIBlockReason({...desktop,deviceMemory:8}),null);
  assert.equal(localAIBlockReason(desktop),null);
});
