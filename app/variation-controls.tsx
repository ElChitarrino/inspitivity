"use client";
import { useDraftState } from "./draft-session";
import type { VariationKind, VariationLocks } from "../packages/workspace/variation";
export function VariationControls<T>({ value, apply, vary, percussion=false }: {
  value: T; apply: (value:T)=>void; vary:(kind:VariationKind,locks:VariationLocks)=>T; percussion?:boolean;
}) {
  const [rhythm,setRhythm]=useDraftState("lockRhythm",true);
  const [notes,setNotes]=useDraftState("lockNotes",false);
  const [a,setA]=useDraftState<T|null>("compareA",null);
  const [b,setB]=useDraftState<T|null>("compareB",null);
  const [side,setSide]=useDraftState("compareSide","A");
  return <details className="variation-controls" aria-label="Controlled variations"><summary>Variations & comparison</summary>
    <div className="variation-heading"><b>Keep what works</b><label><input type="checkbox" checked={rhythm} onChange={e=>setRhythm(e.target.checked)} />Lock rhythm</label>
      {!percussion && <label><input type="checkbox" checked={notes} onChange={e=>setNotes(e.target.checked)} />Lock notes</label>}
    </div>
    <div className="variation-actions">{([ ["subtle","Subtle variation"], ["space","More space"], ["energy","More energy"] ] as const).map(([kind,label])=><button key={kind} disabled={!percussion && rhythm && notes} onClick={()=>{
      if(a===null)setA(value); const next=vary(kind,{rhythm,notes}); setB(next);setSide("B");apply(next);
    }}>{label}</button>)}</div>
    <div className="ab-controls"><button onClick={()=>{setA(value);setB(null);setSide("A");}}>Keep as A</button>
      <button disabled={a===null} aria-pressed={side==="A"} onClick={()=>{if(a!==null){if(side==="B")setB(value);apply(a);setSide("A");}}}>Compare A</button>
      <button disabled={b===null} aria-pressed={side==="B"} onClick={()=>{if(b!==null){apply(b);setSide("B");}}}>Compare B</button>
    </div>
    <small>{rhythm ? "Timing is locked. Unlock rhythm for fewer or extra notes." : "Rhythm can change; the phrase keeps its musical shape."}</small>
  </details>;
}
