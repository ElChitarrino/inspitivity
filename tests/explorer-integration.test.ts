import assert from "node:assert/strict";
import test from "node:test";
import { generateThemeDraft, THEME_FEELS, parseModelFeel } from "../packages/workspace/theme-explorer.js";
import { ThemeAIClient, type ThemeWorkerPort, type ModelState } from "../packages/workspace/theme-ai-client.js";
import { getScale, notePitchClass, SELECTABLE_MODES, type Root } from "../packages/music-theory/index.js";
import { chordNoteEvents } from "../packages/music-theory/chord-rhythm.js";
import { nextLabelTokens } from "../packages/workspace/theme-token-grammar.js";

test("model token grammar permits only labels, including multi-token and shared prefixes",()=>{
  const labels=[[1,2],[1,3],[4]];
  assert.deepEqual([...nextLabelTokens(labels,[],0)],[1,4]);
  assert.deepEqual([...nextLabelTokens(labels,[1],0)],[2,3]);
  assert.deepEqual([...nextLabelTokens(labels,[1,2],0)],[0]);
  assert.deepEqual([...nextLabelTokens(labels,[4],0)],[0]);
  assert.deepEqual([...nextLabelTokens(labels,[9],0)],[0]);
});

class FakeWorker implements ThemeWorkerPort {
  onmessage: ThemeWorkerPort["onmessage"] = null;
  onerror: ThemeWorkerPort["onerror"] = null;
  sent: Array<{type:string;id?:number;prompt?:string}> = [];
  terminated=false;
  postMessage(message: unknown) {this.sent.push(message as typeof this.sent[number]);}
  terminate(){this.terminated=true;}
  emit(data: Parameters<NonNullable<ThemeWorkerPort["onmessage"]>>[0]["data"]){this.onmessage?.({data});}
}

test("all feelings offer multiple musical paths even with key and mode locked",()=>{
  for(const feel of THEME_FEELS){
    const paths=new Set<string>();
    for(let seed=0;seed<24;seed++){
      const draft=generateThemeDraft({prompt:"",feel,root:"Eb",mode:"dorian",seed});
      assert.equal(draft.root,"Eb");assert.equal(draft.mode,"dorian");
      paths.add(draft.chords.map(chord=>chord.name).join(" "));
    }
    assert.ok(paths.size>=5,`${feel}: ${paths.size} paths`);
  }
});

test("explorer to playback integration stays in harmonic scale with valid finite events",()=>{
  for(const mode of SELECTABLE_MODES) for(const root of ["C","Eb","Gb","A"] as Root[]) for(const feel of THEME_FEELS){
    const draft=generateThemeDraft({prompt:"",feel,root,mode,seed:83});
    const parent=mode==="major pentatonic"?"ionian":mode==="minor pentatonic"?"aeolian":mode;
    const scale=new Set(getScale(root,parent).map(notePitchClass));
    assert.equal(draft.chords.length,4);
    for(const chord of draft.chords){
      assert.ok(chord.pitches.length>=3,`${root} ${mode} ${chord.name}`);
      assert.ok(chord.pitches.every(pitch=>pitch>=24&&pitch<=96&&scale.has(pitch%12)),`${root} ${mode} ${chord.name}`);
    }
    const notes=chordNoteEvents(draft.chords);
    assert.ok(notes.length>=12);
    assert.ok(notes.every(note=>Number.isFinite(note.start)&&note.duration>0&&note.velocity>0&&scale.has(note.pitch%12)));
  }
});

test("auto varies keys and mood modes while explicit settings are deterministic",()=>{
  const drafts=Array.from({length:40},(_,seed)=>generateThemeDraft({prompt:"dark heavy metal",seed}));
  assert.ok(new Set(drafts.map(draft=>draft.root)).size>=8);
  assert.ok(drafts.every(draft=>["aeolian","phrygian","harmonic minor"].includes(draft.mode)));
  const options={prompt:"nostalgic",seed:22,root:"A" as const,mode:"dorian" as const};
  assert.deepEqual(generateThemeDraft(options),generateThemeDraft(options));
  assert.equal(generateThemeDraft({prompt:"freudig und hell",seed:1}).feel,"bright");
});

test("model prose accepts one unambiguous category, never echoed lists",()=>{
  assert.equal(parseModelFeel("The emotional category is dark."),"dark");
  assert.equal(parseModelFeel("Sentimental."),"wistful");
  assert.equal(parseModelFeel("Angry"),"dark");
  assert.equal(parseModelFeel("peaceful but anxious"),null);
  assert.equal(parseModelFeel("warm or wistful"),null);
  assert.equal(parseModelFeel("Here are some chords"),null);
});

test("loading queues only the latest prompt and AI response integrates into musical generation",()=>{
  const worker=new FakeWorker(), states:ModelState[]=[];
  let draft=generateThemeDraft({prompt:"a city waking up",seed:32});
  const client=new ThemeAIClient(()=>worker,state=>states.push(state),feel=>{draft=generateThemeDraft({prompt:"a city waking up",seed:32,feel});});
  client.enable();client.enable();client.analyze("old prompt");client.analyze("a city waking up");
  assert.equal(worker.sent.length,1);
  worker.emit({type:"ready"});
  assert.equal(worker.sent.at(-1)?.prompt,"a city waking up");
  worker.emit({type:"result",id:worker.sent.at(-1)?.id,answer:"bright"});
  assert.equal(draft.feel,"bright");assert.equal(states.at(-1)?.phase,"ready");
  assert.ok(chordNoteEvents(draft.chords).length>0);client.dispose();
});

test("explicit musical cues survive a contradictory model interpretation",()=>{
  const worker=new FakeWorker(),results:string[]=[],states:ModelState[]=[];
  const client=new ThemeAIClient(()=>worker,state=>states.push(state),feel=>results.push(feel));
  client.enable();worker.emit({type:"ready"});client.analyze("A heavy metal riff full of anger");
  worker.emit({type:"result",id:worker.sent.at(-1)?.id,answer:"warm"});
  assert.deepEqual(results,["dark"]);assert.match(states.at(-1)?.message||"",/kept your explicit theme cue: dark/);client.dispose();
});

test("stale AI replies cannot overwrite a newer prompt or a manual change",()=>{
  const worker=new FakeWorker(),results:string[]=[];
  const client=new ThemeAIClient(()=>worker,()=>{},feel=>results.push(feel));
  client.enable();worker.emit({type:"ready"});client.analyze("dark");const old=worker.sent.at(-1)?.id;
  client.analyze("warm");worker.emit({type:"result",id:old,answer:"dark"});assert.deepEqual(results,[]);
  const newest=worker.sent.at(-1)?.id;client.invalidate();worker.emit({type:"result",id:newest,answer:"warm"});assert.deepEqual(results,[]);client.dispose();
});

test("worker failures are recoverable and invalid output preserves the fallback",()=>{
  let worker=new FakeWorker();const states:ModelState[]=[],results:string[]=[];
  const client=new ThemeAIClient(()=>worker,state=>states.push(state),feel=>results.push(feel));
  client.enable();worker.emit({type:"error",text:"download failed"});assert.equal(worker.terminated,true);assert.equal(states.at(-1)?.phase,"error");
  worker=new FakeWorker();client.enable();worker.emit({type:"ready"});client.analyze("unknown scene");worker.emit({type:"result",id:worker.sent.at(-1)?.id,answer:"warm or dark"});
  assert.deepEqual(results,[]);assert.equal(states.at(-1)?.phase,"ready");client.dispose();
});

test("a hung download times out, releases its worker and can retry",async()=>{
  const worker=new FakeWorker();const states:ModelState[]=[];
  const client=new ThemeAIClient(()=>worker,state=>states.push(state),()=>{},15);
  client.enable();await new Promise(resolve=>setTimeout(resolve,30));
  assert.equal(worker.terminated,true);assert.equal(states.at(-1)?.phase,"error");client.dispose();
});
