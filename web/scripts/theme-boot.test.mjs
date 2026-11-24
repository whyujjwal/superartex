import { jsx } from "react/jsx-runtime";

import ts from "typescript";

import * as layout from "../src/lib/preferences/layout.ts";
import * as config from "../src/lib/preferences/preferences-config.ts";
import * as theme from "../src/lib/preferences/theme.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const compiled = ts.transpileModule(readFileSync(new URL("../src/scripts/theme-boot.tsx", import.meta.url), "utf8"), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
}).outputText;

const imports = {
  "react/jsx-runtime": { jsx },
  "@/lib/fonts/registry": { fontRegistry: { geist: {}, inter: {} } },
  "@/lib/preferences/layout": layout,
  "@/lib/preferences/preferences-config": config,
  "@/lib/preferences/theme": theme,
};
const exports = {};
runInNewContext(compiled, {
  exports,
  require: (name) => imports[name],
});

function loadAppearance(cookie, prefersDark = false) {
  const attributes = {};
  const root = {
    setAttribute: (name, value) => {
      attributes[name] = value;
    },
    classList: {
      toggle: (name, enabled) => {
        root[name] = enabled;
      },
    },
    style: {},
  };

  runInNewContext(exports.ThemeBootScript().props.dangerouslySetInnerHTML.__html, {
    document: { cookie, documentElement: root },
    window: { matchMedia: () => ({ matches: prefersDark }) },
  });

  return { attributes, dark: root.dark, colorScheme: root.style.colorScheme };
}

test("a malformed preset cookie falls back without discarding saved dark mode or font", () => {
  const { attributes, dark, colorScheme } = loadAppearance("theme_mode=dark; theme_preset=%; font=inter");

  assert.equal(attributes["data-theme-preset"], "default");
  assert.equal(attributes["data-theme-mode"], "dark");
  assert.equal(attributes["data-font"], "inter");
  assert.equal(dark, true);
  assert.equal(colorScheme, "dark");
});

test("obsolete layout and font preferences revert to their defaults on load", () => {
  const { attributes } = loadAppearance("content_layout=old-layout; font=old-font; navbar_style=scroll");

  assert.equal(attributes["data-content-layout"], "full-width");
  assert.equal(attributes["data-font"], "geist");
  assert.equal(attributes["data-navbar-style"], "scroll");
});

test("system appearance still follows the browser color scheme", () => {
  const { attributes, dark, colorScheme } = loadAppearance("theme_mode=system; theme_preset=soft%2Dpop", true);

  assert.equal(attributes["data-theme-mode"], "system");
  assert.equal(attributes["data-theme-preset"], "soft-pop");
  assert.equal(dark, true);
  assert.equal(colorScheme, "dark");
});

test("a saved UI scale is applied before hydration", () => {
  const { attributes } = loadAppearance("ui_scale=large; navbar_style=scroll");

  assert.equal(attributes["data-ui-scale"], "large");
  assert.equal(attributes["data-navbar-style"], "scroll");
});

test("missing or unsupported UI scale uses the standard size", () => {
  assert.equal(loadAppearance("").attributes["data-ui-scale"], "standard");
  assert.equal(loadAppearance("ui_scale=huge").attributes["data-ui-scale"], "standard");
});

test("saved motion reduction applies before hydration and invalid settings fall back to the system", () => {
  assert.equal(loadAppearance("motion=reduce").attributes["data-motion"], "reduce");
  assert.equal(loadAppearance("").attributes["data-motion"], "system");
  assert.equal(loadAppearance("motion=always").attributes["data-motion"], "system");
});
