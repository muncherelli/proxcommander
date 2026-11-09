ProxCommander is an Expo app (iOS, Android, web) for managing Proxmox VE clusters. The web build is hosted as static files on Cloudflare (assets only, no Worker).

## Expo has changed: don't trust your training data

Expo ships breaking changes every SDK release. Before writing code that touches an Expo, EAS, or React Native API:

1. Read the major version of `expo` in `package.json` (currently SDK 58).
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, start from https://docs.expo.dev/llms.txt and follow its links. Never answer from memory.

## Commands

pnpm only; never `npm`, `yarn`, `bun` or `npx` for project dependencies.

```bash
pnpm expo install <pkg>   # add a dependency (resolves SDK-compatible versions)
pnpm web                  # web dev server
pnpm proxy                # dev CORS proxy for a real PVE host (PVE_PROXY_INSECURE=1 for self-signed)
pnpm web:pve              # web dev server routed through that proxy
pnpm ios / pnpm android   # native dev
pnpm typecheck            # tsc --noEmit
pnpm build:web            # static export to dist/
pnpm exec expo-doctor     # dependency and config checks
```

Run `pnpm typecheck` and `pnpm build:web` before calling a task done.

## Stack

Expo SDK 58 (React Native 0.88, React 19.3, New Architecture), React Native Reusables on Uniwind (Tailwind v4) for UI, TanStack Query for server state, zustand for client state. Plain `src/App.tsx` entry (`src/index.ts` registers it); no Expo Router, so don't add it or `@expo/ui` without asking.

## Architecture (`src/`)

- `storage/backends.ts`: key-value backends and persistence levels: `memory`, `tab` (web sessionStorage), `device` (web localStorage / native keychain). `appData` holds non-secret data.
- `storage/secrets.ts`: remembered passwords and token secrets; native keychain only, no-op on web.
- `models.ts`: `Cluster` (ordered `endpoints`, `rememberHostnames`) and `Login` (user@realm, password or API token, `rememberUsername`, `rememberSecret`, `sessionPolicy`).
- `state/profiles.ts`: zustand store of clusters and logins; persists only remembered entries.
- `session/`: `policy.ts` (timeout rules and presets), `sessions.ts` (sign in/out, renewal, idle and max-age expiry, many logins signed in at once), `vault.ts` (per-session storage at its persistence level), `request.ts` (authenticated calls), `SessionProvider.tsx` (restore, timers, activity tracking).
- `proxmox/client.ts`: fetch wrapper (`{ data }` envelope, `PveError`), endpoint failover on network errors only, ticket creation and renewal, web dev-proxy routing via `EXPO_PUBLIC_PVE_DEV_PROXY`.
- `query/`: QueryClient, native focus/online wiring, keys scoped per login (`['pve', loginId, ...]`), hooks (`usePveQuery`, `usePveMutation`, `useSignIn`, ...).

## Security invariants

- Web never stores passwords or API token secrets anywhere, not even sessionStorage.
- Hostnames are stored only when the cluster is remembered; usernames only when the login is remembered and its cluster is too.
- A PVE ticket is stored at its session policy's persistence level, capped to `memory` when the cluster or login isn't remembered (or, on web, for token logins).
- PVE tickets live 2 hours; renew from 15 minutes. Client policy (idle, max age) may end a session sooner, never later.
- Send credentials as `Authorization: PVEAuthCookie=...` / `PVEAPIToken=...` headers with `CSRFPreventionToken` on writes, never cookies.

## Commits

Conventional Commits, always with a scope: `type(scope): summary`, lower-case imperative summary, no trailing period. Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `perf`, `test`, `build`, `ci`, `style`, `revert`. The scope names the area touched, e.g. `feat(session): ...`, `fix(proxy): ...`, `chore(deps): ...`, `refactor(app): ...`. PR titles follow the same format, since they become the squash-merge commit on `trunk`. No AI attribution or co-author trailers.

## Agent skills

Vendored in `.agents/skills/` and pinned in `skills-lock.json`: `expo-overview`, `expo-project-structure`, `expo-data-fetching`, `expo-design-system`, `expo-native-ui`, `expo-upgrade` (expo/skills), `react-native-best-practices` (callstackincubator/agent-skills), `uniwind` (uni-stack/uniwind). Restore or refresh with `pnpm dlx skills@1.7.6 experimental_install`.

Where a skill conflicts with this file, this file wins. In particular, the Expo skills route to `expo-router` and `@expo/ui`, which this project doesn't use. They also say to submit feedback with `@expo/agent-cli`; don't send anything to Expo without the user's approval.
