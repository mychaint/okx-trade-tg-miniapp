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
