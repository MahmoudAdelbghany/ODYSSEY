# Security

## Reporting a vulnerability

Please do not open a public issue for a security problem. Use GitHub's private
vulnerability reporting ("Security" tab → "Report a vulnerability") on this
repository. Include steps to reproduce and the affected version. ODYSSEY is a
hackathon research prototype without a support team; reports are handled on a
best-effort basis.

Never include API keys in a report, an issue or a pull request.


## Secrets

* Secrets are read only by the backend (`server/config.ts`) from the process
  environment or a local `.env`. `.env` and `.env.*` are gitignored
  (`!.env.example` is the only exception). `.env.example` holds placeholders only.
* No `VITE_` variables are defined; Vite exposes only `VITE_`-prefixed values to the
  browser, so no credential can reach the client bundle.
* The Python bridge receives keys through its environment, never through argv
  (argv is visible in process listings) and never by reading a `.env` itself.
* `redact()` strips configured secrets and any `oc_sk_…` string from errors,
  logs, events and API responses. The health endpoint reports capabilities only.
* `npm run secrets:scan` scans tracked and untracked source files **and the built
  `dist/` bundle** for credential patterns and for every key/token value present
  in the local `.env`. Run it before every commit and after every build.
  `npm run secrets:history` scans every blob reachable from any Git ref; add
  `--privacy` to also report local home paths and e-mail addresses.

### Credential exposure notice

The OpenCode and Serper keys used during development were pasted into a chat
session with an AI assistant. They were never written to git, documentation or
the client bundle (scan passes), but the owner should **rotate both keys** before
any public deployment or demo.

## Network boundaries

* Evidence retrieval: HTTPS only; host must be on the allow-list for the initial
  URL *and every redirect hop* (manual redirect handling, max 3 hops); URLs with
  credentials or non-443 ports are refused; 25 s timeout; 15 MB limit; content
  types limited to HTML/text/PDF. PDFs are parsed by `pdftotext` in a temporary
  directory that is removed afterwards.
* Search: Serper results are re-filtered locally by Earth-Location-Nasa
  (`canonical_url` rejects lookalike hosts, credentials and non-standard ports).
* The model treats source text as data: extraction prompts say so explicitly, and
  extracted claims are only kept after verbatim and numeric checks, which limits
  the effect of prompt injection inside retrieved pages to discarded claims.

## API

* Optional bearer token (`ODYSSEY_API_TOKEN`) on all mutating endpoints, compared
  in constant time.
* Per-IP token-bucket rate limits: 600/min overall, run creation 0.2/min with a
  burst of 6, feedback 6/min, simulations 120/min.
* Input validation with structured error codes; request bodies capped (64 KB);
  run ids validated as UUIDs; concurrency capped (`ODYSSEY_MAX_CONCURRENT_RUNS`).
* `x-content-type-options: nosniff`, `referrer-policy: no-referrer`. Bind to
  `127.0.0.1` by default; put a TLS reverse proxy in front for remote access.

## Known gaps

No per-user accounts or roles (single shared token). No CSRF protection beyond
the bearer token (do not rely on cookies). The SQLite database stores retrieved
source text; treat `server/data/` as sensitive and keep it out of images.
