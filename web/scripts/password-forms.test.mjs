import { Children, isValidElement } from "react";
import * as jsxRuntime from "react/jsx-runtime";

import ts from "typescript";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { runInNewContext } from "node:vm";

function compile(path) {
  return ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
}

const changePasswordForm = compile("../src/app/(main)/_components/sidebar/change-password-dialog.tsx");
const setupForm = compile("../src/app/(auth)/setup/page.tsx");
const newPassword = {};
runInNewContext(compile("../src/lib/new-password.ts"), { exports: newPassword, TextEncoder });

function findElement(element, matches) {
  if (!isValidElement(element)) return undefined;
  if (matches(element)) return element;
  for (const child of Children.toArray(element.props.children)) {
    const found = findElement(child, matches);
    if (found) return found;
  }
}

function fixture({ setup = false } = {}) {
  const exports = {};
  const state = [];
  const calls = [];
  const openChanges = [];
  const sessionTokens = [];
  const redirects = [];
  const noop = () => undefined;
  let nextState = 0;
  let mounted = false;
  const router = { replace: (path) => redirects.push(path) };
  const imports = {
    react: {
      useState(initial) {
        const index = nextState++;
        state[index] ??= initial;
        return [state[index], (next) => (state[index] = next)];
      },
      useEffect(effect) {
        if (!setup || mounted) return;
        mounted = true;
        effect();
      },
    },
    "react/jsx-runtime": jsxRuntime,
    "next/navigation": { useRouter: () => router },
    "lucide-react": { ArrowRight: "svg" },
    sonner: { toast: { success: noop, error: noop } },
    "@/components/ui/button": { Button: "button" },
    "@/components/ui/input": { Input: "input" },
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
        async authStatus() {
          return { initialized: false };
        },
        async changePassword(...args) {
          calls.push(args);
        },
        async initPassword(...args) {
          calls.push(args);
          return { token: "issued-session" };
        },
      },
    },
    "@/lib/auth": { auth: { setToken: (token) => sessionTokens.push(token) } },
    "@/lib/new-password": newPassword,
    "@/lib/utils": { cn: (...classes) => classes.filter(Boolean).join(" ") },
    "../auth.module.css": { default: {} },
  };
  runInNewContext(setup ? setupForm : changePasswordForm, { exports, TextEncoder, require: (name) => imports[name] });

  function render() {
    nextState = 0;
    return setup
      ? exports.default()
      : exports.ChangePasswordDialog({ open: true, onOpenChange: (open) => openChanges.push(open) });
  }

  const getProps = (matches) => findElement(render(), matches).props;
  const byId = (id) => getProps((element) => element.props.id === id);
  return {
    render,
    byId,
    input: (id, value) => byId(id).onChange({ target: { value } }),
    submitDisabled: () => getProps((element) => element.props.type === "submit").disabled,
    submit: () => getProps((element) => element.type === "form").onSubmit({ preventDefault: noop }),
    calls,
    openChanges,
    sessionTokens,
    redirects,
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

test("initial setup enforces the same Unicode password boundaries before calling the API", async () => {
  const form = fixture({ setup: true });
  form.render();
  await setImmediate();
  const field = () => form.byId("password");
  const descriptions = field()["aria-describedby"].split(" ");
  const hint = Children.toArray(form.byId(descriptions[0]).children).join("");
  assert.match(hint, /12 characters.*72 UTF-8 bytes/);
  assert.equal(form.byId(descriptions[1]).role, "status");
  assert.notEqual(field()["aria-invalid"], true);

  form.input("setup-token", "test-setup-token");
  for (const [characters, invalid] of [
    [11, true],
    [12, false],
    [18, false],
    [19, true],
  ]) {
    const password = "😀".repeat(characters);
    form.input("password", password);
    form.input("confirm", password);
    assert.equal(Boolean(field()["aria-invalid"]), invalid);
    assert.equal(form.submitDisabled(), invalid);
  }
  await form.submit();
  assert.equal(form.calls.length, 0);
});

test("initial setup explains confirmation errors and signs in with the issued session", async () => {
  const form = fixture({ setup: true });
  form.render();
  await setImmediate();
  const confirmation = () => form.byId("confirm");
  const feedback = () => form.byId(confirmation()["aria-describedby"]);
  assert.equal(feedback().role, "status");

  const password = "😀".repeat(18);
  form.input("password", password);
  form.input("confirm", "does not match");
  assert.equal(confirmation()["aria-invalid"], true);
  assert.match(feedback().children, /do not match/);
  assert.equal(form.submitDisabled(), true);

  form.input("confirm", password);
  assert.notEqual(confirmation()["aria-invalid"], true);
  assert.match(feedback().children, /Passwords match/);
  assert.equal(form.submitDisabled(), true);
  form.input("setup-token", "  test-setup-token  ");
  assert.equal(form.submitDisabled(), false);
  await form.submit();
  assert.deepEqual(form.calls, [[password, "test-setup-token"]]);
  assert.deepEqual(form.sessionTokens, ["issued-session"]);
  assert.deepEqual(form.redirects, ["/function/tasks"]);
});
