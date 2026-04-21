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
