import type {Project,Idea} from './index.js';
export type PlaybackScope='song'|'section'|'part';
type Preview={data:string[];voice?:string};
/** Non-destructive view of saved parts and drafts for the single transport. */
export function playbackProject(project:Project,previews:Record<string,Preview>,sectionId:string|null,scope:PlaybackScope,part:string):Project{
  const selected=project.sections.find(s=>s.id===sectionId)??project.sections[0];
  return {...project,sections:(scope==='song'?project.sections:selected?[selected]:[]).map(section=>{
    let ideas=[...section.ideas];
    for(const type of ['drums','bass','chords','melody','riff'] as const){
      const draft=previews[`${project.id}/${section.id}/${type}`]??(section.id===selected?.id&&!sectionId?previews[`${project.id}/scratch/${type}`]:undefined);
      if(!draft)continue;
      const next:Idea={id:`preview-${type}`,type,name:`${type} draft`,detail:'',data:draft.data,voice:draft.voice};
      const index=ideas.findIndex(idea=>idea.type===type);
      if(index<0)ideas.push(next);else ideas[index]=next;
    }
    if(scope==='part')ideas=ideas.filter(idea=>idea.type===part);
    return {...section,ideas};
  })};
}
