import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { isUiLanguage, translateUi } from "../app/i18n.js";

test("English remains the default source and German labels are reversible", () => {
  assert.equal(translateUi("Settings", "en"), "Settings");
  assert.equal(translateUi(" Settings ", "de"), " Einstellungen ");
  assert.equal(translateUi("Metronome", "de"), "Metronom");
  assert.equal(translateUi("A user-written song title", "de"), "A user-written song title");
  assert.equal(translateUi("Intro · loop", "de"), "Intro · wiederholen");
  assert.equal(translateUi("Intro · play once", "de"), "Intro · einmal abspielen");
  assert.equal(translateUi("Return to", "de"), "Zurück zu");
  assert.equal(translateUi("9 beats · one bar", "de"), "9 Schläge · ein Takt");
  assert.equal(translateUi("Draft history", "de"), "Entwurfsverlauf");
  assert.equal(isUiLanguage("en"), true);
  assert.equal(isUiLanguage("de"), true);
  assert.equal(isUiLanguage("fr"), false);
});

test("settings persist the language and the sidebar exposes a metronome shortcut", async () => {
  const source = await readFile(resolve(process.cwd(), "app/InspitivityApp.tsx"), "utf8");
  assert.match(source, /localStorage\.setItem\(LANGUAGE_STORAGE_KEY, next\)/);
  assert.match(source, /observeUiLanguage\(appRef\.current, language\)/);
  assert.match(source, /aria-pressed=\{language === "en"\}/);
  assert.match(source, /aria-pressed=\{language === "de"\}/);
  assert.match(source, /\["metronome", "♩", "Metronome"\]/);
});
