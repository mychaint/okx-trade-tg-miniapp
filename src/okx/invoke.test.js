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
