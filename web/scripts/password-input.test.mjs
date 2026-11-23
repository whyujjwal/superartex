import { Children, isValidElement } from "react";
import * as jsxRuntime from "react/jsx-runtime";

import ts from "typescript";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const compiled = ts.transpileModule(
  readFileSync(new URL("../src/components/ui/password-input.tsx", import.meta.url), "utf8"),
  { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } },
).outputText;

function renderPasswordInput(props = {}) {
  const exports = {};
  const state = [];
  let nextState = 0;
  const imports = {
    react: {
      useState(initial) {
        const index = nextState++;
        state[index] ??= initial;
        return [state[index], (next) => (state[index] = typeof next === "function" ? next(state[index]) : next)];
      },
    },
    "react/jsx-runtime": jsxRuntime,
    "lucide-react": { Eye: () => null, EyeOff: () => null },
    "@/components/ui/button": { Button: "button" },
    "@/components/ui/input": { Input: "input" },
    "@/lib/utils": { cn: (...classes) => classes.filter(Boolean).join(" ") },
  };
  runInNewContext(compiled, { exports, require: (name) => imports[name] });
  return () => {
    nextState = 0;
    return exports.PasswordInput({ id: "password", ...props });
  };
}

function findElement(element, matches) {
  if (!isValidElement(element)) return undefined;
  if (matches(element)) return element;
  for (const child of Children.toArray(element.props.children)) {
    const found = findElement(child, matches);
    if (found) return found;
  }
}

function capsLockEvent(on) {
  return { getModifierState: (key) => key === "CapsLock" && on };
}

test("Caps Lock feedback updates on keydown and keyup and clears on blur", () => {
  const render = renderPasswordInput();
  const input = () => findElement(render(), (element) => element.type === "input").props;
  const hint = () => findElement(render(), (element) => element.props.role === "status")?.props.children;

  input().onKeyDown?.(capsLockEvent(true));
  assert.equal(hint(), "Caps Lock is on");

  input().onKeyUp(capsLockEvent(false));
  assert.equal(hint(), "");

  input().onKeyDown(capsLockEvent(true));
  input().onBlur({});
  assert.equal(hint(), "");
});

test("keyboard and focus callbacks still fire and the password can be revealed", () => {
  const events = [];
  const render = renderPasswordInput({
    onFocus: () => events.push("focus"),
    onKeyDown: () => events.push("keydown"),
    onKeyUp: () => events.push("keyup"),
    onBlur: () => events.push("blur"),
  });
  const input = findElement(render(), (element) => element.type === "input").props;
  const reveal = findElement(render(), (element) => element.type === "button").props;

  input.onFocus({});
  input.onKeyDown(capsLockEvent(true));
  input.onKeyUp(capsLockEvent(false));
  input.onBlur({});
  assert.deepEqual(events, ["focus", "keydown", "keyup", "blur"]);
  assert.equal(input.type, "password");

  reveal.onClick();
  assert.equal(findElement(render(), (element) => element.type === "input").props.type, "text");
});
