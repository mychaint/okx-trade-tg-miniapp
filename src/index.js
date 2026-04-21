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
