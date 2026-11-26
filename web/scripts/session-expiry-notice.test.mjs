import ts from "typescript";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const noticeSource = new URL("../src/app/(main)/_components/session-expiry-notice.tsx", import.meta.url);
const compiled = ts.transpileModule(readFileSync(noticeSource, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const now = 1_800_000_000_000;
const minute = 60_000;

function mount({ expiry, hidden = false }) {
  let currentTime = now;
  let current = expiry == null ? null : "synthetic-original";
  let nextId = 0;
  let change;
  let cleanup;
  const timers = new Map();
  const notices = [];
  const dismissals = [];
  const document = Object.assign(new EventTarget(), { visibilityState: hidden ? "hidden" : "visible" });
  const window = Object.assign(new EventTarget(), {
    clearTimeout: (id) => timers.delete(id),
    setTimeout(callback, delay) {
      const id = ++nextId;
      timers.set(id, { callback, at: currentTime + delay });
      return id;
    },
  });
  const imports = {
    react: {
      useEffect(effect) {
        cleanup = effect();
      },
    },
    "@/lib/auth": {
      auth: {
        getToken: () => current,
        getSessionExpiry: () => (expiry == null ? null : new Date(expiry)),
        onCrossTabSessionChange(callback) {
          change = callback;
          return () => {
            change = undefined;
          };
        },
      },
    },
    sonner: {
      toast: {
        warning(message, options) {
          notices.push({ message, options });
          return notices.length;
        },
        dismiss(id) {
          dismissals.push(id);
        },
      },
    },
  };
  const exports = {};
  runInNewContext(compiled, {
    exports,
    require: (name) => imports[name],
    Date: { now: () => currentTime },
    window,
    document,
  });
  assert.equal(exports.SessionExpiryNotice(), null);
  return {
    notices,
    dismissals,
    timers,
    unmount: () => cleanup(),
    restore: () => window.dispatchEvent(new Event("pageshow")),
    visibility(hidden) {
      document.visibilityState = hidden ? "hidden" : "visible";
      document.dispatchEvent(new Event("visibilitychange"));
    },
    advance(to) {
      currentTime = to;
      const pending = [...timers].filter(([, timer]) => timer.at <= to);
      for (const [id, { callback }] of pending) if (timers.delete(id)) callback();
    },
    replace(nextToken, nextExpiry) {
      current = nextToken;
      expiry = nextExpiry;
      change?.();
    },
  };
}

test("warns once at five minutes and removes the warning when the session expires", () => {
  const fixture = mount({ expiry: now + 8 * minute });
  fixture.advance(now + 3 * minute - 1);
  assert.equal(fixture.notices.length, 0);
  fixture.advance(now + 3 * minute);
  assert.equal(fixture.notices.length, 1);
  assert.match(fixture.notices[0].message, /sign-in.*expire/i);
  assert.equal(fixture.notices[0].options.closeButton, true);
  fixture.restore();
  fixture.visibility(true);
  fixture.visibility(false);
  assert.equal(fixture.notices.length, 1);
  fixture.advance(now + 8 * minute);
  assert.deepEqual(fixture.dismissals, [1]);
  assert.equal(fixture.timers.size, 0);
});

test("warns when the tab returns during the warning window, but omits expired and invalid sessions", () => {
  const fixture = mount({ expiry: now + 4 * minute, hidden: true });
  assert.equal(fixture.notices.length, 0);
  assert.equal(fixture.timers.size, 0);
  fixture.advance(now + minute);
  fixture.visibility(false);
  assert.equal(fixture.notices.length, 1);
  const expired = mount({ expiry: now + minute, hidden: true });
  expired.advance(now + minute);
  expired.visibility(false);
  assert.equal(expired.notices.length, 0);
  const invalid = mount({ expiry: null });
  assert.equal(invalid.notices.length, 0);
  assert.equal(invalid.timers.size, 0);
});

test("replacement clears a stale warning and a different equally timed session can warn", () => {
  const fixture = mount({ expiry: now + minute });
  assert.equal(fixture.notices.length, 1);
  fixture.replace("synthetic-replacement", now + minute);
  assert.equal(fixture.notices.length, 2);
  assert.deepEqual(fixture.dismissals, [1]);
  fixture.replace(null, null);
  assert.deepEqual(fixture.dismissals, [1, 2]);
  assert.equal(fixture.timers.size, 0);
});

test("unmount dismisses the warning and removes all scheduled work and subscriptions", () => {
  const fixture = mount({ expiry: now + 2 * minute });
  fixture.unmount();
  assert.deepEqual(fixture.dismissals, [1]);
  assert.equal(fixture.timers.size, 0);
  fixture.replace("synthetic-next", now + 4 * minute);
  fixture.restore();
  fixture.visibility(true);
  fixture.visibility(false);
  assert.equal(fixture.notices.length, 1);
});
