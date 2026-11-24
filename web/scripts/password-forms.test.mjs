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
const passwordInputCode = compile("../src/components/ui/password-input.tsx");
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

function fixture({ setup = false, changePassword = async () => undefined } = {}) {
  const exports = {};
  const passwordInput = {};
  const state = [];
  const calls = [];
  const openChanges = [];
  const sessionTokens = [];
  const redirects = [];
  const toasts = [];
  const noop = () => undefined;
  let nextState = 0;
  let mounted = false;
  let open = true;
  let passiveDependencies = [];
  let layoutOpen;
  let layoutCleanup;
  const router = { replace: (path) => redirects.push(path) };
  const imports = {
    react: {
      useState(initial) {
        const index = nextState++;
        state[index] ??= initial;
        return [state[index], (next) => (state[index] = typeof next === "function" ? next(state[index]) : next)];
      },
      useEffect(effect, dependencies) {
        if (setup) {
          if (mounted) return;
          mounted = true;
        } else {
          if (dependencies.every((value, index) => value === passiveDependencies[index])) return;
          passiveDependencies = dependencies;
        }
        effect();
      },
      useRef(initial) {
        const index = nextState++;
        state[index] ??= { current: initial };
        return state[index];
      },
      useLayoutEffect(effect, [nextOpen]) {
        if (layoutOpen === nextOpen) return;
        layoutCleanup?.();
        layoutOpen = nextOpen;
        layoutCleanup = effect();
      },
    },
    "react/jsx-runtime": jsxRuntime,
    "next/navigation": { useRouter: () => router },
    "lucide-react": { ArrowRight: "svg", Eye: "svg", EyeOff: "svg" },
    sonner: { toast: { success: (message) => toasts.push(message), error: (message) => toasts.push(message) } },
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
    "@/components/ui/password-input": passwordInput,
    "@/lib/api": {
      api: {
        async authStatus() {
          return { initialized: false };
        },
        async changePassword(...args) {
          calls.push(args);
          await changePassword();
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
  runInNewContext(passwordInputCode, { exports: passwordInput, require: (name) => imports[name] });
  runInNewContext(setup ? setupForm : changePasswordForm, {
    exports,
    TextEncoder,
    Error,
    require: (name) => imports[name],
  });

  function render() {
    nextState = 0;
    return setup
      ? exports.default()
      : exports.ChangePasswordDialog({ open, onOpenChange: (next) => openChanges.push(next) });
  }

  const getProps = (matches) => findElement(render(), matches).props;
  const byId = (id) => getProps((element) => element.props.id === id);
  return {
    render,
    byId,
    setOpen(next) {
      open = next;
      render();
    },
    alert: () => findElement(render(), (element) => element.props.role === "alert")?.props,
    submitButton: () => getProps((element) => element.props.type === "submit"),
    passwordField(id) {
      const field = findElement(render(), (element) => element.props.id === id);
      assert.equal(field.type, passwordInput.PasswordInput, `${id} should use the shared masked input`);
      return field.type(field.props);
    },
    input: (id, value) => byId(id).onChange({ target: { value } }),
    submitDisabled: () => getProps((element) => element.props.type === "submit").disabled,
    submit: () => getProps((element) => element.type === "form").onSubmit({ preventDefault: noop }),
    calls,
    openChanges,
    sessionTokens,
    redirects,
    toasts,
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
  await setImmediate();
  assert.deepEqual(dialog.calls, [["legacy", "a new password"]]);
  assert.deepEqual(dialog.openChanges, [false]);
});

test("change password keeps a wrong-current-password error inline and preserves values for retry", async () => {
  let attempts = 0;
  const dialog = fixture({
    async changePassword() {
      if (++attempts === 1) throw new Error("Current password is wrong");
    },
  });
  dialog.input("cp-old", "legacy");
  dialog.input("cp-new", "a new password");
  dialog.input("cp-confirm", "a new password");
  let focusCount = 0;
  dialog.byId("cp-old").ref.current = { focus: () => focusCount++ };
  dialog.submit();
  await setImmediate();

  const current = () => dialog.byId("cp-old");
  assert.equal(dialog.alert()?.children, "Current password is wrong");
  assert.equal(current()["aria-describedby"], dialog.alert().id);
  assert.equal(current()["aria-invalid"], true);
  assert.equal(focusCount, 1);
  assert.equal(current().value, "legacy");
  assert.equal(dialog.byId("cp-new").value, "a new password");
  assert.equal(dialog.byId("cp-confirm").value, "a new password");
  assert.deepEqual(dialog.toasts, []);
  assert.deepEqual(dialog.openChanges, []);
  assert.equal(dialog.submitDisabled(), false);

  dialog.input("cp-new", "a different password");
  dialog.input("cp-confirm", "a different password");
  assert.equal(current()["aria-invalid"], true);
  dialog.input("cp-old", "correct password");
  assert.equal(dialog.alert(), undefined);
  assert.notEqual(current()["aria-invalid"], true);
  dialog.submit();
  await setImmediate();
  assert.deepEqual(dialog.calls[1], ["correct password", "a different password"]);
  assert.deepEqual(dialog.openChanges, [false]);
  assert.deepEqual(dialog.toasts, ["Password changed"]);
});

test("a change request from a closed dialog cannot show an error when reopened", async () => {
  const pending = Promise.withResolvers();
  const dialog = fixture({ changePassword: () => pending.promise });
  dialog.input("cp-old", "legacy");
  dialog.input("cp-new", "a new password");
  dialog.input("cp-confirm", "a new password");
  dialog.submit();
  dialog.setOpen(false);
  dialog.setOpen(true);
  pending.reject(new Error("Current password is wrong"));
  await setImmediate();

  assert.equal(dialog.alert(), undefined);
  assert.deepEqual(dialog.toasts, []);
  assert.deepEqual(dialog.openChanges, []);
  assert.equal(dialog.byId("cp-old").value, "");
});

test("a change request from a closed dialog cannot close a reopened dialog on success", async () => {
  const pending = Promise.withResolvers();
  const dialog = fixture({ changePassword: () => pending.promise });
  dialog.input("cp-old", "legacy");
  dialog.input("cp-new", "a new password");
  dialog.input("cp-confirm", "a new password");
  dialog.submit();
  dialog.setOpen(false);
  dialog.setOpen(true);
  pending.resolve();
  await setImmediate();

  assert.deepEqual(dialog.openChanges, []);
  assert.deepEqual(dialog.toasts, []);
});

test("change password shows safe service errors inline and keeps internal errors private", async () => {
  for (const [message, expected] of [
    [
      "Data source temporarily unavailable, please retry later",
      "Data source temporarily unavailable, please retry later",
    ],
    ["Could not save the password. Please try again.", "Could not save the password. Please try again."],
    ["Save failed: private storage detail", "Unable to change the password. Please try again."],
  ]) {
    const dialog = fixture({
      async changePassword() {
        throw new Error(message);
      },
    });
    dialog.input("cp-old", "legacy");
    dialog.input("cp-new", "a new password");
    dialog.input("cp-confirm", "a new password");
    let focusCount = 0;
    dialog.submitButton().ref.current = { focus: () => focusCount++ };
    dialog.submit();
    await setImmediate();

    assert.equal(dialog.alert()?.children, expected);
    assert.notEqual(dialog.byId("cp-old")["aria-invalid"], true);
    assert.equal(dialog.submitButton().children, "Retry change");
    assert.equal(focusCount, 1);
    dialog.input("cp-new", "a different password");
    assert.equal(dialog.alert(), undefined);
  }
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

test("initial setup masks the focused token and lets the user reveal it", async () => {
  const form = fixture({ setup: true });
  assert.equal(
    findElement(form.render(), (element) => element.props.id === "setup-token"),
    undefined,
  );
  await setImmediate();
  const tokenId = "setup-token";
  const label = findElement(form.render(), (element) => element.props.htmlFor === tokenId);
  assert.equal(label.props.children, "Setup token");
  const tokenField = () => form.passwordField(tokenId);
  const input = () => findElement(tokenField(), (element) => element.type === "input").props;
  const reveal = () => findElement(tokenField(), (element) => element.props["aria-controls"] === tokenId).props;
  assert.equal(input().autoFocus, true);
  assert.equal(input().autoComplete, "off");
  assert.equal(input().type, "password");
  assert.equal(reveal().type, "button");
  assert.equal(reveal()["aria-label"], "Show setup token");

  form.input(tokenId, "  test-setup-token  ");
  reveal().onClick();
  assert.equal(input().type, "text");
  assert.equal(input().value, "  test-setup-token  ");
  assert.equal(reveal()["aria-label"], "Hide setup token");
  reveal().onClick();
  assert.equal(input().type, "password");
  assert.deepEqual(form.calls, []);
  assert.deepEqual(form.sessionTokens, []);
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
