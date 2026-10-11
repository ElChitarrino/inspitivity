import assert from "node:assert/strict";
import test from "node:test";
import { scheduleWindow } from "../packages/sequencing/schedule-window.js";

test("dense multitrack scores schedule once within the lookahead, not all at startup",()=>{
  const events=Array.from({length:30000},(_,id)=>({id,seconds:Math.floor(id/5)*.125}));
  const emitted:number[]=[];
  let index=scheduleWindow(events,0,-.08,event=>emitted.push(event.id));
  assert.equal(index,5);
  for(let tick=0;tick<30020;tick++)index=scheduleWindow(events,index,tick*.025,(event,delay)=>{
    assert.ok(delay>=0 && delay<=.2+1e-9);
    emitted.push(event.id);
  });
  assert.equal(index,events.length);
  assert.deepEqual(emitted,events.map(e=>e.id));
});
test("a stalled tab skips expired notes instead of firing a catch-up burst",()=>{
  const events=Array.from({length:100},(_,seconds)=>({seconds}));
  const heard:number[]=[];
  let index=scheduleWindow(events,0,0,e=>heard.push(e.seconds));
  index=scheduleWindow(events,index,50,e=>heard.push(e.seconds));
  assert.equal(index,51);
  assert.deepEqual(heard,[0,50]);
  assert.equal(scheduleWindow(events,index,50,()=>assert.fail("duplicate note")),51);
});
