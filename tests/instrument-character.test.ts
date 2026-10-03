import test from 'node:test';
import assert from 'node:assert/strict';
import { INSTRUMENT_CHARACTERS,instrumentEnvelope } from '../packages/sequencing/instrument-voices.js';
import { measuredSampleGain } from '../packages/sequencing/sample-levels.js';
test('instrument envelopes stay ordered even for fast staccato notes and retain distinct sustained vs struck behaviour',()=>{
 for(const character of Object.values(INSTRUMENT_CHARACTERS))for(const duration of [.01,.04,.25,2]){
  const e=instrumentEnvelope(character,duration,.7);assert.ok(e.attack>0&&e.attack<e.hold&&e.hold<e.end);assert.ok(e.sustain<=e.peak);
  assert.ok(character.partials.length<=4);assert.ok(character.partials.every(p=>p.ratio>0&&p.level>0));
 }
 const c=INSTRUMENT_CHARACTERS;
 assert.ok(c['warm pad'].attack>c.pluck.attack*50);assert.ok(c.glass.partials.every(p=>p.decay>0));assert.ok(c['analog pulse'].sustain>c.pluck.sustain*5);
 assert.equal(c.pluck.room,0);assert.equal(c['warm pad'].room,1);assert.ok(c.glass.partials.some(p=>p.ratio!==Math.round(p.ratio)));
});
test('sample calibration gives comparable attack levels while respecting peak headroom and avoiding extreme boosts',()=>{
 const loud=Float32Array.from({length:1000},(_,i)=>.6*Math.sin(i*.1)),quiet=Float32Array.from(loud,n=>n*.6);
 const loudGain=measuredSampleGain([loud],5000,.2),quietGain=measuredSampleGain([quiet],5000,.2);
 assert.ok(Math.abs(loudGain*.6-quietGain*.36)<.04);assert.ok(quietGain>loudGain);
 assert.equal(measuredSampleGain([new Float32Array(100)],5000,.2),1);
 assert.equal(measuredSampleGain([Float32Array.from({length:100},()=>.001)],5000,.2),1.7);
 assert.ok(measuredSampleGain([Float32Array.from({length:100},()=>1)],5000,.2)<=.95);
});
