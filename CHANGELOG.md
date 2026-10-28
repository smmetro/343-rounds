# Changelog

## v2.1.1 server (2026-10-28)
- Generator and Elevator PDFs export fit-to-page (Generator was spilling onto a second page)
- Row heights locked so wrapped text can't push the page longer; wider value column on the Generator sheet
- Short pause before PDF export so the signature image is included
- testFormsSelfCheck replaces its earlier samples and warns if signature files are missing

## v2.1.0 (2026-10-26)
Test forms: Elevator Phase I & II, Generator Monthly, Diesel Fire Pump Weekly, Electric Fire Pump Monthly.
- New "Tests" section on the home screen; Past Tests list to edit or reprint any saved test
- Step-by-step runner: procedure steps must be checked before moving on; pre-checks, start, while-running, restore
- Fire pumps fill the official CA AES 5.1 / 5.3 forms: P / F, readings with units, pre-filled pressures and N/A items, Comments and Deficiencies page, per-column signature
- Diesel: one form per calendar month (5 weeks). Electric: six tests per form. Diesel can chain straight into electric with one restore at the end
- Any F asks to confirm, then requires a D / C entry (fire pumps) or a note (elevator). Electric 1.28 under 10 min is an automatic Fail
- Generator: No-Load / ATS Transfer / Load Bank, up to 6 timed reading sets, "Same as last" for voltage and current, out-of-range readings shown red (no alerts)
- Elevator: Phase 1 item-by-item across cars, Phase 2 car by car, return to normal last; notes fill the printed page
- Generator and Elevator save as a Google Sheet with a PDF copy beside it (Logs > Testing & Inspections > ... > year)
- Cancel test: Discard / Save as Incomplete / Keep Testing; walks through only the restore steps needed
- Works with no signal: drafts resume after closing; saved tests wait in the outbox
- Server: Tests.gs (new file), Test Records tab, Test Form Assets folder; Code.gs routes testSync / testAssets / submitTest
- Tests rebuilt: `npm test` (server simulation + phone app)

## v2.0.0 (2026-10-17)
Full rebuild. Supabase removed; Google Sheet is the database.
- Google sign-in (343sansomesf.com only); no passwords or invite emails
- Built-in number pad; header and progress always on screen
- Status answers auto-advance; abnormal readings need a Confirm tap
- Notes as cell notes + Notes Log tab; photos to Drive, linked from the reading's cell
- Offline outbox: rounds and photos send when signal returns; app opens with no signal (sw.js, network-first)
- Resume after closing Chrome; review screen before submit
- Last reading, 8-point trend, last note on each reading; big-change and meter-rollback checks
- Alert emails; Alerts Log; cell shading (red alert, yellow warning, blue note/photo)
- Weather captured server-side for round start time (SFOC1, SFO fills sky/wind)
- Sheet columns tied to permanent reading IDs; removed readings move to Retired columns
- Admin: real forms, apostrophe-safe, validation, users + round assignment, publish history with restore
- "Update available" banner
- History migrated from Supabase: 190 rounds, duplicate-name values corrected, 35 notes restored
- Config fix: CTWP 1 Suction depends on CTWP 1 Online?

## v1 (May to October 2026)
Supabase backend, Apps Script sync to the old Sheet (343sansomestreet@gmail.com). Retired.
