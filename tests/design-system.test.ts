import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const palette = readFileSync("app/palette.css","utf8");
const blocks = [...palette.matchAll(/\{([^}]+)\}/g)].map(match=>Object.fromEntries([...match[1].matchAll(/(--[\w-]+):\s*(#[\da-f]{6,8})/gi)].map(m=>[m[1],m[2]])));
const luminance = (hex: string) => {
  const rgb = [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);
  return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];
};
const contrast=(a:string,b:string)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
for(const [name,tokens] of [["electric",blocks[0]],["crimson",{...blocks[0],...blocks[1]}]] as const){
  test(`${name} semantic text and control pairs meet contrast targets`,()=>{
    for(const background of ["--black","--surface","--surface2","--surface-hover","--accent-soft"]){
      for(const text of ["--ink","--muted"])
        assert.ok(contrast(tokens[text],tokens[background])>=4.5,`${name}: ${text} on ${background}`);
    }
    for(const [text,bg] of [["--on-accent","--mint"],["--play-ink","--play-bg"],["--pause-ink","--pause-bg"],["--warning-ink","--warning-bg"]])
      assert.ok(contrast(tokens[text],tokens[bg])>=4.5,`${name}: ${text} on ${bg}`);
    for(const bg of ["--surface","--surface2"])
      assert.ok(contrast(tokens["--control-line"],tokens[bg])>=3,`${name}: control boundary on ${bg}`);
  });
}
test("component styles cannot introduce independent literal palettes",()=>{
  for(const file of ["globals","studio","drums","theme"])
    assert.doesNotMatch(readFileSync(`app/${file}.css`,"utf8"),/#[\da-f]{3,8}\b|rgba?\(/i,file);
  for(const file of ["globals","studio","drums","theme"]){
    const css=readFileSync(`app/${file}.css`,"utf8");
    assert.doesNotMatch(css,/(--[\w-]+):\s*var\(\1\)/,`${file}: cyclic color token`);
  }
});
test("persistent section transport reserves space and covers every project tool",()=>{
  const css=readFileSync("app/theme.css","utf8"),source=readFileSync("app/InspitivityApp.tsx","utf8");
  assert.match(css,/\.section-player\{position:fixed/);
  assert.match(css,/padding-bottom:calc\(var\(--player-clearance\)/);
  assert.match(css,/env\(safe-area-inset-bottom\)/);
  assert.match(source,/selectedSectionId=\{draftSectionId\}/);
  assert.match(source,/label="current section"/);
});
