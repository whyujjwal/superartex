import ts from "typescript";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const origin = "https://superartex.test";
const reportPath = "/function/tasks/detail?id=42&tab=report";
const loginPath = "/login?returnTo=%2Ffunction%2Ftasks%2Fdetail%3Fid%3D42%26tab%3Dreport";

function loadModule(file, imports, globals = {}) {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  runInNewContext(compiled, { exports, require: (name) => imports[name] ?? {}, URL, URLSearchParams, ...globals });
  return exports;
}

const redirects = loadModule("src/lib/auth-redirects.ts", {});

function proxyLocation(path, token) {
  const { proxy } = loadModule(
    "src/proxy.ts",
    {
      "next/server": { NextResponse: { redirect: (url) => url.href, next: () => null } },
      "@/lib/auth-redirects": redirects,
    },
    { process: { env: { NEXT_PUBLIC_MOCK: "0" } } },
  );
  const nextUrl = new URL(path, origin);
  return proxy({ nextUrl, url: nextUrl.href, cookies: { get: () => ({ value: token }) } });
}

test("the Next proxy preserves only explicit report entry on the way to sign-in", () => {
  assert.equal(proxyLocation(reportPath), origin + loginPath);
  assert.equal(proxyLocation("/function/tasks/detail?id=42&tab=overview"), `${origin}/login`);
  assert.equal(proxyLocation(`${reportPath}&other=1`), `${origin}/login`);
  assert.equal(proxyLocation(reportPath, "existing-session"), null);
});

test("an already signed-in visitor can resume the report from the login URL", () => {
  assert.equal(proxyLocation(loginPath, "existing-session"), origin + reportPath);
  assert.equal(proxyLocation("/login", "existing-session"), `${origin}/function/tasks`);
  assert.equal(proxyLocation(loginPath.replace("/login", "/setup"), "existing-session"), `${origin}/function/tasks`);
});

test("return destinations are rebuilt with only the task ID and report tab", () => {
  const unordered = "/function/tasks/detail/?tab=report&id=9223372036854775807";
  const search = new URL(redirects.getLoginPath(unordered), origin).search;
  assert.equal(redirects.getLoginDestination(search), "/function/tasks/detail/?id=9223372036854775807&tab=report");
});

test("login ignores untrusted, ambiguous and unsupported return destinations", () => {
  const path = "/function/tasks/detail";
  for (const invalid of [
    origin + reportPath,
    `//superartex.test${reportPath}`,
    `/${path}?id=42&tab=report`,
    `${path}/../detail?id=42&tab=report`,
    `${path}??id=42&tab=report`,
    `${path}?id=42&&tab=report`,
    `${path}?id=42`,
    `${path}?id=42&tab=overview`,
    `${path}?id=42&id=43&tab=report`,
    `${path}?id=42&tab=report&tab=overview`,
    `${path}?id=42%0A&tab=report`,
    `${path}?id=042&tab=report`,
    `${path}?id=0&tab=report`,
    `${path}?id=9223372036854775808&tab=report`,
    `${reportPath}#section`,
    `${reportPath}&other=1`,
  ]) {
    assert.equal(redirects.getLoginPath(invalid), "/login", invalid);
    assert.equal(
      redirects.getLoginDestination(`?${new URLSearchParams({ returnTo: invalid })}`),
      "/function/tasks",
      invalid,
    );
  }
  const search = new URL(loginPath, origin).search;
  assert.equal(
    redirects.getLoginDestination(`${search}&returnTo=${encodeURIComponent(reportPath)}`),
    "/function/tasks",
  );
  assert.equal(redirects.getLoginDestination(`${search}&other=1`), "/function/tasks");
});

function mountProtectedLayout(path, token) {
  const { pathname, search, hash } = new URL(path, origin);
  const events = [];
  const location = {
    pathname,
    search,
    hash,
    href: "",
    replace: (destination) => events.push(destination),
  };
  const window = Object.assign(new EventTarget(), { location });
  let storedToken = token;
  let onCrossTabSignOut;
  const effects = [];
  const { default: Layout } = loadModule(
    "src/app/(main)/layout.tsx",
    {
      react: {
        useState: (initial) => [initial, (value) => events.push(value ? "shown" : "hidden")],
        useEffect: (effect) => effects.push(effect),
      },
      "react-dom": {
        flushSync(render) {
          events.push("flush");
          render();
        },
      },
      "@/lib/auth": {
        auth: {
          getToken: () => storedToken,
          clearToken: () => events.push("cleared"),
          onCrossTabSignOut(callback) {
            onCrossTabSignOut = callback;
            return () => {
              onCrossTabSignOut = undefined;
              events.push("unsubscribed");
            };
          },
        },
      },
      "@/lib/auth-redirects": redirects,
      "@/lib/preferences/preferences-config": { PREFERENCE_DEFAULTS: {} },
    },
    { window },
  );

  assert.equal(Layout({ children: null }), null);
  const cleanup = effects[0]();
  return {
    location,
    events,
    cleanup,
    removeStoredToken() {
      storedToken = null;
    },
    crossTabSignOut() {
      onCrossTabSignOut?.();
    },
    pageShow(persisted) {
      window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted }));
    },
  };
}

test("the static layout guard preserves a copied report URL with its trailing slash", () => {
  const { location, events } = mountProtectedLayout("/function/tasks/detail/?id=42&tab=report", null);
  assert.deepEqual(events, ["cleared"]);
  assert.equal(location.href, loginPath.replace("detail%3F", "detail%2F%3F"));
});

test("restoring a protected page after sign-out hides it before redirecting to login", () => {
  const layout = mountProtectedLayout(reportPath, "fixture-session");
  layout.removeStoredToken();

  layout.pageShow(true);
  layout.pageShow(true);

  assert.deepEqual(layout.events, ["shown", "cleared", "flush", "hidden", loginPath]);
});

test("regular pageshow and signed-in restores keep the protected page in place", () => {
  const layout = mountProtectedLayout(reportPath, "fixture-session");
  layout.pageShow(true);
  layout.removeStoredToken();
  layout.pageShow(false);

  assert.deepEqual(layout.events, ["shown"]);
});

test("cross-tab sign-out retains its login redirect when a restore event also arrives", () => {
  const layout = mountProtectedLayout(reportPath, "fixture-session");
  layout.removeStoredToken();
  layout.crossTabSignOut();
  layout.pageShow(true);

  assert.deepEqual(layout.events, ["shown", "flush", "hidden", "/login"]);
});

test("unmounting removes both the storage and persisted pageshow handlers", () => {
  const layout = mountProtectedLayout(reportPath, "fixture-session");
  layout.cleanup();
  layout.removeStoredToken();
  layout.pageShow(true);
  layout.crossTabSignOut();

  assert.deepEqual(layout.events, ["shown", "unsubscribed"]);
});
