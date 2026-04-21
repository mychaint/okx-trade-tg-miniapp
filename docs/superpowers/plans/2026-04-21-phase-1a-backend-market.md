# Phase 1a — Backend Market Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the plugin real HTTP routes that proxy OKX public market data (instruments / ticker / candles) for SPOT, SWAP, FUTURES, OPTION categories, and a `/api/meta` route that exposes plugin state to the frontend. Backend only — no UI, no initData auth, no positions.

**Architecture:** A thin proxy over `@okx_ai/okx-trade-cli`. One module (`src/okx/invoke.js`) spawns `okx --json <args>` and parses stdout. Route modules take the invoker as a dependency so they can be unit-tested with a fake. Everything mounts at `/plugins/okx-trade-tg-miniapp/api/*`, `auth: "plugin"` (gateway does no auth; this is the Mini App surface). Demo/live toggle flows in via a query param and maps to the CLI's `--demo`/`--live` flags.

**Tech Stack:** Node 20+ ESM, openclaw plugin SDK, `@okx_ai/okx-trade-cli` (installed globally), `node:test` for unit tests, `node:assert/strict` for assertions. No other runtime deps in the plugin (keeps `openclaw plugins install` painless).

**Prerequisite (already done in Phase 0):** Plugin scaffolding (`openclaw.plugin.json`, `package.json`, `src/index.js`, git init with remote, `openclaw plugins install --link` works, ping returns 200).

---

## File Structure

### Created by this plan
- `src/okx/invoke.js` — spawn `okx --json`, return parsed JSON; throws `OkxCliError` on failures
- `src/okx/invoke.test.js` — unit tests with fake `spawn`
- `src/util/json.js` — `writeJson(res, code, body)` helper
- `src/util/json.test.js` — tests
- `src/routes/market.js` — route factory; accepts an `invoker` fn, returns array of `{path, handler}` for `registerHttpRoute`
- `src/routes/market.test.js` — tests that feed canned invoker responses
- `src/routes/meta.js` — `/api/meta` route
- `src/routes/meta.test.js`

### Modified by this plan
- `src/index.js` — remove the debug `_debug/runtime` route; wire market + meta route factories
- `package.json` — add `test` script; add `devDependencies` (none required, but declare `engines.node >= 20`)
- `README.md` — add "Running tests" section

Each file owns one concern. Route factories return data so they can be unit-tested in isolation from the openclaw runtime; `index.js` is the only file that touches `api.registerHttpRoute`.

---

## Conventions used throughout tasks

- All plugin routes live under `/plugins/okx-trade-tg-miniapp/api/`. We call this the `API_BASE`.
- All file paths are absolute from the repo root `/home/ubuntu/okx-trade-tg-miniapp/`.
- **Test runner:** `node --test src/**/*.test.js` (Node's built-in runner).
- **Commit messages:** `feat: <short summary>` or `test: <short summary>` or `chore: <short summary>`. No ticket prefix.
- **Latency note:** after each `src/index.js` change we must run `openclaw gateway restart` and wait for health (the plugin is link-installed, but route mounts only happen on gateway boot). Unit tests don't need a restart — they run standalone.

---

## Task 1 — OKX invoker: happy path

**Files:**
- Create: `src/okx/invoke.js`
- Create: `src/okx/invoke.test.js`

- [ ] **Step 1: Write the failing test**

Write `src/okx/invoke.test.js`:

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { invokeOkx, OkxCliError } from "./invoke.js";

function fakeSpawn({ stdout = "", stderr = "", exitCode = 0, delay = 0 } = {}) {
  return (_cmd, _args, _opts) => {
    const proc = new EventEmitter();
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    proc.kill = () => {};
    setTimeout(() => {
      if (stdout) proc.stdout.emit("data", Buffer.from(stdout));
      if (stderr) proc.stderr.emit("data", Buffer.from(stderr));
      proc.emit("close", exitCode);
    }, delay);
    return proc;
  };
}

test("invokeOkx returns parsed JSON on zero exit", async () => {
  const payload = [{ instId: "BTC-USDT", last: "70000" }];
  const result = await invokeOkx(["market", "ticker", "BTC-USDT"], {
    spawnImpl: fakeSpawn({ stdout: JSON.stringify(payload) }),
  });
  assert.deepEqual(result, payload);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/ubuntu/okx-trade-tg-miniapp && node --test src/okx/invoke.test.js
```
Expected: FAIL with `Cannot find module './invoke.js'` (or similar import error).

- [ ] **Step 3: Write minimal implementation**

Write `src/okx/invoke.js`:

```javascript
import { spawn as nodeSpawn } from "node:child_process";

const DEFAULT_TIMEOUT_MS = 15000;

export class OkxCliError extends Error {
  constructor(message, { exitCode, stderr, stdout } = {}) {
    super(message);
    this.name = "OkxCliError";
    if (exitCode !== undefined) this.exitCode = exitCode;
    if (stderr !== undefined) this.stderr = stderr;
    if (stdout !== undefined) this.stdout = stdout;
  }
}

export async function invokeOkx(args, {
  profile,
  demo,
  env,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  spawnImpl = nodeSpawn,
} = {}) {
  const finalArgs = [];
  if (profile) finalArgs.push("--profile", profile);
  if (demo === true) finalArgs.push("--demo");
  if (demo === false) finalArgs.push("--live");
  finalArgs.push("--json", ...args);

  return await new Promise((resolve, reject) => {
    const proc = spawnImpl("okx", finalArgs, {
      env: { ...process.env, ...(env ?? {}) },
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      proc.kill?.("SIGKILL");
      reject(new OkxCliError(`okx timed out after ${timeoutMs}ms`, { stderr }));
    }, timeoutMs);
    proc.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    proc.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(new OkxCliError(`failed to spawn okx: ${err.message}`, { stderr }));
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new OkxCliError(`okx exited with code ${code}`, {
          exitCode: code, stderr, stdout,
        }));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new OkxCliError("okx stdout was not valid JSON", { stdout, stderr }));
      }
    });
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/ubuntu/okx-trade-tg-miniapp && node --test src/okx/invoke.test.js
```
Expected: `# pass 1`.

- [ ] **Step 5: Commit**

```bash
cd /home/ubuntu/okx-trade-tg-miniapp && git add src/okx/invoke.js src/okx/invoke.test.js && git commit -m "feat: OKX CLI invoker happy path"
```

---

## Task 2 — OKX invoker: non-zero exit and bad JSON

**Files:**
- Modify: `src/okx/invoke.test.js`
- Modify: `src/okx/invoke.js` (no changes expected — tests should already pass)

- [ ] **Step 1: Add failing tests**

Append to `src/okx/invoke.test.js`:

```javascript
test("invokeOkx throws OkxCliError on non-zero exit", async () => {
  await assert.rejects(
    invokeOkx(["market", "ticker"], {
      spawnImpl: fakeSpawn({ stderr: "missing arg", exitCode: 2 }),
    }),
    (err) => err instanceof OkxCliError && err.exitCode === 2 && err.stderr === "missing arg",
  );
});

test("invokeOkx throws OkxCliError on non-JSON stdout", async () => {
  await assert.rejects(
    invokeOkx(["market", "ticker", "BTC-USDT"], {
      spawnImpl: fakeSpawn({ stdout: "not json" }),
    }),
    (err) => err instanceof OkxCliError && /not valid JSON/.test(err.message),
  );
});

test("invokeOkx passes --profile and --demo flags through", async () => {
  let capturedArgs = null;
  const capturingSpawn = (_cmd, args) => {
    capturedArgs = args;
    return fakeSpawn({ stdout: "[]" })();
  };
  await invokeOkx(["market", "ticker", "BTC-USDT"], {
    profile: "tg-123",
    demo: true,
    spawnImpl: capturingSpawn,
  });
  assert.deepEqual(capturedArgs, [
    "--profile", "tg-123",
    "--demo",
    "--json",
    "market", "ticker", "BTC-USDT",
  ]);
});

test("invokeOkx passes --live flag when demo is false", async () => {
  let capturedArgs = null;
  const capturingSpawn = (_cmd, args) => {
    capturedArgs = args;
    return fakeSpawn({ stdout: "[]" })();
  };
  await invokeOkx(["market", "ticker", "BTC-USDT"], {
    demo: false,
    spawnImpl: capturingSpawn,
  });
  assert.deepEqual(capturedArgs, ["--live", "--json", "market", "ticker", "BTC-USDT"]);
});

test("invokeOkx emits neither --demo nor --live when demo is undefined", async () => {
  let capturedArgs = null;
  const capturingSpawn = (_cmd, args) => {
    capturedArgs = args;
    return fakeSpawn({ stdout: "[]" })();
  };
  await invokeOkx(["market", "ticker", "BTC-USDT"], {
    spawnImpl: capturingSpawn,
  });
  assert.deepEqual(capturedArgs, ["--json", "market", "ticker", "BTC-USDT"]);
});
```

- [ ] **Step 2: Run tests — expect all passing**

```bash
cd /home/ubuntu/okx-trade-tg-miniapp && node --test src/okx/invoke.test.js
```
Expected: `# pass 4`. If any fail, the invoker impl has a bug — fix it before committing.

- [ ] **Step 3: Commit**

```bash
cd /home/ubuntu/okx-trade-tg-miniapp && git add src/okx/invoke.test.js && git commit -m "test: OKX invoker error paths and flag passthrough"
```

---

## Task 3 — JSON response helper

**Files:**
- Create: `src/util/json.js`
- Create: `src/util/json.test.js`

- [ ] **Step 1: Write the failing test**

Write `src/util/json.test.js`:

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import { writeJson } from "./json.js";

function fakeRes() {
  const res = {
    statusCode: 0,
    headers: {},
    body: "",
    ended: false,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    end(s) { this.body = s; this.ended = true; },
  };
  return res;
}

test("writeJson sets status, content-type, and JSON body", () => {
  const res = fakeRes();
  writeJson(res, 201, { ok: true, id: 42 });
  assert.equal(res.statusCode, 201);
  assert.equal(res.headers["content-type"], "application/json; charset=utf-8");
  assert.deepEqual(JSON.parse(res.body), { ok: true, id: 42 });
  assert.equal(res.ended, true);
});
```

- [ ] **Step 2: Run test — verify failing**

```bash
cd /home/ubuntu/okx-trade-tg-miniapp && node --test src/util/json.test.js
```
Expected: FAIL (`Cannot find module './json.js'`).

- [ ] **Step 3: Implement**

Write `src/util/json.js`:

```javascript
export function writeJson(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}
```

- [ ] **Step 4: Run test — passing**

```bash
cd /home/ubuntu/okx-trade-tg-miniapp && node --test src/util/json.test.js
```
Expected: `# pass 1`.

- [ ] **Step 5: Commit**

```bash
cd /home/ubuntu/okx-trade-tg-miniapp && git add src/util/json.js src/util/json.test.js && git commit -m "feat: writeJson response helper"
```

---

## Task 4 — Market routes: instruments list

OKX endpoint: `okx market instruments --instType SPOT` (or SWAP/FUTURES/OPTION).

**Files:**
- Create: `src/routes/market.js`
- Create: `src/routes/market.test.js`

- [ ] **Step 1: Write the failing test**

Write `src/routes/market.test.js`:

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import { createMarketRoutes } from "./market.js";

function fakeReq(url) { return { url, method: "GET", headers: {} }; }
function fakeRes() {
  const res = {
    statusCode: 0, headers: {}, body: "", ended: false,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    end(s) { this.body = s; this.ended = true; },
  };
  return res;
}

function findRoute(routes, path) {
  const match = routes.find((r) => r.path === path);
  if (!match) throw new Error(`no route for ${path}`);
  return match;
}

test("GET /api/market/instruments?instType=SPOT calls okx market instruments", async () => {
  const calls = [];
  const invoker = async (args) => {
    calls.push(args);
    return [{ instId: "BTC-USDT", instType: "SPOT" }];
  };
  const routes = createMarketRoutes({ invoker, basePath: "/api/market" });
  const route = findRoute(routes, "/api/market/instruments");
  const req = fakeReq("/api/market/instruments?instType=SPOT");
  const res = fakeRes();
  const handled = await route.handler(req, res);
  assert.equal(handled, true);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls, [["market", "instruments", "--instType", "SPOT"]]);
  assert.deepEqual(JSON.parse(res.body), {
    ok: true,
    data: [{ instId: "BTC-USDT", instType: "SPOT" }],
  });
});

test("GET /api/market/instruments rejects missing instType with 400", async () => {
  const invoker = async () => { throw new Error("should not be called"); };
  const routes = createMarketRoutes({ invoker, basePath: "/api/market" });
  const route = findRoute(routes, "/api/market/instruments");
  const res = fakeRes();
  await route.handler(fakeReq("/api/market/instruments"), res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body, /instType/);
});

test("GET /api/market/instruments rejects unknown instType with 400", async () => {
  const invoker = async () => { throw new Error("should not be called"); };
  const routes = createMarketRoutes({ invoker, basePath: "/api/market" });
  const route = findRoute(routes, "/api/market/instruments");
  const res = fakeRes();
  await route.handler(fakeReq("/api/market/instruments?instType=XYZ"), res);
  assert.equal(res.statusCode, 400);
});
```

- [ ] **Step 2: Run test — failing**

```bash
cd /home/ubuntu/okx-trade-tg-miniapp && node --test src/routes/market.test.js
```
Expected: FAIL (`Cannot find module './market.js'`).

- [ ] **Step 3: Implement**

Write `src/routes/market.js`:

```javascript
import { writeJson } from "../util/json.js";
import { OkxCliError } from "../okx/invoke.js";

const VALID_INST_TYPES = new Set(["SPOT", "SWAP", "FUTURES", "OPTION"]);

function parseQuery(url) {
  try {
    const u = new URL(url, "http://local");
    return u.searchParams;
  } catch {
    return new URLSearchParams();
  }
}

function runWithInvoker(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      if (err instanceof OkxCliError) {
        writeJson(res, 502, {
          ok: false,
          error: "okx_cli_error",
          message: err.message,
        });
      } else {
        writeJson(res, 500, {
          ok: false,
          error: "internal",
          message: err.message,
        });
      }
    }
    return true;
  };
}

export function createMarketRoutes({ invoker, basePath = "/api/market" }) {
  return [
    {
      path: `${basePath}/instruments`,
      handler: runWithInvoker(async (req, res) => {
        const q = parseQuery(req.url);
        const instType = q.get("instType");
        if (!instType) {
          writeJson(res, 400, { ok: false, error: "missing_param", message: "instType is required" });
          return;
        }
        if (!VALID_INST_TYPES.has(instType)) {
          writeJson(res, 400, { ok: false, error: "invalid_param", message: `instType must be one of ${[...VALID_INST_TYPES].join(",")}` });
          return;
        }
        const data = await invoker(["market", "instruments", "--instType", instType]);
        writeJson(res, 200, { ok: true, data });
      }),
    },
  ];
}
```

- [ ] **Step 4: Run tests — passing**

```bash
cd /home/ubuntu/okx-trade-tg-miniapp && node --test src/routes/market.test.js
```
Expected: `# pass 3`.

- [ ] **Step 5: Commit**

```bash
cd /home/ubuntu/okx-trade-tg-miniapp && git add src/routes/market.js src/routes/market.test.js && git commit -m "feat: market instruments route"
```

---

## Task 5 — Market routes: ticker + tickers

**Files:**
- Modify: `src/routes/market.js`
- Modify: `src/routes/market.test.js`

- [ ] **Step 1: Add failing tests**

Append to `src/routes/market.test.js`:

```javascript
test("GET /api/market/ticker?instId=BTC-USDT calls okx market ticker", async () => {
  const calls = [];
  const invoker = async (args) => { calls.push(args); return [{ last: "70000" }]; };
  const routes = createMarketRoutes({ invoker, basePath: "/api/market" });
  const route = findRoute(routes, "/api/market/ticker");
  const res = fakeRes();
  await route.handler(fakeReq("/api/market/ticker?instId=BTC-USDT"), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls, [["market", "ticker", "BTC-USDT"]]);
});

test("GET /api/market/ticker requires instId", async () => {
  const invoker = async () => { throw new Error("nope"); };
  const routes = createMarketRoutes({ invoker, basePath: "/api/market" });
  const route = findRoute(routes, "/api/market/ticker");
  const res = fakeRes();
  await route.handler(fakeReq("/api/market/ticker"), res);
  assert.equal(res.statusCode, 400);
});

test("GET /api/market/tickers?instType=SPOT calls okx market tickers", async () => {
  const calls = [];
  const invoker = async (args) => { calls.push(args); return []; };
  const routes = createMarketRoutes({ invoker, basePath: "/api/market" });
  const route = findRoute(routes, "/api/market/tickers");
  const res = fakeRes();
  await route.handler(fakeReq("/api/market/tickers?instType=SPOT"), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls, [["market", "tickers", "--instType", "SPOT"]]);
});

test("GET /api/market/ticker surfaces OKX errors as 502", async () => {
  const { OkxCliError } = await import("../okx/invoke.js");
  const invoker = async () => { throw new OkxCliError("okx exited with code 1", { exitCode: 1, stderr: "bad symbol" }); };
  const routes = createMarketRoutes({ invoker, basePath: "/api/market" });
  const route = findRoute(routes, "/api/market/ticker");
  const res = fakeRes();
  await route.handler(fakeReq("/api/market/ticker?instId=BOGUS"), res);
  assert.equal(res.statusCode, 502);
  const body = JSON.parse(res.body);
  assert.equal(body.ok, false);
  assert.equal(body.error, "okx_cli_error");
});

test("GET /api/market/tickers without instType returns error: missing_param", async () => {
  const invoker = async () => { throw new Error("nope"); };
  const routes = createMarketRoutes({ invoker, basePath: "/api/market" });
  const route = findRoute(routes, "/api/market/tickers");
  const res = fakeRes();
  await route.handler(fakeReq("/api/market/tickers"), res);
  assert.equal(res.statusCode, 400);
  assert.equal(JSON.parse(res.body).error, "missing_param");
});

test("GET /api/market/tickers with invalid instType returns error: invalid_param", async () => {
  const invoker = async () => { throw new Error("nope"); };
  const routes = createMarketRoutes({ invoker, basePath: "/api/market" });
  const route = findRoute(routes, "/api/market/tickers");
  const res = fakeRes();
  await route.handler(fakeReq("/api/market/tickers?instType=XYZ"), res);
  assert.equal(res.statusCode, 400);
  assert.equal(JSON.parse(res.body).error, "invalid_param");
});
```

- [ ] **Step 2: Run tests — failing**

Expected: 3 failures (ticker & tickers routes missing).

- [ ] **Step 3: Implement the two new routes**

Add two entries inside the array returned by `createMarketRoutes` (after `instruments`):

```javascript
    {
      path: `${basePath}/ticker`,
      handler: runWithInvoker(async (req, res) => {
        const q = parseQuery(req.url);
        const instId = q.get("instId");
        if (!instId) {
          writeJson(res, 400, { ok: false, error: "missing_param", message: "instId is required" });
          return;
        }
        const data = await invoker(["market", "ticker", instId]);
        writeJson(res, 200, { ok: true, data });
      }),
    },
    {
      path: `${basePath}/tickers`,
      handler: runWithInvoker(async (req, res) => {
        const q = parseQuery(req.url);
        const instType = q.get("instType");
        if (!instType) {
          writeJson(res, 400, { ok: false, error: "missing_param", message: "instType is required" });
          return;
        }
        if (!VALID_INST_TYPES.has(instType)) {
          writeJson(res, 400, { ok: false, error: "invalid_param", message: `instType must be one of ${[...VALID_INST_TYPES].join(",")}` });
          return;
        }
        const data = await invoker(["market", "tickers", "--instType", instType]);
        writeJson(res, 200, { ok: true, data });
      }),
    },
```

- [ ] **Step 4: Run tests — passing**

```bash
cd /home/ubuntu/okx-trade-tg-miniapp && node --test src/routes/market.test.js
```
Expected: `# pass 7`.

- [ ] **Step 5: Commit**

```bash
cd /home/ubuntu/okx-trade-tg-miniapp && git add src/routes/market.js src/routes/market.test.js && git commit -m "feat: market ticker and tickers routes"
```

---

## Task 6 — Market routes: candles with bar/limit

OKX endpoint: `okx market candles --instId BTC-USDT --bar 1H --limit 300`.

**Files:**
- Modify: `src/routes/market.js`
- Modify: `src/routes/market.test.js`

- [ ] **Step 1: Add failing tests**

Append to `src/routes/market.test.js`:

```javascript
test("GET /api/market/candles forwards instId, bar, limit", async () => {
  const calls = [];
  const invoker = async (args) => { calls.push(args); return [["1700000000000", "70000"]]; };
  const routes = createMarketRoutes({ invoker, basePath: "/api/market" });
  const route = findRoute(routes, "/api/market/candles");
  const res = fakeRes();
  await route.handler(fakeReq("/api/market/candles?instId=BTC-USDT&bar=1H&limit=300"), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls, [["market", "candles", "BTC-USDT", "--bar", "1H", "--limit", "300"]]);
});

test("GET /api/market/candles uses default bar=1H limit=300", async () => {
  const calls = [];
  const invoker = async (args) => { calls.push(args); return []; };
  const routes = createMarketRoutes({ invoker, basePath: "/api/market" });
  const route = findRoute(routes, "/api/market/candles");
  const res = fakeRes();
  await route.handler(fakeReq("/api/market/candles?instId=BTC-USDT"), res);
  assert.deepEqual(calls, [["market", "candles", "BTC-USDT", "--bar", "1H", "--limit", "300"]]);
});

test("GET /api/market/candles rejects bar not in allowlist", async () => {
  const invoker = async () => { throw new Error("nope"); };
  const routes = createMarketRoutes({ invoker, basePath: "/api/market" });
  const route = findRoute(routes, "/api/market/candles");
  const res = fakeRes();
  await route.handler(fakeReq("/api/market/candles?instId=BTC-USDT&bar=7S"), res);
  assert.equal(res.statusCode, 400);
});

test("GET /api/market/candles clamps limit to max 300", async () => {
  const calls = [];
  const invoker = async (args) => { calls.push(args); return []; };
  const routes = createMarketRoutes({ invoker, basePath: "/api/market" });
  const route = findRoute(routes, "/api/market/candles");
  const res = fakeRes();
  await route.handler(fakeReq("/api/market/candles?instId=BTC-USDT&limit=9999"), res);
  assert.deepEqual(calls, [["market", "candles", "BTC-USDT", "--bar", "1H", "--limit", "300"]]);
});
```

- [ ] **Step 2: Run tests — failing**

Expected: 4 failures.

- [ ] **Step 3: Implement**

Add to `src/routes/market.js`:

Near the top constants:

```javascript
const VALID_BARS = new Set(["1m", "3m", "5m", "15m", "30m", "1H", "2H", "4H", "6H", "12H", "1D", "1W", "1M"]);
const MAX_LIMIT = 300;
const DEFAULT_LIMIT = 300;
const DEFAULT_BAR = "1H";
```

Add a new entry inside the routes array:

```javascript
    {
      path: `${basePath}/candles`,
      handler: runWithInvoker(async (req, res) => {
        const q = parseQuery(req.url);
        const instId = q.get("instId");
        if (!instId) {
          writeJson(res, 400, { ok: false, error: "missing_param", message: "instId is required" });
          return;
        }
        const bar = q.get("bar") ?? DEFAULT_BAR;
        if (!VALID_BARS.has(bar)) {
          writeJson(res, 400, { ok: false, error: "invalid_param", message: `bar must be one of ${[...VALID_BARS].join(",")}` });
          return;
        }
        const rawLimit = Number.parseInt(q.get("limit") ?? String(DEFAULT_LIMIT), 10);
        const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), MAX_LIMIT) : DEFAULT_LIMIT;
        const data = await invoker(["market", "candles", instId, "--bar", bar, "--limit", String(limit)]);
        writeJson(res, 200, { ok: true, data });
      }),
    },
```

- [ ] **Step 4: Run tests — passing**

```bash
cd /home/ubuntu/okx-trade-tg-miniapp && node --test src/routes/market.test.js
```
Expected: `# pass 11`.

- [ ] **Step 5: Commit**

```bash
cd /home/ubuntu/okx-trade-tg-miniapp && git add src/routes/market.js src/routes/market.test.js && git commit -m "feat: market candles route with bar/limit validation"
```

---

## Task 7 — Demo/live toggle via query param

**Files:**
- Modify: `src/routes/market.js`
- Modify: `src/routes/market.test.js`

- [ ] **Step 1: Add failing tests**

Append to `src/routes/market.test.js`:

```javascript
test("?env=demo routes call invoker with demo=true", async () => {
  const seenOpts = [];
  const invoker = async (_args, opts = {}) => { seenOpts.push(opts); return []; };
  const routes = createMarketRoutes({ invoker, basePath: "/api/market" });
  const route = findRoute(routes, "/api/market/ticker");
  const res = fakeRes();
  await route.handler(fakeReq("/api/market/ticker?instId=BTC-USDT&env=demo"), res);
  assert.equal(seenOpts[0]?.demo, true);
});

test("?env=live routes call invoker with demo=false", async () => {
  const seenOpts = [];
  const invoker = async (_args, opts = {}) => { seenOpts.push(opts); return []; };
  const routes = createMarketRoutes({ invoker, basePath: "/api/market" });
  const route = findRoute(routes, "/api/market/ticker");
  const res = fakeRes();
  await route.handler(fakeReq("/api/market/ticker?instId=BTC-USDT&env=live"), res);
  assert.equal(seenOpts[0]?.demo, false);
});

test("no env query passes no demo flag", async () => {
  const seenOpts = [];
  const invoker = async (_args, opts = {}) => { seenOpts.push(opts); return []; };
  const routes = createMarketRoutes({ invoker, basePath: "/api/market" });
  const route = findRoute(routes, "/api/market/ticker");
  const res = fakeRes();
  await route.handler(fakeReq("/api/market/ticker?instId=BTC-USDT"), res);
  assert.equal(seenOpts[0]?.demo, undefined);
});
```

- [ ] **Step 2: Run tests — failing**

Expected: 3 failures (invoker called without options).

- [ ] **Step 3: Modify every handler to pass demo option**

In `src/routes/market.js`, replace every `await invoker([...])` call with a helper:

```javascript
function demoFromQuery(q) {
  const v = q.get("env");
  if (v === "demo") return true;
  if (v === "live") return false;
  return undefined;
}
```

And change every call site, e.g.:

```javascript
const data = await invoker(["market", "ticker", instId], { demo: demoFromQuery(q) });
```

Do this for `instruments`, `ticker`, `tickers`, `candles`. Leave `demo: undefined` when query absent — the invoker itself ignores `undefined`.

- [ ] **Step 4: Run all tests — passing**

```bash
cd /home/ubuntu/okx-trade-tg-miniapp && node --test src/routes/market.test.js src/okx/invoke.test.js
```
Expected: `# pass 18` (11 prior + 3 demo + 4 invoker tests).

- [ ] **Step 5: Commit**

```bash
cd /home/ubuntu/okx-trade-tg-miniapp && git add src/routes/market.js src/routes/market.test.js && git commit -m "feat: env=demo|live query toggle on market routes"
```

---

## Task 8 — Meta route

Returns plugin metadata the frontend uses to render its header: plugin id, version, the agent id it runs under, and the default env (demo or live — `live` for now, configurable later).

**Files:**
- Create: `src/routes/meta.js`
- Create: `src/routes/meta.test.js`

- [ ] **Step 1: Write failing test**

Write `src/routes/meta.test.js`:

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import { createMetaRoute } from "./meta.js";

function fakeReq() { return { url: "/api/meta", method: "GET", headers: {} }; }
function fakeRes() {
  return {
    statusCode: 0, headers: {}, body: "", ended: false,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    end(s) { this.body = s; this.ended = true; },
  };
}

test("GET /api/meta returns plugin + agent info", async () => {
  const route = createMetaRoute({
    pluginId: "okx-trade-tg-miniapp",
    version: "0.0.1",
    agentId: "main",
    defaultEnv: "live",
    basePath: "/api",
  });
  assert.equal(route.path, "/api/meta");
  const res = fakeRes();
  await route.handler(fakeReq(), res);
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.ok, true);
  assert.equal(body.plugin, "okx-trade-tg-miniapp");
  assert.equal(body.version, "0.0.1");
  assert.equal(body.agentId, "main");
  assert.equal(body.defaultEnv, "live");
});
```

- [ ] **Step 2: Run test — failing**

Expected: module not found.

- [ ] **Step 3: Implement**

Write `src/routes/meta.js`:

```javascript
import { writeJson } from "../util/json.js";

export function createMetaRoute({ pluginId, version, agentId, defaultEnv = "live", basePath = "/api" }) {
  return {
    path: `${basePath}/meta`,
    handler: async (_req, res) => {
      writeJson(res, 200, {
        ok: true,
        plugin: pluginId,
        version,
        agentId,
        defaultEnv,
      });
      return true;
    },
  };
}
```

- [ ] **Step 4: Run tests — passing**

```bash
cd /home/ubuntu/okx-trade-tg-miniapp && node --test src/routes/meta.test.js
```
Expected: `# pass 1`.

- [ ] **Step 5: Commit**

```bash
cd /home/ubuntu/okx-trade-tg-miniapp && git add src/routes/meta.js src/routes/meta.test.js && git commit -m "feat: meta route"
```

---

## Task 9 — Wire everything in index.js, drop debug route

**Files:**
- Modify: `src/index.js` (full rewrite, shown below)
- Modify: `package.json` (add `test` script, declare engines)

- [ ] **Step 1: Rewrite src/index.js**

Replace the contents of `src/index.js` with:

```javascript
import { definePluginEntry } from "openclaw/plugin-sdk/core";
import { invokeOkx } from "./okx/invoke.js";
import { createMarketRoutes } from "./routes/market.js";
import { createMetaRoute } from "./routes/meta.js";
import { writeJson } from "./util/json.js";

const PLUGIN_ID = "okx-trade-tg-miniapp";
const PLUGIN_VERSION = "0.0.1";
const API_BASE = `/plugins/${PLUGIN_ID}/api`;

export default definePluginEntry({
  id: PLUGIN_ID,
  name: "OKX Trade TG Mini App",
  description: "Telegram Mini App for OKX market data and personal positions.",
  async register(api) {
    api.logger.info?.(`[${PLUGIN_ID}] registering v${PLUGIN_VERSION}`);

    const agentId = api.runtime?.agent?.id ?? "unknown";

    // liveness probe (keeps Phase 0 behavior)
    api.registerHttpRoute({
      path: `${API_BASE}/ping`,
      auth: "plugin",
      match: "exact",
      replaceExisting: true,
      handler: async (_req, res) => {
        writeJson(res, 200, { ok: true, plugin: PLUGIN_ID, version: PLUGIN_VERSION, ts: Date.now() });
        return true;
      },
    });

    // meta
    const metaRoute = createMetaRoute({
      pluginId: PLUGIN_ID,
      version: PLUGIN_VERSION,
      agentId,
      defaultEnv: "live",
      basePath: API_BASE,
    });
    api.registerHttpRoute({
      path: metaRoute.path,
      auth: "plugin",
      match: "exact",
      replaceExisting: true,
      handler: metaRoute.handler,
    });

    // market
    const marketRoutes = createMarketRoutes({ invoker: invokeOkx, basePath: `${API_BASE}/market` });
    for (const r of marketRoutes) {
      api.registerHttpRoute({
        path: r.path,
        auth: "plugin",
        match: "exact",
        replaceExisting: true,
        handler: r.handler,
      });
    }

    api.logger.info?.(`[${PLUGIN_ID}] ready, routes=${1 + 1 + marketRoutes.length}`);
  },
});
```

Notes:
- The `_debug/runtime` route from Phase 0 is removed.
- `agentId` comes from `api.runtime.agent.id` — if that key doesn't exist we fall back to `"unknown"`; Phase 0's ping revealed `api.runtime.agent` is present.

- [ ] **Step 2: Add test script + engines to package.json**

Modify `package.json` — add after `main`:

```json
  "engines": {
    "node": ">=20"
  },
  "scripts": {
    "test": "node --test 'src/**/*.test.js'"
  },
```

- [ ] **Step 3: Run unit tests together**

```bash
cd /home/ubuntu/okx-trade-tg-miniapp && npm test
```
Expected: all prior tests pass (`# pass 19` total: 4 invoker + 1 json + 13 market + 1 meta).

- [ ] **Step 4: Restart gateway and wait for health**

```bash
openclaw gateway restart
until curl -sf -H 'Authorization: Bearer 2e5e4e4db7bf959af5ca810dad9a64fe9c05d58dac28e650' http://127.0.0.1:18789/health > /dev/null; do sleep 2; done
echo up
```

- [ ] **Step 5: Smoke-test a real route**

```bash
curl -s 'http://127.0.0.1:18789/plugins/okx-trade-tg-miniapp/api/market/ticker?instId=BTC-USDT' | python3 -m json.tool | head -20
```
Expected: `{"ok": true, "data": [{"instType": "SPOT", "instId": "BTC-USDT", "last": "...", ...}]}`.

Also check that the removed debug route is gone:

```bash
curl -s -o /dev/null -w '%{http_code}\n' 'http://127.0.0.1:18789/plugins/okx-trade-tg-miniapp/api/_debug/runtime'
```
Expected: `404`.

- [ ] **Step 6: Commit**

```bash
cd /home/ubuntu/okx-trade-tg-miniapp && git add src/index.js package.json && git commit -m "feat: mount market + meta routes, remove Phase 0 debug route"
```

---

## Task 10 — End-to-end integration test harness (curl-based)

Since we don't have the UI yet, use a bash script to smoke-test every market route against the real OKX CLI + gateway.

**Files:**
- Create: `scripts/smoke.sh`

- [ ] **Step 1: Write the script**

Write `scripts/smoke.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE:-http://127.0.0.1:18789/plugins/okx-trade-tg-miniapp/api}"

pass=0
fail=0

check() {
  local name="$1" ; shift
  local url="$1"; shift
  local expected_code="${1:-200}"
  local body
  local code
  body="$(curl -s -w $'\n%{http_code}' "$url")"
  code="$(printf '%s' "$body" | tail -n1)"
  body="$(printf '%s' "$body" | sed '$d')"
  if [[ "$code" == "$expected_code" ]]; then
    echo "PASS $name ($code)"
    pass=$((pass+1))
  else
    echo "FAIL $name: expected $expected_code got $code"
    echo "  body: ${body:0:200}"
    fail=$((fail+1))
  fi
}

check ping           "$BASE/ping"
check meta           "$BASE/meta"
check instruments    "$BASE/instruments?instType=SPOT"
check ticker         "$BASE/ticker?instId=BTC-USDT"
check tickers        "$BASE/tickers?instType=SPOT"
check candles        "$BASE/candles?instId=BTC-USDT&bar=1H&limit=50"
check bad_instType   "$BASE/instruments?instType=XYZ" 400
check missing_instId "$BASE/ticker" 400
check bad_bar        "$BASE/candles?instId=BTC-USDT&bar=7S" 400

echo
echo "$pass passed, $fail failed"
[[ "$fail" -eq 0 ]]
```

- [ ] **Step 2: Make it executable**

```bash
chmod +x /home/ubuntu/okx-trade-tg-miniapp/scripts/smoke.sh
```

- [ ] **Step 3: Run it**

```bash
/home/ubuntu/okx-trade-tg-miniapp/scripts/smoke.sh
```
Expected: `9 passed, 0 failed`. If any route fails, check gateway logs (`openclaw logs | tail -40`) and fix before committing.

- [ ] **Step 4: Commit**

```bash
cd /home/ubuntu/okx-trade-tg-miniapp && git add scripts/smoke.sh && git commit -m "chore: smoke test script for market routes"
```

---

## Task 11 — README: running tests + smoke test

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add "Running tests" section before "## Design"**

Append these sections to `README.md`:

```markdown
## Running tests

Unit tests (no openclaw needed):
```
npm test
```

End-to-end smoke test (requires openclaw gateway running with this plugin link-installed):
```
./scripts/smoke.sh
```
```

- [ ] **Step 2: Commit**

```bash
cd /home/ubuntu/okx-trade-tg-miniapp && git add README.md && git commit -m "docs: add testing instructions"
```

---

## Self-Review

**Spec coverage:**
- ✅ OKX invoker — Tasks 1, 2
- ✅ Market instruments route — Task 4
- ✅ Market ticker route — Task 5
- ✅ Market tickers route — Task 5
- ✅ Market candles route — Task 6
- ✅ Demo/live toggle — Task 7
- ✅ Meta route — Task 8
- ✅ Wire all routes, remove Phase 0 debug — Task 9
- ✅ E2E smoke test — Task 10
- ✅ Docs — Task 11

Out of Phase 1a scope (future plans): static UI serving, frontend build, initData verification, authorization, positions, cloudflare tunnel.

**Placeholder scan:** No TBDs, no "implement later", every code block is complete and runnable.

**Type consistency:** `invokeOkx` signature stays `(args, opts)` everywhere. `createMarketRoutes` takes `{invoker, basePath}` and returns `[{path, handler}]` consistently. `OkxCliError` is exported from `src/okx/invoke.js` and imported in `src/routes/market.js`.

---

## Execution Handoff

Phase 1a plan complete, saved to `docs/superpowers/plans/2026-04-21-phase-1a-backend-market.md`.

Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session using `executing-plans`, with checkpoints for review.

Which approach?
