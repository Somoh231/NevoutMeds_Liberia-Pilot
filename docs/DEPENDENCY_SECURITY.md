# Dependency and security maintenance

Reviewed 2026-09-23 with `npm audit` (full tree) and `npm audit --omit=dev` (what ships).

## Advisories

| Package (installed) | Severity | Ships to users? | Advisories | Exploitable in NevOut Meds? | Safe fix | Decision |
|---|---|---|---|---|---|---|
| `vite` 5.4.21 (dev) | high | **No.** Build tool only; production is static files on Vercel | `server.fs.deny` bypass on **Windows** alternate paths; launch-editor NTLMv2 disclosure (**Windows**); optimized-deps `.map` path traversal | **No.** All three need a *running dev server* reachable by an attacker. The dev server binds to `localhost` by default and is never used in production. | Vite **8.x**, three majors ahead. `vite-plugin-pwa` and `@vitejs/plugin-react` compatibility must be re-validated. | **Deferred.** Mitigation: never run `vite --host` on an untrusted network. Upgrade in a post-pilot maintenance block, with full regression. |
| `esbuild` 0.21.5 (via vite, dev) | moderate | No | Dev server accepts cross-origin requests | No, for the same reason | Comes with Vite 8 | Deferred, with Vite |
| `react-router` / `react-router-dom` 6.30.6 | moderate | **Yes** | (1) Open redirect via backslash in `<Link>` / `useNavigate` (CVE-2025-68470 bypass); (2) constructor injection in **SSR** hydration `deserializeErrors()` | **(1) Mitigated.** The only externally influenced navigation target is the post-login redirect, from router *state* not the URL, and `safeInternalPath` rejects anything not starting with a single `/` (so `//…` and `/\…` are refused). Every other navigation target is a constant. **(2) Not applicable.** No SSR or data-router hydration. | 7.18.4: a major. Library mode is largely compatible, but it's a routing change days before a pilot. | **Deferred** to post-pilot, with a full-regression upgrade. It is the only runtime advisory. |
| `xlsx` | (was high) | Yes (import worker) | Prototype pollution / ReDoS in older SheetJS | **Fixed.** Uses SheetJS **0.20.3** from the official CDN tarball, not the unmaintained npm package. Parsing runs in a Web Worker, lazily, only on the Import screen. | — | Done (Phase 1) |

`npm audit --omit=dev` reports only the React Router item. `npm audit` also reports the dev-only
Vite and esbuild items.

## Secrets hygiene (verified 2026-09-23)

- **Production bundle:** only the public anon JWT. No service-role JWT, no `sb_secret_` key, and
  no `VITE_DEMO_MODE`.
- **Git history** (all branches, public repository): **no JWT of any kind and no secret keys ever
  committed.**
- **Operator tooling:**
  - Every secret is read from a `chmod 600` file or the environment, never from argv, and is never
    printed.
  - `ops/backup/backup.env`, `*.key`, ops logs and backup artifacts are gitignored.
- **Test tooling:**
  - The synthetic test password is in the public repository, so production **must not** hold test
    accounts.
  - `seed_remote.mjs` and the pilot suite refuse the production project.
  - The production smoke test uses only a dedicated account supplied through env and a file.

## Next maintenance window (post-pilot)

1. `react-router-dom` → 7.x (then run the full UI regression).
2. `vite` → 8.x with `vite-plugin-pwa` and `@vitejs/plugin-react` upgrades (check the service
   worker, precache and install behaviour).
3. Supabase CLI → latest (v2.98.2 installed; v2.117 available).
4. Re-run `npm audit` and update this file.
