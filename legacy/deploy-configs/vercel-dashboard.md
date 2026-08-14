# Archived Vercel dashboard deployment

Vercel is no longer an active deployment path. These notes are retained only for
historical migrations.

- Root directory: `dashboard`
- Build command: `npm run build`
- Output directory: `dist`
- `VITE_API_URL` had to be set to an HTTPS, origin-only Container Apps URL.
- SPA navigation required a catch-all rewrite to `/index.html`.
- Every production/preview domain had to be added explicitly to the API CORS allowlist.

This manual URL coupling caused the stale-hostname production incident. The supported
SWA workflow now queries Azure at build time and should be used instead.
