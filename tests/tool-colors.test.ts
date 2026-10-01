import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";

const luminance=(hex:string)=>{
  const rgb=hex.match(/[0-9a-f]{2}/gi)!.map(value=>parseInt(value,16)/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);
  return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
};
const ratio=(a:string,b:string)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
const mix=(accent:string,surface:string,weight:number)=>"#"+accent.match(/[0-9a-f]{2}/gi)!.map((value,index)=>Math.round(parseInt(value,16)*weight+parseInt(surface.match(/[0-9a-f]{2}/gi)![index],16)*(1-weight)).toString(16).padStart(2,"0")).join("");
test("tool identity accents and normal text retain contrast in both themes",async()=>{
  const css=await readFile("app/palette.css","utf8");
  const sections=css.split('html[data-theme="crimson"]');
  const tokens=(text:string)=>Object.fromEntries([...text.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6});/gi)].map(match=>[match[1],match[2]]));
  const electric=tokens(sections[0]),crimson={...electric,...tokens(sections[1])};
  for(const palette of [electric,crimson])for(const ink of ["ink","muted","violet","amber","blue","coral"])for(const surface of ["black","surface","surface2"]){
    assert.ok(ratio(palette[ink],palette[surface])>=4.5,`${ink} on ${surface}`);
  }
  for(const palette of [electric,crimson])for(const accent of ["violet","amber","blue","coral"]){
    assert.ok(ratio(palette[accent],mix(palette[accent],palette.surface,.18))>=4.5,`${accent} on tinted icon`);
    for(const ink of ["ink","muted"])assert.ok(ratio(palette[ink],mix(palette[accent],palette.surface,.18))>=4.5,`${ink} on tinted panel`);
  }
});
