import ts from "typescript";

import * as layout from "../src/lib/preferences/layout.ts";
import * as theme from "../src/lib/preferences/theme.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const code = ts.transpileModule(
  readFileSync(new URL("../src/lib/preferences/appearance-file.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;
const imports = {
  "@/lib/fonts/registry": { fontRegistry: { geist: {}, inter: {} } },
  "./layout": layout,
  "./theme": theme,
};
const exports = {};
runInNewContext(code, { exports, require: (name) => imports[name] });
const { parseAppearanceFile, serializeAppearanceFile } = exports;

const preferences = {
  theme_mode: "system",
  theme_preset: "tangerine",
  font: "inter",
  ui_scale: "extra-large",
  content_layout: "centered",
  navbar_style: "scroll",
  sidebar_variant: "floating",
  sidebar_collapsible: "offcanvas",
  motion: "reduce",
};
const file = { format: "superartex-appearance", version: 2, preferences };

test("appearance settings round-trip with only the supported appearance fields", () => {
  const text = serializeAppearanceFile({ ...preferences, unrelated: "outside the appearance preferences" });
  assert.deepEqual(JSON.parse(text), file);
  assert.deepEqual({ ...parseAppearanceFile(text) }, preferences);
});

test("appearance import rejects incomplete or unrecognized envelopes", () => {
  assert.equal(parseAppearanceFile("not JSON"), null);
  for (const invalid of [
    null,
    [file],
    { ...file, format: "other" },
    { ...file, version: 3 },
    { ...file, version: "2" },
    { ...file, extra: true },
    { ...file, preferences: [] },
    { ...file, preferences: { theme_mode: "dark" } },
    { ...file, preferences: { ...preferences, extra: true } },
  ]) {
    assert.equal(parseAppearanceFile(JSON.stringify(invalid)), null);
  }
});

test("appearance import accepts complete legacy files without changing the current motion setting", () => {
  const { motion: _motion, ...legacyPreferences } = preferences;
  const legacy = { ...file, version: 1, preferences: legacyPreferences };
  assert.deepEqual({ ...parseAppearanceFile(JSON.stringify(legacy)) }, legacyPreferences);
  assert.equal(parseAppearanceFile(JSON.stringify({ ...legacy, preferences })), null);
  assert.equal(parseAppearanceFile(JSON.stringify({ ...file, preferences: legacyPreferences })), null);
});

test("appearance import validates every registered preference and rejects a replaced key", () => {
  for (const key of Object.keys(preferences)) {
    const invalid = { ...file, preferences: { ...preferences, [key]: "unrecognized" } };
    assert.equal(parseAppearanceFile(JSON.stringify(invalid)), null, key);
  }
  const { theme_mode: _removed, ...incomplete } = preferences;
  const replaced = { ...file, preferences: { ...incomplete, unrelated: "dark" } };
  assert.equal(parseAppearanceFile(JSON.stringify(replaced)), null);
  assert.equal(parseAppearanceFile(JSON.stringify({ ...file, preferences: { ...preferences, ui_scale: 1 } })), null);
});
