import { createMultitrackMidi } from "../midi/index.js";
import { buildSongPlan, type SongLayer } from "./music.js";
import type { Project } from "./index.js";

const trackSettings:Record<SongLayer,{name:string;channel:number;program:number}>={
  drums:{name:"Drums",channel:9,program:0},
  bass:{name:"Bass",channel:1,program:33},
  chords:{name:"Chords",channel:2,program:25},
  melody:{name:"Melody",channel:3,program:73},
  riff:{name:"Pattern",channel:4,program:80},
};
const programs:Record<string,number>={
  "air flute":73,"warm pad":89,glass:98,pluck:84,"analog pulse":80,
  "deep bass":33,"808 bass":38,"sub bass":39,"acoustic guitar":24,"distorted guitar":30,
};

/** Saved song, section repeats and meter changes included; no draft parts are invented. */
export function exportSongMidi(project:Project):Uint8Array {
  const plan=buildSongPlan(project);
  const tracks=(Object.keys(trackSettings) as SongLayer[]).flatMap(layer=>{
    const events=plan.events.filter(event=>event.layer===layer);
    if(!events.length)return [];
    const setting=trackSettings[layer];
    const voice=events.find(event=>event.voice)?.voice;
    return [{...setting,program:layer==="drums"?0:programs[voice??""]??setting.program,
      notes:events.map(event=>({pitch:event.pitch,start:event.start,duration:event.duration,velocity:event.velocity}))}];
  });
  return createMultitrackMidi({name:project.name,tracks,markers:plan.markers,length:plan.quarters});
}
