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
