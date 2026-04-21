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
