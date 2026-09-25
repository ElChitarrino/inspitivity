import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";

const css=readFileSync("app/workspace.css","utf8");
const app=readFileSync("app/InspitivityApp.tsx","utf8");

test("desktop transport exposes one song and section selector beside playback actions",()=>{
  assert.match(app,/<label className="transport-destination">/);
  assert.match(app,/<optgroup label="Full song">/);
  assert.match(app,/<optgroup label="Sections">/);
  assert.match(css,/\.section-player \.section-player-heading \.transport-destination \{ flex:1 1 240px; min-width:0; \}/);
  assert.doesNotMatch(app,/className="transport-scope"|className="mobile-transport-scope"/);
});

test("tablet selector occupies the complete first transport row",()=>{
  const tablet=css.slice(css.lastIndexOf("@media(max-width:1100px)"),css.lastIndexOf("@media(max-width:700px)"));
  assert.match(tablet,/\.section-player \.section-player-heading>\.transport-destination \{ grid-column:1\/5; grid-row:1; \}/);
  assert.match(tablet,/\.section-player \.section-player-heading>\.play-control \{ grid-column:1; grid-row:2;/);
  assert.match(tablet,/\.section-player \.transport-preferences \{ grid-column:4; grid-row:2; \}/);
});

test("phone keeps the song selector and equal play/options targets in its fixed transport",()=>{
  const phone=css.slice(css.indexOf("/* Final narrow-screen overrides"));
  assert.match(phone,/grid-template-columns:minmax\(0,1fr\) 44px 44px;grid-template-rows:44px auto 3px/);
  assert.match(phone,/\.section-player \.section-player-heading>\.transport-destination \{ grid-column:1; grid-row:1; \}/);
  assert.match(phone,/\.section-player \.transport-preferences>summary \{ width:44px;min-width:44px;height:44px;min-height:44px/);
  assert.match(phone,/\.play-control \{ grid-column:2;grid-row:1;width:44px!important;min-width:44px!important;max-width:44px;height:44px;min-height:44px/);
  assert.match(phone,/\.topbar \.back-button \{ display:grid; place-items:center; flex:0 0 46px; width:46px; height:46px/);
  assert.match(readFileSync("app/theme.css","utf8"),/\.studio-nav-toggle\{display:grid;place-items:center;position:fixed;[^}]*width:46px;height:46px/);
});
