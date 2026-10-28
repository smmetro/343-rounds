# Rounds
Building rounds and equipment test forms for plant operations at 343 Sansome St.

- Field app: https://smmetro.github.io/343-rounds/
- Admin panel: https://smmetro.github.io/343-rounds/admin.html

Sign in with a @343sansomesf.com Google account.

## What it does
- **Rounds:** readings on the phone, one row per round in the 343 Sansome Rounds Google Sheet. Round types are edited in the admin panel.
- **Tests:** Elevator Phase I & II, Generator Monthly, Diesel Fire Pump Weekly (NFPA 25 AES 5.1), Electric Fire Pump Monthly (AES 5.3). Step-by-step on the phone, printable output in Drive > Logs > Testing & Inspections.
- Works with no signal: entries save on the phone and send when signal returns.

## Repo layout
| Path | What |
|---|---|
| `index.html`, `admin.html`, `sw.js` | The app, published by GitHub Pages (must stay at the root) |
| `forms.js`, `forms-defs.js`, `forms-layout.js` | Test forms (runner, definitions, cell positions on the state forms) |
| `vendor/pdf-lib.min.js` | PDF library used to fill the fire pump forms (MIT, see `vendor/pdf-lib.LICENSE.md`) |
| `server/Code.gs`, `server/Tests.gs` | Copies of the Google Apps Script server (two files in one Apps Script project) |
| `tools/build_masters.py` | Rebuilds the blank fire pump forms + `forms-layout.js` if the state revises a form |
| `tests/` | Automated tests (`npm test`), see `tests/README.md` |
| `ROUNDS_DEV_NOTES.md` | How everything works and how to deploy |
| `CHANGELOG.md` | What changed in each version |

The repo is public. Building data, blank forms with building info, and signature images live only in Google Drive, never here.

## Deploying
1. **Server first:** paste `server/Code.gs` and `server/Tests.gs` into Apps Script, save, run `setup` if the changelog says to, then Deploy > Manage deployments > New version. Never "New deployment" (it changes the URL).
2. **App:** merge to `main`. GitHub Pages publishes within about 10 minutes and phones show an Update banner when `APP_VERSION` changes.

See `ROUNDS_DEV_NOTES.md` for details.
