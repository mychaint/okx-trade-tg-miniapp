# okx-trade-tg-miniapp

Telegram Mini App plugin for [openclaw](https://github.com/openclaw/openclaw). Surfaces OKX market data and personal positions inside a Telegram chat, backed by `@okx_ai/okx-trade-cli`.

**Status:** Phase 1a — market data backend routes complete (instruments / ticker / tickers / candles / meta / ping). 24 unit tests + smoke script. Frontend (Phase 1b), auth, positions, and Cloudflare Tunnel setup are not yet implemented.

## Install (development)

```
openclaw plugins install --link /path/to/okx-trade-tg-miniapp
openclaw gateway restart
```

## Install (end users, once published)

```
openclaw plugins install github.com/mychaint/okx-trade-tg-miniapp
```

## Running tests

Unit tests (no openclaw gateway needed):

```
npm test
```

End-to-end smoke test (requires openclaw gateway running with this plugin link-installed):

```
./scripts/smoke.sh
```

## Design

- Runs in the `main` agent as a stateless tool.
- Identifies the originating TG bot by verifying `initData` HMAC against every registered bot token; routes to the matching sub-agent's OKX state.
- Sub-processes `okx` (from `@okx_ai/okx-trade-cli`) for all OKX access — does not hold OAuth/API-key state itself.
- Static UI (React + Vite) shipped pre-built under `ui/dist/`.
- Cloudflare Tunnel fronts the openclaw gateway; a setup command handles first-time tunnel configuration.
