# Legacy deployment configs (unsupported)

These files are kept for reference only. They are **not maintained** and are not part of the
supported deployment story for this project.

| File | What it was for |
|---|---|
| `fly.toml` | Fly.io app config for the backend |
| `railway.json` | Railway.app build/deploy config for the backend |
| `render.yaml` | Render.com web service + managed Redis config for the backend |
| `Dockerfile.fly` | Fly.io-flavored variant of the root `Dockerfile` |
| `SELF_HOSTING.md` | Guide for self-hosting the backend on your own VPS/server |
| `SELF_HOSTING_QUICK.md` | Condensed version of the self-hosting guide |

## Why these were retired

The project previously supported four competing deployment paths (Fly.io, Railway, Render, and
self-hosting) plus Docker Compose for local dev. That created confusion about which path was
"the real one" and none of them had infrastructure-as-code behind them.

The project now has **one supported deployment story**:

- **Local development** — Docker Compose (`docker-compose.yml` at the repo root).
- **Frontend** — [Vercel](https://vercel.com) (`dashboard/`).
- **Backend** — Azure Container Apps, provisioned via Terraform (`terraform/`).

See the root [`README.md`](../../README.md) and [`docs/OPERATIONS.md`](../../docs/OPERATIONS.md)
for the current deployment instructions.

## If you still want to use one of these platforms

The root `Dockerfile` is a standard multi-stage Node.js build with no platform-specific
assumptions baked in — it should work on any of Fly.io/Railway/Render/a VPS with minimal or no
changes. These files are left here as a starting point, but you're on your own for keeping them
working: they are not covered by CI, and application changes (new env vars, new secrets, etc.)
are not guaranteed to be reflected here going forward.
