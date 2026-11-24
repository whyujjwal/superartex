import ts from "typescript";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

function compile(name) {
  const source = readFileSync(new URL(`../src/lib/${name}.ts`, import.meta.url), "utf8");
  return ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

const clientCode = compile("api");
const authCode = compile("auth");
const redirectCode = compile("auth-redirects");

function createClient(response, path = "/login?from=settings", protocol = "http:") {
  const exports = {};
  const authExports = {};
  const redirects = {};
  const { pathname, search, hash } = new URL(path, "https://superartex.test");
  const location = { href: path, protocol, pathname, search, hash };
  const document = { cookie: "superartex_token=previous-session" };
  const stored = new Map([["superartex_token", "previous-session"]]);
  const browser = {
    window: { location },
    document,
    localStorage: { getItem: stored.get.bind(stored), removeItem: stored.delete.bind(stored) },
  };
  runInNewContext(authCode, { ...browser, exports: authExports });
  runInNewContext(redirectCode, { exports: redirects, URLSearchParams });
  const imports = {
    "@/lib/auth": authExports,
    "@/lib/auth-redirects": redirects,
    "@/lib/mock/enabled": { MOCK: false },
    "@/lib/mock/handler": {},
  };
  runInNewContext(clientCode, {
    ...browser,
    exports,
    require: (name) => imports[name],
    fetch: async () => response,
  });
  return { api: exports.api, location, document, stored };
}

test("incorrect login credentials leave the sign-in page and storage in place", async () => {
  const response = Response.json({ error: "Incorrect username or password" }, { status: 401 });
  const { api, location, document, stored } = createClient(response);

  await assert.rejects(api.login("SUPERARTEX", "bad password"), (error) => {
    assert.equal(location.href, "/login?from=settings");
    assert.equal(document.cookie, "superartex_token=previous-session");
    assert.equal(stored.get("superartex_token"), "previous-session");
    assert.equal(error.message, "Incorrect username or password");
    return true;
  });
});

test("rate-limited login reports the retry delay from the response header", async () => {
  const response = new Response("rate limited", { status: 429, headers: { "Retry-After": "15" } });
  const { api } = createClient(response);

  await assert.rejects(api.login("SUPERARTEX", "password"), {
    message: "Too many login attempts, try again in 15 seconds",
  });
});

test("rate-limited login without a delay gives a retry-later message", async () => {
  const { api } = createClient(new Response("rate limited", { status: 429 }));

  await assert.rejects(api.login("SUPERARTEX", "password"), { message: "Too many login attempts, try again later" });
});

test("a login service failure reports a safe service message", async () => {
  const response = Response.json({ error: "Private database error" }, { status: 503 });
  const { api } = createClient(response);

  await assert.rejects(api.login("SUPERARTEX", "password"), {
    message: "Data source temporarily unavailable, please retry later",
  });
});

test("successful login still returns the issued token", async () => {
  const { api } = createClient(Response.json({ token: "new-session" }));

  assert.deepEqual(await api.login("SUPERARTEX", "password"), { token: "new-session" });
});

for (const [protocol, secure] of [
  ["http:", ""],
  ["https:", "; Secure"],
]) {
  test(`an expired protected session on ${protocol} redirects and clears credentials`, async () => {
    const response = Response.json({ error: "Unauthorized" }, { status: 401 });
    const { api, location, document, stored } = createClient(response, "/function/tasks", protocol);

    await assert.rejects(api.changePassword("old password", "new password"), { message: "Unauthorized" });
    assert.equal(location.href, "/login");
    assert.equal(document.cookie, `superartex_token=; path=/; max-age=0${secure}`);
    assert.equal(stored.has("superartex_token"), false);
  });
}

test("an expired session in a copied report preserves the report through sign-in", async () => {
  const response = Response.json({ error: "Unauthorized" }, { status: 401 });
  const { api, location, stored } = createClient(response, "/function/tasks/detail?id=42&tab=report");

  await assert.rejects(api.task("42"), { message: "Unauthorized" });
  assert.equal(location.href, "/login?returnTo=%2Ffunction%2Ftasks%2Fdetail%3Fid%3D42%26tab%3Dreport");
  assert.equal(stored.has("superartex_token"), false);
});

test("a late unauthorized response does not clear a replacement session", async () => {
  const path = "/function/tasks/detail?id=42&tab=report";
  const response = Response.json({ error: "Unauthorized" }, { status: 401 });
  const { api, location, document, stored } = createClient(response, path);

  const pending = api.task("42");
  stored.set("superartex_token", "replacement-session");
  document.cookie = "superartex_token=replacement-session";

  await assert.rejects(pending, { message: "Unauthorized" });
  assert.equal(location.href, path);
  assert.equal(stored.get("superartex_token"), "replacement-session");
  assert.equal(document.cookie, "superartex_token=replacement-session");
});
