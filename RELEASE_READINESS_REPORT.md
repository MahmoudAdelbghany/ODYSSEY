# ODYSSEY: Release Readiness Report

Date: 2026-11-14 · Candidate: version 1.0.0 · Status: **ready for owner review, NOT published.**

Nothing has been committed, pushed or made public. The release candidate passes every automated check below. Publication still needs owner decisions on the blockers in §1, plus explicit authorisation to push.

## 1. Blockers and owner decisions

| # | Item | Status | What is needed |
|---|---|---|---|
| 1 | **Earth-Location-Nasa has no licence** (`mernaahany/Earth-Location-Nasa`, public, no LICENSE file) | Handled by exclusion | Not in the release. The app detects its absence and disables evidence search. To use it in the release, ask the author to add an OSI licence. |
| 2 | **Reranker is private** (`WA-on-test2/Reranker`, Apache-2.0) | Handled by exclusion | Not in the release; literature reranking is disabled without it. Its owner may make it public. |
| 3 | **Existing Git history** contains a work e-mail address as commit author (27 of 31 commits) and about 250 MB of old media | Open | Recommended: publish a **fresh history** (one commit of the release candidate) under the owner's GitHub noreply address, rather than pushing this history. This needs no force-push, because the repository has no remote yet. |
| 4 | **Rotate API keys.** The OpenCode and Serper keys were pasted into an AI chat during development. | Open | Rotate both. They are not in any tracked file, built asset, demo export or historical blob (scanned), but they were exposed outside the repository. Removing a key from files would not remove it from history; here it was never committed. |
| 5 | **Public demo URL** | Done | Deployed on Azure Container Apps: https://odyssey.qd.je |
| 6 | **Decorative image provenance** | Done | The starfield, grain and poster images of unknown origin were removed. The starfield and grain are now generated procedurally (`public/img/stars.svg`, `grain.svg`). |
| 7 | **Team name, repository URL, project page** | Done | Team ناسا سبيس ابس جدا; repository and NASA project page linked in `README.md` and the submission notes. |
| 8 | **RADARSAT-1 attribution wording** | Minor | CSA states the archive is "released under an open license"; confirm the exact credit line. |
| 9 | **WorldClim 2.1 terms** | Minor | No licence is stated on the WorldClim 2.1 page (citation requested). Only derived per-region statistics are committed, not the rasters. |
| 10 | **Legacy `?full` mode** calls Pollinations (a free LLM) from the browser | Disclosed | Not part of the current workspace. Disclosed in `THIRD_PARTY_NOTICES.md` and the submission AI list. Removing the mode would also remove its 4 lint warnings; that is the owner's choice. |
| 11 | **China-entity rule** (DeepSeek in-product model; one Chang'E-4 reference) | Owner to confirm with Local Lead | The model is one setting (`OPENCODE_MODEL`). |

## 2. Checks

All automated checks were run on 2026-11-14, both in this working copy and in a **fresh clone** of the release candidate produced by `scripts/release-check.sh`. The clone had no `.env`, no `external/` and no database.

| Check | Command | Result |
|---|---|---|
| Install from lockfile | `npm ci` | Pass (103 packages) |
| Lint | `npm run lint` | Pass (exit 0; 4 warnings, all in legacy `?full`-mode files) |
| TypeScript, app and server | `npm run build` (runs `tsc -b` and the server tsconfig) | Pass |
| Production build | `npm run build` | Pass |
| Node tests, working copy | `npm test` | **71 pass**, 0 fail, 3 skipped (live tests need keys) |
| Node tests, fresh clone | `npm test` | **68 pass**, 0 fail, 6 skipped (3 live + 3 that need the optional components) |
| Python tests | `npm run test:python` with `scripts/requirements.txt` | **48 pass** (Python 3.13) |
| Secret scan: working tree and built assets | `npm run secrets:scan` | Pass (220 files + 7 bundle files, checked against both real key values) |
| Secret scan: full Git history | `npm run secrets:history` | Pass (276 historical blobs, against both real key values) |
| Secret scan: generated reports and demo exports | included in the scans above (`docs/demo/agent-run/`) | Pass; no keys, local paths or session data |
| Screenshots | visual review of `docs/screenshots/` | Pass; only the app UI, no keys or browser chrome |
| Privacy scan | `node scripts/secret-scan.mjs --privacy` | Local paths removed; remaining hits are a test fixture address and this report |
| `.env` not tracked | `git ls-files` | Pass; only `.env.example` (placeholders) |
| Submodules | n/a | Removed from the release; optional components documented |
| Local links | `python3 scripts/check_links.py` | Pass (0 broken; 1 in archived `docs/history/`) |
| External links | `python3 scripts/check_links.py --external` | 22 of 30 answer. 8 return HTTP 403 from Wiley/Science via DOI (automated clients blocked); those DOIs were confirmed through arXiv, NTRS and OpenAlex abstracts. |
| Source citations | manual | Every published reference was read in its original abstract or document (see `docs/science/DATASET_EXPANSION_REPORT.md`). |
| Licence compatibility | manual, `npm ls --omit=dev --all` | Pass: all production npm packages are MIT/ISC/Apache-2.0/0BSD/Unlicense; fonts OFL-1.1 with `public/fonts/OFL.txt`; Apache-2.0 for project code |
| Fresh-clone demo, no keys | `npm start`, POST the sample brief | Pass: the run completed in 2 s (deterministic planner, 36 tool calls, 0 failures); 8 evidence gaps explained; the Markdown and JSON reports export |
| Production UI from the clone | browser at 390 × 844 | Pass: renders the run, no console errors, no horizontal overflow |
| Live LLM demo | run `65a483d3` (saved in `docs/demo/agent-run/`) | Pass on 2026-11-14 with OpenCode and Serper |
| Minimum Node version | Node 22.13 | **Not tested.** Declared as the minimum because of `node:sqlite`; tested only on Node 26.0. Downloading another Node version was not permitted in this environment. |
| Public application link | n/a | **Not available** (blocker 5) |
| Largest file | n/a | 9.6 MB (`public/tex/earth/clouds_8k.webp`); 227 MB in total |

## 3. What changed for the release

* Added `LICENSE` (official Apache-2.0 text, SHA-256 `cfc7749b…3d30`), `NOTICE`, `THIRD_PARTY_NOTICES.md`, `DATA_SOURCES.md`, `CONTRIBUTING.md` and `public/fonts/OFL.txt`; updated `SECURITY.md`.
* `README.md` rewritten, with current screenshots. Added `docs/demo/README.md` and `docs/submission/NASA_SPACE_APPS_SUBMISSION.md`.
* Docs reorganised into `docs/architecture`, `docs/science`, `docs/screenshots`, `docs/demo` and `docs/submission`. 15 sprint and milestone reports and the old-UI screenshots are archived in `docs/history/`.
* `package.json`: name, version 1.0.0, licence and `engines.node >= 22.13.0`, plus `test:python` and `secrets:history` scripts. Added `pyproject.toml`, `scripts/requirements.txt` and `uv.lock` (58 packages, no local paths) for pinned pipeline dependencies (Python ≥ 3.12).
* `.gitignore` rewritten. Removed from the index (still on disk): legacy demo videos and Edge-TTS narration, `public/odyssey-demo.mp4`, and the submodules with `.gitmodules`.
* `server/config.ts` detects the optional components; their tools now return clear preconditions instead of failing, and their tests skip when they are absent.
* Globe hint says "Pinch to zoom" on touch screens.
* New tools: `scripts/release-check.sh` (fresh-clone verification), `scripts/check_links.py`, and secret-scan `--history` / `--privacy` modes.

## 4. Proposed GitHub settings

* **Name:** `ODYSSEY` · **Visibility:** public · **Default branch:** `main`
* **Description:** "Plan Moon and Mars field tests on Earth from open NASA and ESA data, and see exactly where Earth falls short. NASA Space Apps 2026."
* **Topics:** `nasa-space-apps`, `space-apps-2026`, `planetary-science`, `lunar`, `mars`, `analog-sites`, `remote-sensing`, `earth-observation`, `geospatial`, `ai-agent`, `threejs`, `react`, `typescript`
* **Release:** tag `v1.0.0`, "ODYSSEY 1.0.0: NASA Space Apps 2026 submission", body = README summary + the demonstration section.
* Enable private vulnerability reporting (referenced in `SECURITY.md`).

## 5. Publication steps (for the owner, after review)

```bash
scripts/release-check.sh /tmp/odyssey-release          # must end with "release check passed"
cd /tmp/odyssey-release/candidate
git commit --amend --reset-author -m "ODYSSEY 1.0.0"    # with your GitHub noreply identity configured
git tag -a v1.0.0 -m "ODYSSEY 1.0.0: NASA Space Apps 2026 submission"
gh repo create ODYSSEY --public --source . --push --description "<see §4>"
git push origin v1.0.0
```

Then fill in the repository URL in `docs/submission/NASA_SPACE_APPS_SUBMISSION.md`.
