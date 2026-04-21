import { writeJson } from "../util/json.js";
import { OkxCliError } from "../okx/invoke.js";

const VALID_INST_TYPES = new Set(["SPOT", "SWAP", "FUTURES", "OPTION"]);

const VALID_BARS = new Set(["1m", "3m", "5m", "15m", "30m", "1H", "2H", "4H", "6H", "12H", "1D", "1W", "1M"]);
const MAX_LIMIT = 300;
const DEFAULT_LIMIT = 300;
const DEFAULT_BAR = "1H";

function parseQuery(url) {
  try {
    const u = new URL(url, "http://local");
    return u.searchParams;
  } catch {
    return new URLSearchParams();
  }
}

function demoFromQuery(q) {
  const v = q.get("env");
  if (v === "demo") return true;
  if (v === "live") return false;
  return undefined;
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
        // OKX CLI quirk: `okx market instruments` requires the --instType FLAG, whereas `okx market tickers` takes a POSITIONAL arg. Do not "normalize" this.
        const data = await invoker(["market", "instruments", "--instType", instType], { demo: demoFromQuery(q) });
        writeJson(res, 200, { ok: true, data });
      }),
    },
    {
      path: `${basePath}/ticker`,
      handler: runWithInvoker(async (req, res) => {
        const q = parseQuery(req.url);
        const instId = q.get("instId");
        if (!instId) {
          writeJson(res, 400, { ok: false, error: "missing_param", message: "instId is required" });
          return;
        }
        const data = await invoker(["market", "ticker", instId], { demo: demoFromQuery(q) });
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
        const data = await invoker(["market", "tickers", instType], { demo: demoFromQuery(q) });
        writeJson(res, 200, { ok: true, data });
      }),
    },
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
        const data = await invoker(["market", "candles", instId, "--bar", bar, "--limit", String(limit)], { demo: demoFromQuery(q) });
        writeJson(res, 200, { ok: true, data });
      }),
    },
  ];
}
