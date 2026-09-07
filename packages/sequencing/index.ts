import { seededRandom } from "../music-theory/index.js";
export function beatDurationSeconds(bpm: number) {
  if (!Number.isFinite(bpm) || bpm <= 0)
    throw new RangeError("BPM must be greater than zero");
  return 60 / bpm;
}

export function subdivisionDurationSeconds(bpm: number, subdivision: number) {
  if (!Number.isFinite(subdivision) || subdivision <= 0)
    throw new RangeError("Subdivision must be greater than zero");
  return beatDurationSeconds(bpm) / subdivision;
}

export function progressionLoopDurationMs(chordCount: number, bpm: number) {
  return Math.max(0, chordCount) * beatDurationSeconds(bpm) * 1000;
}

export function melodyLoopDurationMs(
  events: Array<{ start: number; duration: number }>,
  bpm: number,
) {
  if (!events.length) return 0;
  const beats = Math.max(
    ...events.map((event) => event.start + event.duration),
  );
  return beats * beatDurationSeconds(bpm) * 1000;
}

export function calculateTapTempo(timestamps: number[]) {
  if (timestamps.length < 2) return null;
  const intervals = timestamps
    .slice(1)
    .map((timestamp, index) => timestamp - timestamps[index])
    .filter((interval) => interval > 0);
  if (!intervals.length) return null;
  const sorted = [...intervals].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const filtered = intervals.filter(
    (interval) => interval >= median * 0.55 && interval <= median * 1.8,
  );
  const average =
    filtered.reduce((sum, interval) => sum + interval, 0) / filtered.length;
  return Math.round(60000 / average);
}

export function isAccentedStep(
  step: number,
  beatsPerBar: number,
  subdivision: number,
) {
  return step % (beatsPerBar * subdivision) === 0;
}

export const DRUM_INSTRUMENTS = [
  "kick",
  "snare",
  "hihat",
  "crash",
  "ride",
  "openhat",
  "tomhigh",
  "tomlow",
] as const;
export type DrumInstrument = (typeof DRUM_INSTRUMENTS)[number];
export type DrumStyle =
  "steady" | "syncopated" | "driving" | "djent" | "odd meter" | "linear";
export type GrooveEnergy = "mellow" | "balanced" | "powerful";
export type DrumHit = {
  instrument: DrumInstrument;
  step: number;
  velocity: number;
};


export const DRUM_PITCHES: Record<DrumInstrument, number> = { kick:36, snare:38, hihat:42, openhat:46, tomhigh:48, tomlow:45, crash:49, ride:51 };
export const DRUM_LABELS: Record<DrumInstrument, string> = { kick:"Kick", snare:"Snare", hihat:"Hi-hat", openhat:"Open hat", tomhigh:"High tom", tomlow:"Low tom", crash:"Crash", ride:"Ride" };

export function generateDrumLoop({ beatsPerBar=4, density=.6, style="steady", energy="balanced", seed=Date.now(), bars=1, fill=.55 }: {
  beatsPerBar?:number; density?:number; style?:DrumStyle; energy?:GrooveEnergy; seed?:number; bars?:number; fill?:number;
}): DrumHit[] {
  const beats=Math.max(2,Math.min(16,Math.round(beatsPerBar))), steps=beats*4;
  const phraseBars=Math.max(1,Math.min(8,Math.round(bars)));
  const activity=Math.max(.1,Math.min(1,density));
  const random=seededRandom(seed), pick=<T,>(xs:T[])=>xs[Math.floor(random()*xs.length)];
  const strength={mellow:.65,balanced:.84,powerful:1}[energy];
  const busy=activity*(energy==="mellow"?.5:energy==="powerful"?1.2:1);
  const halfTime=random() < (style==="djent"?.55:style==="driving"?.1:.22);
  const oddGroups = beats===7 ? pick([[2,2,3],[3,2,2],[2,3,2]]) : beats===5 ? pick([[3,2],[2,3]]) : beats===9 ? pick([[3,3,3],[2,2,2,3]]) : beats===11 ? pick([[3,3,3,2],[2,3,3,3]]) : null;
  let groupEnd=0;
  const groupedBackbeats=oddGroups?.map(group=>{groupEnd+=group;return (groupEnd-1)*4;});
  const backbeats=groupedBackbeats ?? (halfTime ? [Math.floor(beats/2)*4] : Array.from({length:beats},(_,b)=>b).filter(b=>b%2===1).map(b=>b*4));
  const hatStride=energy==="mellow"?4:style==="driving"?2:pick(activity>.75?[1,2,2]:[2,2,4]);
  const hatOffset=pick([0,0,1]);
  const rideLead=random()<.3;
  const grouping=style==="djent"||style==="odd meter" ? pick([[3,3,2],[3,2,3],[5,3],[3,4],[2,3,2]]) : [4];
  const anchors:number[]=[]; let cursor=0,index=0;
  while(cursor<steps){ anchors.push(cursor);cursor+=grouping[index++%grouping.length]; }
  const baseKick=new Set<number>([0]);
  for(let step=1;step<steps;step++) {
    const accent=anchors.includes(step);
    const chance=style==="driving" ? (step%4===0?.95:step%4===2?.4:.14) : style==="djent" ? (accent?.8:.12) : style==="syncopated"||style==="linear" ? (step%4===3?.45:.12) : (step%8===0?.8:step%4===2?.24:.07);
    if(random()<chance*busy && !backbeats.includes(step))baseKick.add(step);
  }
  const hits:DrumHit[]=[];
  for(let bar=0;bar<phraseBars;bar++) {
    const barHits:DrumHit[]=[];
    const add=(instrument:DrumInstrument,step:number,velocity:number)=>{
      if(step<0||step>=steps||barHits.some(h=>h.instrument===instrument&&h.step===step))return;
      if(style==="linear" && barHits.some(h=>h.step===step))return;
      barHits.push({instrument,step,velocity:Math.round(Math.max(.2,Math.min(1,velocity)) * 100)/100});
    };
    backbeats.forEach(step=>add("snare",step,strength*(.94+random()*.06)));
    for(const step of baseKick) if(bar===0||step===0||random()>.12)add("kick",step,strength*(step===0?1:.72+random()*.22));
    for(let step=0;step<steps;step++) {
      const strong=step%4===0;
      if(bar>0 && !backbeats.includes(step) && random()<busy*.12)add("kick",step,strength*(.6+random()*.3));
      if(!strong && random()<busy*(style==="linear"?.23:.12))add("snare",step,.2+random()*.27);
      if((step-hatOffset)%hatStride===0 && random()>(energy==="mellow"?.12:.04)) {
        const instrument:DrumInstrument=rideLead?"ride":(!strong&&random()<.12?"openhat":"hihat");
        add(instrument,step,strength*(strong?.63:.31+random()*.25));
      }
    }
    // A phrase has a recognisable pulse, changing inner detail and a final turnaround.
    if(bar===phraseBars-1 && energy!=="mellow" && random()<fill) {
      const fillLength=pick([4,6,8]);
      for(let step=Math.max(0,steps-fillLength);step<steps;step++) {
        if(random()<.75*activity) add(step%3===0?"snare":step<steps-3?"tomhigh":"tomlow",step,strength*(.48+.45*(step-(steps-fillLength))/fillLength));
      }
    }
    if(energy==="powerful" && bar===0)add("crash",0,.9);
    for(const hit of barHits)hits.push({...hit,step:bar*steps+hit.step});
  }
  return hits.sort((a,b)=>a.step-b.step||DRUM_INSTRUMENTS.indexOf(a.instrument)-DRUM_INSTRUMENTS.indexOf(b.instrument));
}

export function drumPatternBeats(data: string[], fallback: number): number {
  const span=Number(data[0]?.split("|")[3]);
  return Number.isFinite(span) && span>=1 && span<=128 ? span : fallback;
}
