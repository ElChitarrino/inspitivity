import assert from 'node:assert/strict';
import test from 'node:test';
import {playbackProject} from '../packages/workspace/playback.js';
import {buildSongPlan} from '../packages/workspace/music.js';
import type {Project} from '../packages/workspace/index.js';
const project:Project={id:'p',name:'Song',key:'C ionian',bpm:120,meter:'7/8',updated:1,sections:['a','b'].map(id=>({id,name:id,bars:2,color:'mint',ideas:[{id:`c${id}`,type:'chords',name:'Chord',detail:'',data:['C|7|48,52,55']}]}))};
test('one transport scopes song, section and part without generating missing layers',()=>{
  const original=JSON.stringify(project);
  const previews={'p/b/drums':{voice:'prog metal',data:['kick|0|1|7']}};
  const song=playbackProject(project,previews,'a','song','chords');
  assert.equal(song.sections.length,2);assert.equal(song.sections[0].ideas.length,1);assert.equal(song.sections[1].ideas.length,2);
  const section=playbackProject(project,previews,'b','section','chords');
  assert.equal(section.sections.length,1);assert.equal(section.sections[0].id,'b');
  const part=playbackProject(project,previews,'b','part','drums');
  assert.deepEqual(part.sections[0].ideas.map(i=>i.type),['drums']);
  assert.ok(buildSongPlan(part).events.every(e=>e.layer==='drums'&&e.voice==='prog metal'));
  assert.equal(buildSongPlan(playbackProject(project,{},'a','part','bass')).events.length,0);
  assert.equal(JSON.stringify(project),original);
});
test('scratch drafts replace only the selected first section and repeat timing is retained',()=>{
  const song=playbackProject(project,{'p/scratch/chords':{data:['G|7|43,47,50']}},null,'song','chords');
  assert.equal(song.sections[0].ideas[0].data?.[0],'G|7|43,47,50');
  assert.equal(song.sections[1].ideas[0].data?.[0],'C|7|48,52,55');
  assert.equal(buildSongPlan(song).seconds,14);
});
