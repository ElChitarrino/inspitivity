import test from 'node:test';
import assert from 'node:assert/strict';
import {bassHarmonics} from '../packages/sequencing/bass-timbre.js';
import {reorderSection,timelineDuration} from '../packages/workspace/arrangement-order.js';
import {activityGain} from '../packages/workspace/mix-activity.js';
import type {SongEvent} from '../packages/workspace/music.js';

test('reordering preserves IDs and content in both directions without mutating input',()=>{
  const sections=[{id:'a',note:'keep'},{id:'b'},{id:'c'}];
  assert.deepEqual(reorderSection(sections,'a','c').map(s=>s.id),['b','c','a']);
  assert.deepEqual(reorderSection(sections,'c','a').map(s=>s.id),['c','a','b']);
  assert.equal(reorderSection(sections,'a','c')[2],sections[0]);
  assert.deepEqual(sections.map(s=>s.id),['a','b','c']);
  assert.deepEqual(reorderSection(sections,'missing','c'),sections);
});
test('timeline proportions follow transport beats, meter maps and repeats',()=>{
  assert.equal(timelineDuration({bars:8},'4/4'),2*timelineDuration({bars:4},'4/4'));
  assert.equal(timelineDuration({bars:4,meterMap:['4/4','7/8'],repeats:2},'4/4'),44);
});
test('bass spectrum has a stable fundamental and measured waveform headroom',()=>{
  const harmonics=bassHarmonics();
  assert.equal(harmonics[0],0);
  assert.ok(harmonics.slice(2).every(value=>Math.abs(value)<harmonics[1]));
  let peak=0,sum=0;
  for(let frame=0;frame<8192;frame++){
    let value=0;for(let h=1;h<harmonics.length;h++)value+=harmonics[h]*Math.sin(2*Math.PI*h*frame/8192);
    peak=Math.max(peak,Math.abs(value));sum+=value*value;
  }
  assert.ok(peak<=.901);assert.ok(Math.abs(Math.sqrt(sum/8192)-.45)<.005);
});
test('activity compensation reduces dense chords without boosting silence or sparse parts',()=>{
  const event:SongEvent={sectionId:'a',layer:'chords',pitch:60,start:0,duration:4,seconds:0,secondsDuration:4,velocity:.8};
  assert.equal(activityGain([],4,'chords'),1);
  assert.equal(activityGain([event],4,'chords'),1);
  assert.ok(activityGain(Array(6).fill(event),4,'chords')<activityGain(Array(2).fill(event),4,'chords'));
  assert.ok(activityGain(Array(100).fill(event),4,'chords')>=.65);
});
