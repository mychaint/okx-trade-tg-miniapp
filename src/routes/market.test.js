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
