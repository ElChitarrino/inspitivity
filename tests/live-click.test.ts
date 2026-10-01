import assert from "node:assert/strict";
import test from "node:test";
import { QuarterClickScheduler } from "../packages/sequencing/live-click.js";

test("enabling inside a lookahead window joins the very next quarter note",()=>{
  const click=new QuarterClickScheduler();
  assert.deepEqual(click.collect(false,.4,.5,8),[]);
  assert.deepEqual(click.collect(false,.43,.5,8),[]);
  assert.deepEqual(click.collect(true,.43,.5,8),[1]);
  assert.deepEqual(click.collect(true,.455,.5,8),[]);
  assert.deepEqual(click.collect(true,.8,.5,8),[2]);
});

test("mid-beat activation stays on the existing tempo grid at multiple tempos",()=>{
  for(const bpm of [60,90,120,173]){
    const period=60/bpm,click=new QuarterClickScheduler();
    const elapsed=period*5.7;
    const beats=click.collect(true,elapsed,period,period*16,period);
    assert.equal(beats[0],6);
    assert.ok(beats.every(beat=>beat*period>=elapsed));
    assert.ok(Math.abs(beats[0]*period-elapsed-period*.3)<1e-8);
  }
});

test("exact boundaries, disabling and re-enabling do not shift the click phase",()=>{
  const click=new QuarterClickScheduler();
  assert.deepEqual(click.collect(true,1,.5,8),[2]);
  assert.deepEqual(click.collect(false,1.1,.5,8),[]);
  assert.deepEqual(click.collect(true,1.31,.5,8),[3]);
  assert.deepEqual(click.collect(true,1.4,.5,8),[]);
  assert.deepEqual(new QuarterClickScheduler().collect(true,1.00001,.5,8),[]);
});

test("count-in offsets and loop boundaries preserve the first click and stop at the end",()=>{
  const click=new QuarterClickScheduler(true);
  assert.deepEqual(click.collect(true,-.08,.5,1),[0]);
  assert.deepEqual(click.collect(true,.31,.5,1),[1]);
  assert.deepEqual(click.collect(true,.85,.5,1),[]);
  assert.deepEqual(new QuarterClickScheduler(true).collect(true,-.08,.5,1),[0]);
});

test("late timer recovery skips missed clicks and rejects invalid timing",()=>{
  const click=new QuarterClickScheduler(true);
  click.collect(true,0,.5,8);
  assert.deepEqual(click.collect(true,3.4,.5,8),[7]);
  assert.deepEqual(click.collect(true,NaN,.5,8),[]);
  assert.deepEqual(click.collect(true,4,0,8),[]);
});
