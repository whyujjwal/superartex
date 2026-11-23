import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

import ts from "typescript";

const source = readFileSync(new URL("../src/lib/api.ts", import.meta.url), "utf8");
const clientCode = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function createClient(response, pathname = "/login?from=settings") {
  const exports = {};
  const location = { href: pathname };
  const document = { cookie: "superartex_token=previous-session" };
  const stored = new Map([["superartex_token", "previous-session"]]);
  const imports = {
    "@/lib/mock/enabled": { MOCK: false },
    "@/lib/mock/handler": {},
  };
  runInNewContext(clientCode, {
    exports,
    require: (name) => imports[name],
    window: { location },
    document,
    localStorage: { getItem: stored.get.bind(stored), removeItem: stored.delete.bind(stored) },
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

test("an expired session on a protected account request redirects and clears credentials", async () => {
  const response = Response.json({ error: "Unauthorized" }, { status: 401 });
  const { api, location, document, stored } = createClient(response, "/function/tasks");

  await assert.rejects(api.changePassword("old password", "new password"), { message: "Unauthorized" });
  assert.equal(location.href, "/login");
  assert.equal(document.cookie, "superartex_token=; path=/; max-age=0");
  assert.equal(stored.has("superartex_token"), false);
});
