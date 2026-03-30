# Local dev ports (this repo — tavarios.com stack)

| Role     | Port |
|----------|------|
| Backend  | **5005** |
| Frontend | **3005** |

**Source of truth:** [`config/dev-ports.json`](config/dev-ports.json) — change ports only there, then align any one-off docs if needed.

## Running next to KiddConnect (or another clone)

If you have **two** checkouts of this codebase (or a KiddConnect-focused tree) open at once, give **each repo its own** `config/dev-ports.json`. This workspace is pinned to **5005 / 3005** for Tavari / tavarios local dev; use **different** numbers in the other project (for example **5003 / 3003**) so nothing collides.

## Commands

- **API:** from repo root, `npm run dev` (uses `start-dev.ps1` on Windows) or `npm run dev:raw` → listens on `PORT` if set, else port from `dev-ports.json`.
- **Next.js:** `cd frontend && npm run dev` → `next dev -p` uses the **frontend** port from `dev-ports.json` (currently 3005).

## `.env` and `PORT`

- **Local dev:** The API **ignores** `PORT` from `.env` unless `NODE_ENV=production`. It always listens on the **backend** port from `dev-ports.json` (5005). That way an old `PORT=5001` line cannot override your chosen ports.
- **Production (Railway):** `NODE_ENV=production` and **`PORT`** from the platform are used.

If you still set `YOUTUBE_REDIRECT_URI` to `http://localhost:5001/...`, dev mode rewrites the API base to port **5005** so OAuth matches the server.

**Frontend:** If `frontend/.env.local` sets `NEXT_PUBLIC_API_URL=http://localhost:5001`, the UI will call the wrong port. Remove it or set `http://localhost:5005` (or rely on `next.config.js`, which reads `dev-ports.json`).

## Production

- **Do not** rely on `dev-ports.json` in production. Railway sets **`PORT`**; Vercel sets **`NEXT_PUBLIC_API_URL`** for the API.

## Related files

- `config/load-dev-ports.js` — read by `server.js` and `config/public-urls.js`
- `frontend/next.config.js` — dev default `NEXT_PUBLIC_API_URL` = `http://localhost:<backend>`
- `server.js` — CORS allows `http://localhost:<frontend>` and `127.0.0.1` via `getDevFrontendPort()`
- `start-dev.ps1` / `kill-port.ps1` — read backend port from `config/dev-ports.json`

## Guide for other agents (other repositories)

See also [`docs/DEV_PORTS_AGENT_GUIDE.md`](./docs/DEV_PORTS_AGENT_GUIDE.md) for the same pattern applied generically.
