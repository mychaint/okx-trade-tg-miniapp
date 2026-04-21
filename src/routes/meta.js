import { writeJson } from "../util/json.js";

export function createMetaRoute({ pluginId, version, agentId, defaultEnv = "live", basePath = "/api" }) {
  return {
    path: `${basePath}/meta`,
    handler: async (_req, res) => {
      writeJson(res, 200, {
        ok: true,
        plugin: pluginId,
        version,
        agentId,
        defaultEnv,
      });
      return true;
    },
  };
}
