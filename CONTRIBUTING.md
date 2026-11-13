# Contributing

ODYSSEY is a NASA Space Apps Challenge 2026 project. Issues and pull requests are welcome.

## Ground rules

* **Scientific integrity first.** Never add a value without a source. A missing measurement stays missing, never zero and never a match. Keep the three outcomes apart: *integration needed* (a dataset exists but is not connected), *field measurement required*, and *physical mismatch*. See [`docs/science/SCIENTIFIC_METHODOLOGY.md`](docs/science/SCIENTIFIC_METHODOLOGY.md) and [`src/mission/evidence.ts`](src/mission/evidence.ts).
* **No secrets.** Keys live only in a local `.env` (gitignored). Run `npm run secrets:scan` before every commit.
* **Licences.** Only add code, data or assets whose licence allows redistribution, and record them in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) or [`DATA_SOURCES.md`](DATA_SOURCES.md). Contributions are accepted under Apache-2.0.
* **Plain language** in the interface: sentence case, no em dashes, inputs that look like inputs and buttons that look like buttons.

## Before opening a pull request

```bash
npm run lint
npm run build          # type-checks the app and the server, then builds
npm test               # Node tests
npm run test:python    # pipeline tests (pip install -r scripts/requirements.txt)
npm run secrets:scan
```

When a change alters what the engine concludes (scores, decisions, evidence states), add or update a test in `server/tests/` that pins the scientific reason for it.

## Adding a data source

1. Write the acquisition script in `scripts/`, recording dataset identifier, version, access URL, resolution, units, quality flags and missing-value handling in its docstring.
2. Commit only derived values that the licence allows you to redistribute.
3. Register the quantity in `src/mission/evidence.ts` (support, method, validation, limitation, state).
4. Add the source to `DATA_SOURCES.md`.
