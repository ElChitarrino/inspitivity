import { notePitchClass, seededRandom, type Mode } from "../music-theory/index.js";
import type { DrumHit, DrumInstrument } from "../sequencing/index.js";

export type SketchStyle = "emotive" | "rock" | "neo-soul" | "funk" | "prog" | "heavy";
export type SketchGroove = { name: string; kick: number[]; snare: number[]; hats: number[]; ghost?: number[]; swing?: number };

/** Keep distorted low-register harmony open; the bass and melody supply the modal colour. */
export function heavyPowerVoicing(symbol: string): number[] {
  const root=36+(notePitchClass(symbol)??4);
  return [root,root+7,root+12];
}

/** Relative scale degrees, not fixed keys. Four bars establish a repeatable harmonic identity. */
export function chooseSketchHarmony(style: SketchStyle, mode: Mode, seed: number, variant = 0) {
  const minor = ["minor", "aeolian", "dorian", "phrygian", "locrian", "harmonic minor", "melodic minor", "minor pentatonic"].includes(mode);
  const palettes: Record<SketchStyle, Array<{ name: string; degrees: readonly number[] }>> = {
    emotive: minor ? [
      { name:"wistful return", degrees:[0,5,2,6] },
      { name:"gentle descent", degrees:[0,6,5,3] },
      { name:"open ending", degrees:[5,3,0,4] },
    ] : [
      { name:"warm lift", degrees:[0,4,5,3] },
      { name:"hopeful return", degrees:[5,3,0,4] },
      { name:"open ending", degrees:[0,3,5,4] },
    ],
    rock: [
      { name:"anthem lift", degrees:[0,4,5,3] },
      { name:"back-to-one", degrees:[0,3,4,0] },
      { name:"relative-minor turn", degrees:[5,3,0,4] },
    ],
    "neo-soul": [
      { name:"modal glow", degrees:[0,3,6,3] },
      { name:"soulful turnaround", degrees:[1,4,0,3] },
      { name:"soft tension", degrees:[0,5,3,1] },
    ],
    funk: [
      { name:"tonic pocket", degrees:[0,3,0,4] },
      { name:"modal bounce", degrees:[0,6,3,0] },
      { name:"call and response", degrees:[0,3,4,3] },
    ],
    prog: [
      { name:"modal journey", degrees:[0,5,3,4] },
      { name:"tension and return", degrees:[0,6,3,0] },
      { name:"rising contrast", degrees:[0,3,4,0] },
    ],
    heavy: [
      { name:"dark pull", degrees:[0,1,6,0] },
      { name:"dark descent", degrees:[0,6,1,0] },
      { name:"riff pedal", degrees:[0,3,1,0] },
    ],
  };
  const choices=palettes[style];
  return choices[(Math.floor(seededRandom(seed)()*choices.length)+variant)%choices.length];
}

/** A familiar pulse remains audible while seed changes the template, detail and turnaround. */
export function chooseSketchGroove(style: SketchStyle, beatsPerBar: number, seed: number): SketchGroove {
  const palettes: Record<SketchStyle, SketchGroove[]> = {
    emotive: [
      {name:"flowing six-eight",kick:[0,12],snare:[12],hats:[0,4,8,12,16,20]},
      {name:"soft pulse",kick:[0,16],snare:[12],hats:[0,4,8,12,16,20]},
    ],
    rock: [
      {name:"straight rock backbeat",kick:[0,8],snare:[4,12],hats:[0,2,4,6,8,10,12,14]},
      {name:"rock push",kick:[0,7,8],snare:[4,12],hats:[0,2,4,6,8,10,12,14]},
    ],
    "neo-soul": [
      {name:"laid-back soul pocket",kick:[0,7,10],snare:[4,12],ghost:[11],hats:[0,2,4,6,8,10,12,14],swing:.65},
      {name:"half-time soul shuffle",kick:[0,6,10],snare:[8],ghost:[7,15],hats:[0,2,4,6,8,10,12,14],swing:.8},
    ],
    funk: [
      {name:"syncopated funk",kick:[0,7,10,14],snare:[4,12],ghost:[3,11],hats:[0,2,4,6,8,10,12,14]},
      {name:"open funk pocket",kick:[0,6,11],snare:[4,12],ghost:[15],hats:[0,2,4,6,8,10,12,14],swing:.3},
    ],
    prog: [
      {name:"grouped odd-meter pulse",kick:[0,12,20],snare:[8,24],hats:[0,2,4,6,8,10,12,14,16,18,20,22,24,26]},
      {name:"shifting accents",kick:[0,8,18],snare:[12,24],hats:[0,2,4,6,8,10,12,14,16,18,20,22,24,26]},
    ],
    heavy: [
      {name:"driving heavy pulse",kick:[0,6,12,20],snare:[12,24],hats:[0,2,4,6,8,10,12,14,16,18,20,22,24,26]},
      {name:"half-time impact",kick:[0,8,18,22],snare:[12,24],hats:[0,2,4,6,8,10,12,14,16,18,20,22,24,26]},
    ],
  };
  const choices=palettes[style];
  return choices[Math.floor(seededRandom(seed+19+beatsPerBar)()*choices.length)];
}

export function buildSketchGroove(template: SketchGroove, beatsPerBar: number, bars: number, seed: number, energy: "mellow" | "balanced" | "powerful", relation: "theme" | "develop" | "contrast" | "return"): DrumHit[] {
  const random=seededRandom(seed), steps=beatsPerBar*4, hits:DrumHit[]=[];
  const add=(instrument:DrumInstrument,step:number,velocity:number)=>{
    if(step<0 || step>=steps*bars || hits.some(hit=>hit.instrument===instrument && hit.step===step))return;
    hits.push({instrument,step:Number(step.toFixed(2)),velocity:Number(Math.max(.2,Math.min(1,velocity)).toFixed(2))});
  };
  const scale=energy==="mellow"?.72:energy==="powerful"?1:.87;
  for(let bar=0;bar<bars;bar++) {
    const base=bar*steps;
    // Scale a four-beat or six-eight template into an explicitly chosen odd meter.
    const map=(step:number)=>Math.round(step * steps/(template.hats.length>9?28:template.hats.length===6?24:16));
    for(const step of template.kick)if(map(step)<steps)add("kick",base+map(step),scale*(step===0?.94:.78+random()*.12));
    // A quiet, late soul backbeat is distinct from the straight rock snare.
    for(const step of template.snare)if(map(step)<steps)add("snare",base+map(step)+(template.swing?.22:0),scale*(step===12||step===4?.9:.82));
    if(energy!=="mellow")for(const step of template.ghost??[])if(map(step)<steps)add("snare",base+map(step),.22+random()*.12);
    for(const step of template.hats) {
      const position=map(step);
      if(position>=steps || (energy==="mellow" && step%4!==0 && random()<.6) || (relation==="contrast" && step%4!==0 && random()<.38))continue;
      const swung=template.swing && step%4===2 ? Math.min(steps-.1,position+template.swing) : position;
      const funk=template.name.includes("funk");
      add("hihat",base+swung,scale*(funk?(step%4===0?.39:.58+random()*.06):(step%4===0?.57:.38+random()*.08)));
    }
    if(bar===bars-1 && relation!=="theme" && energy!=="mellow") {
      for(let step=steps-4;step<steps;step+=2)if(random()<.65)add(step===steps-2?"tomlow":"snare",base+step,.43+random()*.18);
    }
    if(energy==="powerful" && (bar===0 || relation==="return"&&bar===bars-1))add("crash",base,.75);
  }
  return hits.sort((a,b)=>a.step-b.step);
}

/** Repeat a short rhythmic idea across the harmonic cycle; leave real rests between phrases. */
export function shapeSketchMotif<T extends { start: number; duration: number; velocity: number }>(notes: T[], style: SketchStyle, beatsPerBar: number, seed: number): T[] {
  const patterns: Record<SketchStyle, number[][]> = {
    emotive:[[0,1.5,3],[0,1,2.75]],
    rock:[[0,.5,2,3],[0,1,2.5,3.5]],
    "neo-soul":[[.5,1.5,2.75,3.5],[0,1.75,2.5,3.25]],
    funk:[[0,.75,2.5,3.5],[.5,1.5,2.75,3.5]],
    prog:[[0,1,2.25,3.25],[0,1.5,2.5,3.5]],
    heavy:[[0,.5,1.5,3],[0,.75,2,3.5]],
  };
  const choices=patterns[style], pattern=choices[Math.floor(seededRandom(seed+29)()*choices.length)];
  if(!notes.length)return [];
  const scale=beatsPerBar/4;
  return notes.map((note,index)=>{
    const bar=Math.floor(index*4/notes.length), position=index-Math.ceil(bar*notes.length/4);
    const withinBar=(pattern[position]??(3.7+(position-pattern.length)*.15))*scale;
    const start=Number((bar*beatsPerBar+withinBar).toFixed(3));
    const next=pattern[position+1]??4;
    const space=Math.max(.125,(next-(pattern[position]??3.7))*scale);
    const duration=index===notes.length-1 ? beatsPerBar*4-start : Math.max(.125,Math.min(space*.82,style==="emotive"?2*scale:.9*scale));
    return {...note,start,duration:Number(duration.toFixed(3)),velocity:Number((.56+(position===0?.17:.04)+(bar===2?.06:0)).toFixed(2))};
  });
}
