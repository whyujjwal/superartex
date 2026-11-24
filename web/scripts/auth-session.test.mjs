import ts from "typescript";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const key = "superartex_token";
const compiled = ts.transpileModule(readFileSync(new URL("../src/lib/auth.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function createSession(mock = false, protocol = "http:") {
  const exports = {};
  const values = new Map([[key, "previous-token"]]);
  const listeners = new Set();
  const cookieWrites = [];
  let removals = 0;
  const localStorage = {
    getItem: (name) => values.get(name) ?? null,
    setItem: (name, value) => values.set(name, value),
    removeItem(name) {
      removals++;
      values.delete(name);
    },
  };
  runInNewContext(compiled, {
    exports,
    atob,
    localStorage,
    window: {
      location: { protocol },
      localStorage,
      addEventListener(type, listener) {
        if (type === "storage") listeners.add(listener);
      },
      removeEventListener(type, listener) {
        if (type === "storage") listeners.delete(listener);
      },
    },
    document: {
      set cookie(value) {
        cookieWrites.push(value);
      },
    },
    process: { env: { NEXT_PUBLIC_MOCK: mock ? "1" : "0" } },
  });
  return {
    auth: exports.auth,
    values,
    cookieWrites,
    emit(event) {
      for (const listener of listeners) listener({ storageArea: localStorage, ...event });
    },
    get removals() {
      return removals;
    },
  };
}

for (const [protocol, secure] of [
  ["http:", ""],
  ["https:", "; Secure"],
]) {
  test(`signing in and out writes the expected cookie on ${protocol}`, () => {
    const session = createSession(false, protocol);
    session.auth.setToken("new/session");
    assert.equal(session.auth.getToken(), "new/session");
    session.auth.clearToken();
    assert.equal(session.auth.getToken(), null);
    assert.deepEqual(session.cookieWrites, [
      `${key}=new%2Fsession; path=/; max-age=604800; SameSite=Lax${secure}`,
      `${key}=; path=/; max-age=0${secure}`,
    ]);
  });

  test(`cross-tab sign-out on ${protocol} clears the cookie without writing to localStorage`, () => {
    const session = createSession(false, protocol);
    let signOuts = 0;
    session.auth.onCrossTabSignOut(() => signOuts++);

    session.values.delete(key);
    session.emit({ key, oldValue: "previous-token", newValue: null });
    session.emit({ key: null, newValue: null });

    assert.equal(signOuts, 1);
    assert.deepEqual(session.cookieWrites, [`${key}=; path=/; max-age=0${secure}`]);
    assert.equal(session.removals, 0);
  });
}

test("only auth removal from localStorage signs out and a replacement token wins over stale events", () => {
  const session = createSession();
  let signOuts = 0;
  session.auth.onCrossTabSignOut(() => signOuts++);

  session.values.set(key, "new-token");
  session.emit({ key, oldValue: "previous-token", newValue: null });
  session.emit({ key, oldValue: "previous-token", newValue: "new-token" });
  assert.equal(session.auth.getToken(), "new-token");
  assert.equal(signOuts, 0);

  session.values.delete(key);
  session.emit({ key: "appearance", newValue: null });
  session.emit({ key, newValue: null, storageArea: {} });
  assert.equal(signOuts, 0);
  assert.deepEqual(session.cookieWrites, []);

  session.emit({ key: null, oldValue: null, newValue: null });
  assert.equal(signOuts, 1);
});

test("mock sessions stay signed in when the stored token disappears", () => {
  const session = createSession(true);
  let signOuts = 0;
  session.auth.onCrossTabSignOut(() => signOuts++);

  session.values.delete(key);
  session.emit({ key, oldValue: "previous-token", newValue: null });

  assert.equal(session.auth.getToken(), "mock-demo");
  assert.equal(signOuts, 0);
  assert.deepEqual(session.cookieWrites, []);
});

test("a sign-out listener can be removed when the protected layout unmounts", () => {
  const session = createSession();
  const unsubscribe = session.auth.onCrossTabSignOut(() => assert.fail("listener was still active"));

  unsubscribe();
  session.values.delete(key);
  session.emit({ key, oldValue: "previous-token", newValue: null });

  assert.deepEqual(session.cookieWrites, []);
});

function tokenWithClaims(claims) {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `eyJhbGciOiJIUzI1NiJ9.${payload}.fixture`;
}

test("session expiry reads the current token's numeric timestamp without changing session state", () => {
  const session = createSession();
  const previousToken = tokenWithClaims({ sub: "SUPERARTEX", exp: 1700000000 });
  session.values.set(key, previousToken);

  assert.equal(session.auth.getSessionExpiry()?.toISOString(), "2023-11-14T22:13:20.000Z");
  assert.equal(session.auth.getCurrentUser()?.name, "SUPERARTEX");
  assert.equal(session.auth.getToken(), previousToken);

  const nextToken = tokenWithClaims({ exp: 1800000000 });
  session.values.set(key, nextToken);
  assert.equal(session.auth.getSessionExpiry()?.toISOString(), "2027-01-15T08:00:00.000Z");
  assert.equal(session.auth.getToken(), nextToken);
  assert.equal(session.removals, 0);
  assert.deepEqual(session.cookieWrites, []);
});

test("session expiry is omitted when the token or its expiry is unavailable or invalid", () => {
  const session = createSession(true);
  session.values.delete(key);
  assert.equal(session.auth.getSessionExpiry(), null);

  for (const token of [
    "not-a-jwt",
    "header.bad-base64!.fixture",
    tokenWithClaims({ exp: 1800000000 }).replace(/fixture$/, ""),
    tokenWithClaims({ sub: "SUPERARTEX" }),
    tokenWithClaims({ exp: "1800000000" }),
    tokenWithClaims({ exp: 1e20 }),
    tokenWithClaims(null),
  ]) {
    session.values.set(key, token);
    assert.equal(session.auth.getSessionExpiry(), null);
  }
});
