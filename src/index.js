import { definePluginEntry } from "openclaw/plugin-sdk/core";

const PLUGIN_ID = "okx-trade-tg-miniapp";
const PLUGIN_VERSION = "0.0.1";

export default definePluginEntry({
  id: PLUGIN_ID,
  name: "OKX Trade TG Mini App",
  description: "Telegram Mini App for OKX market data and personal positions.",
  async register(api) {
    api.logger.info?.(`[${PLUGIN_ID}] registering v${PLUGIN_VERSION}`);

    api.registerHttpRoute({
      path: `/plugins/${PLUGIN_ID}/api/ping`,
      auth: "plugin",
      match: "exact",
      replaceExisting: true,
      handler: async (_req, res) => {
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({
          ok: true,
          plugin: PLUGIN_ID,
          version: PLUGIN_VERSION,
          ts: Date.now(),
        }));
        return true;
      },
    });

    api.logger.info?.(`[${PLUGIN_ID}] ready`);
  },
});
