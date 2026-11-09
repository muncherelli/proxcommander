# ProxCommander

Expo app for iOS, Android, and web.

```sh
pnpm install
pnpm web         # browser
pnpm ios         # iOS simulator
pnpm android     # Android emulator
pnpm typecheck
```

## Web against a real Proxmox host

Proxmox VE sends no CORS headers, so in development the browser talks to it
through a local proxy (`scripts/pve-dev-proxy.mjs`, bound to 127.0.0.1 and
usable only from localhost origins):

```sh
pnpm proxy       # terminal 1
pnpm web:pve     # terminal 2: web app routed through the proxy
```

Hosts with self-signed certificates: `PVE_PROXY_INSECURE=1 pnpm proxy`.

## Hosting

The web build is a static site deployed to Cloudflare Workers static assets
(no Worker script; see `wrangler.jsonc`, security headers in `public/_headers`):

```sh
pnpm build:web   # export to dist/
pnpm deploy:web  # build + wrangler deploy
```

The deployed site calls Proxmox directly from the browser. Each PVE host must
therefore sit behind a reverse proxy that adds CORS headers for the site's
origin (PVE's own pveproxy can't), and its TLS certificate must be trusted by
the browser.
