import type { Project, SongSection } from "./index.js";

export type ArrangementAction = "add_section" | "create_return" | "shape_energy" | "add_foundation";
export type ArrangementInsight = {
  id: "form" | "return" | "energy" | "foundation";
  title: string;
  detail: string;
  action: ArrangementAction;
  sectionId?: string;
  tool?: "chords" | "drums" | "bass";
};

const musicalLayers = (section: SongSection) =>
  new Set(section.ideas.filter((idea) => ["chords","drums","bass","melody","riff"].includes(idea.type)).map((idea) => idea.type));

const sectionStem = (name: string) =>
  name.toLowerCase().replace(/\b(return(?: of)?|variation|copy|reprise|[a-d]|\d+)\b/g, "").replace(/[^a-z]+/g, " ").trim();
const sectionSignature = (section: SongSection) => {
  const chords=section.ideas.find(idea=>idea.type==="chords")?.data?.map(value=>value.split("|")[0]) ?? [];
  const lead=section.ideas.find(idea=>idea.type==="melody"||idea.type==="riff");
  const pitches=lead?.data?.slice(0,8).map(value=>value.split("|")[lead.type==="melody"?3:0]) ?? [];
  return chords.length ? JSON.stringify([chords,lead?.type,pitches]) : "[]";
};

export function analyzeArrangement(project: Project): { ready: boolean; insights: ArrangementInsight[] } {
  const sections=project.sections;
  const insights: ArrangementInsight[]=[];
  if(sections.length<3) insights.push({
    id:"form",title:"The song needs another destination",detail:"Add a contrasting section before polishing individual parts.",action:"add_section",
  });
  if(sections.length>=3) {
    const stems=sections.map((section)=>sectionStem(section.name)).filter(Boolean);
    const namedReturn=new Set(stems).size<stems.length;
    const signatures=sections.map(sectionSignature).filter((signature)=>signature!=="[]");
    const contentReturn=new Set(signatures).size<signatures.length;
    const repeated=sections.some((section)=>(section.repeats??1)>1);
    if(!namedReturn&&!contentReturn&&!repeated) {
      const source=[...sections].sort((a,b)=>musicalLayers(b).size-musicalLayers(a).size)[0];
      insights.push({id:"return",title:"Nothing returns yet",detail:"Bring back the strongest section so the listener has something recognizable to hold onto.",action:"create_return",sectionId:source?.id});
    }
    const energies=new Set(sections.map((section)=>section.energy??"balanced"));
    if(energies.size===1) insights.push({id:"energy",title:"The energy curve is flat",detail:"Create a restrained opening, a stable middle and a stronger final section.",action:"shape_energy"});
  }
  const coverageTarget=Math.max(1,Math.ceil(sections.length*.6));
  const foundationNeeds=[
    {tool:"drums" as const,present:(section:SongSection)=>musicalLayers(section).has("drums")},
    {tool:"bass" as const,present:(section:SongSection)=>musicalLayers(section).has("bass")},
    {tool:"chords" as const,present:(section:SongSection)=>musicalLayers(section).has("chords")||musicalLayers(section).has("riff")},
  ];
  const missingFoundation=foundationNeeds.find(need=>sections.filter(need.present).length<coverageTarget);
  const foundation=missingFoundation ? sections.find(section=>!missingFoundation.present(section)) : undefined;
  if(foundation&&missingFoundation) {
    const tool=missingFoundation.tool;
    insights.push({id:"foundation",title:`${foundation.name} has no ${tool}`,detail:"Add the missing foundation before adding more decorative layers.",action:"add_foundation",sectionId:foundation.id,tool});
  }
  return {ready:insights.length===0,insights:insights.slice(0,3)};
}
