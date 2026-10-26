# Tests

`npm test` runs both suites (no installs needed beyond Node, Python 3, Playwright + Chromium, poppler-utils, qpdf).

| Suite | What it checks |
|---|---|
| `tests/server_test.cjs` | The real `server/Code.gs` + `server/Tests.gs` against simulated Google services (Sheets, Drive, export). Routing, sessions, Test Records, fire pump file replacement, Generator / Elevator Sheet build, edits, self-check. Renders the built Sheets to `tests/output/sheet_*.html`. |
| `tests/app_test.py` | The real `index.html` in Chromium at iPhone size against a simulated server. Rounds still work; all four test forms walked end to end (procedure gating, fail entries, chaining, cancel/restore, generator sets, elevator order, edit later, offline outbox, resume). Writes generated fire pump PDFs and screenshots to `tests/output/`. |

`tests/fixtures/` must hold copies of the four files in Drive > Logs > Rounds > Test Form Assets:
`master_diesel.pdf`, `master_electric.pdf`, `sig_scott.png`, `sig_jacky.png`.
They are private (signatures) and are never committed (`.gitignore`).
