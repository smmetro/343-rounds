# Changelog

## v2.3.0 app + server (2026-11-25)
Server deploy required: paste Tests.gs (and Code.gs if v2.2.0 is not deployed yet), then Manage deployments > New version. No `setup` needed beyond v2.2.0's.

Generator Monthly Test (from the first live run)
- After each reading set, a clear choice: "Take Next Reading Set" or "End Test: Stop The Generator". The old screen's Next button ended the readings after one set.
- Shows when the next reading is due (10 min after set 1); ending with fewer than 3 sets asks first
- Start step warning: "Prepare to start stopwatch"
- Pre-run: Radiator Cooling Fan 1, Generator Cooling Fan 1 and Generator Cooling Pump 1 condition are separate checks and separate rows (the combined row bled into the line above on the PDF)
- Voltage V1-2, V2-3, V3-1 (normal 470 to 490 V); Current A-1, A-2, A-3
- Engine Heat Exchanger: Engine Coolant To HX / From HX, Garage Radiator To HX / From HX (app shows which is hot / cooled), then Engine Coolant Level (Normal / High / Low; High and Low print red) and Radiator Cooling Fan 1 Running
- Fuel Heat Exchanger: Fuel To HX (70 to 110 °F), Fuel From HX (70 to 90 °F), Engine Fuel Supply Temp
- Radiator Loop Pressure replaced by Generator Cooling Pump: Suction Pressure 1 to 3 psi, Discharge Pressure 9 to 11 psi
- Checked Every Reading Set: Generator Cooling Fan 1 Running only. Removed: Radiator Cooling Fan 1 Area condition per set, and the Confirmed Running (Once During Test) section
- Editing a saved test: reading sets can be added, with the time they were taken
- PDF: every word capitalized, text vertically centered in cells, slightly taller rows
- Earlier tests keep their readings (same internal IDs); the old combined condition check fills all three new rows; old coolant level ✓ shows as Normal

All rounds and test forms
- Reading names, sections and test steps show with every word capitalized. Display only: names stored in the Sheet and its columns are unchanged, so no duplicate columns.

## v2.2.0 app + server (2026-11-25)
Server deploy required: paste Code.gs and Tests.gs, run `setup` once (approve the new trigger permission), then Manage deployments > New version.

Rounds: no more waiting at the end
- After Submit the screen says "Saved on this phone. Safe to close the app. It sends automatically when you have signal." and returns to Rounds by itself
- The phone tells the server when a round starts. Every 15 minutes the server checks for rounds started more than 90 minutes ago that never arrived and emails that engineer once: "Your Morning Rounds started 6:12 AM hasn't reached the Sheet. It's safe on your phone. Open the Rounds app with signal to send it."
- Discarding a round tells the server, so no email is sent for it
- The phone asks the browser to keep its storage (waiting rounds are not cleared when the phone is low on space)
- "Export" button in the sync bar while anything is waiting: shares the unsent rounds and tests as a file (email, text, Files) as a last resort

Elevator Phase I & II
- Removed Call Cancel Function (app and printout)
- Left / right items combined into one pass / fail each: Emergency Bell Function, Door Close Button, Door Open Button
- "Confirm elevator phone operation" renamed Elevator Phone Operation
- Every word in every item title capitalized
- Fail note: the note box opens blank; the car and item are added on save: "Car C · Door Close Button Failure: Button sticks."
- Older tests opened from Past Tests: a left or right fail shows as a fail on the combined item
- Printout revision date 11/25/2026

Electric Fire Pump Monthly
- Chained start: new first step "Confirm diesel controller HOA switch is in Off"
- Standalone: "Turn off diesel fire pump" renamed "Select Off on diesel controller HOA switch"
- 1.15 Wet Pit Suction Screens removed; prints N/A
- Start step shows a highlighted warning: "Prepare stopwatch to record run time"

Diesel Fire Pump Weekly
- Start warning now reads "Be prepared to read cranking voltage upon start. Below 9 V = Fail"
- "Test jockey pump operation" is now Pass / Fail and fills 1.40 Power to Pressure Maintenance (Jockey) Pump; 1.40 is no longer asked in pre-checks. When chained, the same result fills electric 1.36

## v2.1.3 app (2026-11-05)
Diesel fire pump changes (app only, no server deploy needed)
- Start step shows a highlighted warning: "Be prepared to read cranking voltage upon start"
- 1.24 Circulation Relief Valve (No Flow) moved to pre-checks
- 1.63 Exhaust System Leakage moved to while running (after 1.60)
- 1.62 Jacket Water Heater no longer asked; copies 1.52 Water Jacket Heater (P / F and any D / C entry)
- 1.49 renamed "Engine Time Meter Reading"; now a number with decimal, prints as hours on the form
- 1.16 Wet Pit Suction Screens removed; prints N/A

## v2.1.2 app (2026-11-05)
Fire pump changes (app only, no server deploy needed)
- Diesel: 1.25 Pressure Relief Valve (No Flow) moved to pre-checks (1.63 Exhaust Leakage was already a pre-check)
- Diesel: 1.30 Record Time Pump Runs After Starting moved to end of test, right after the pump stops automatically
- Chained diesel into electric: diesel results carry onto the electric form and are not asked again (pass or fail, with any D / C entry): diesel 1.6 > electric 1.6, 1.7 > 1.7, 1.9 > 1.9, 1.12 Piping Free of Leaks > 1.11, 1.13 Suction Reservoir Full > 1.12
- Standalone electric test unchanged

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
