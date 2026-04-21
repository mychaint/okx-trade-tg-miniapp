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
