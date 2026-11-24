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

function createClient(response, pathname = "/login?from=settings", protocol = "http:") {
  const exports = {};
  const authExports = {};
  const location = { href: pathname, protocol };
  const document = { cookie: "superartex_token=previous-session" };
  const stored = new Map([["superartex_token", "previous-session"]]);
  const browser = {
    window: { location },
    document,
    localStorage: { getItem: stored.get.bind(stored), removeItem: stored.delete.bind(stored) },
  };
  runInNewContext(authCode, { ...browser, exports: authExports });
  const imports = {
    "@/lib/auth": authExports,
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
