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
