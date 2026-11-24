import { Children, isValidElement } from "react";
import * as jsxRuntime from "react/jsx-runtime";

import ts from "typescript";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const compiled = ts.transpileModule(
  readFileSync(new URL("../src/app/(main)/_components/sidebar/change-password-dialog.tsx", import.meta.url), "utf8"),
  {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;

function findElement(element, matches) {
  if (!isValidElement(element)) return undefined;
  if (matches(element)) return element;
  for (const child of Children.toArray(element.props.children)) {
    const found = findElement(child, matches);
    if (found) return found;
  }
}

function fixture() {
  const exports = {};
  const state = [];
  const calls = [];
  const openChanges = [];
  const noop = () => undefined;
  let nextState = 0;
  const imports = {
    react: {
      useState(initial) {
        const index = nextState++;
        state[index] ??= initial;
        return [state[index], (next) => (state[index] = next)];
      },
      useEffect: noop,
    },
    "react/jsx-runtime": jsxRuntime,
    sonner: { toast: { success: noop, error: noop } },
    "@/components/ui/button": { Button: "button" },
    "@/components/ui/dialog": {
      Dialog: "div",
      DialogContent: "div",
      DialogDescription: "p",
      DialogFooter: "footer",
      DialogHeader: "header",
      DialogTitle: "h2",
    },
    "@/components/ui/label": { Label: "label" },
    "@/components/ui/password-input": { PasswordInput: "input" },
    "@/lib/api": {
      api: {
        async changePassword(...args) {
          calls.push(args);
        },
      },
    },
    "@/lib/utils": { cn: (...classes) => classes.filter(Boolean).join(" ") },
  };
  runInNewContext(compiled, { exports, TextEncoder, require: (name) => imports[name] });

  function getProps(matches) {
    nextState = 0;
    const dialog = exports.ChangePasswordDialog({ open: true, onOpenChange: (open) => openChanges.push(open) });
    return findElement(dialog, matches).props;
  }

  const byId = (id) => getProps((element) => element.props.id === id);
  return {
    byId,
    input: (id, value) => byId(id).onChange({ target: { value } }),
    submitDisabled: () => getProps((element) => element.props.type === "submit").disabled,
    submit: () => getProps((element) => element.type === "form").onSubmit({ preventDefault: noop }),
    calls,
    openChanges,
  };
}

test("new password guidance applies the server's character and UTF-8 byte limits", () => {
  const dialog = fixture();
  const field = () => dialog.byId("cp-new");
  const descriptions = field()["aria-describedby"].split(" ");
  const hint = Children.toArray(dialog.byId(descriptions[0]).children).join("");
  assert.match(hint, /12 characters.*72 UTF-8 bytes/);
  assert.notEqual(field()["aria-invalid"], true);

  dialog.input("cp-old", "legacy");
  for (const [characters, invalid] of [
    [11, true],
    [12, false],
    [18, false],
    [19, true],
  ]) {
    const password = "😀".repeat(characters);
    dialog.input("cp-new", password);
    dialog.input("cp-confirm", password);
    assert.equal(Boolean(field()["aria-invalid"]), invalid);
    assert.equal(dialog.submitDisabled(), invalid);
  }
  dialog.submit();
  assert.equal(dialog.calls.length, 0);
});

test("confirmation feedback clears when passwords match and only two values are submitted", async () => {
  const dialog = fixture();
  const confirmation = () => dialog.byId("cp-confirm");
  const feedback = () => dialog.byId(confirmation()["aria-describedby"]);
  assert.equal(feedback().role, "status");

  dialog.input("cp-old", "legacy");
  dialog.input("cp-new", "a new password");
  dialog.input("cp-confirm", "a wrong password");
  assert.equal(confirmation()["aria-invalid"], true);
  assert.match(feedback().children, /do not match/);
  assert.equal(dialog.submitDisabled(), true);

  dialog.input("cp-confirm", "a new password");
  assert.notEqual(confirmation()["aria-invalid"], true);
  assert.match(feedback().children, /Passwords match/);
  assert.equal(dialog.submitDisabled(), false);
  dialog.submit();
  await Promise.resolve();
  assert.deepEqual(dialog.calls, [["legacy", "a new password"]]);
  assert.deepEqual(dialog.openChanges, [false]);
});
