# VN Import Toolkit

This repository is independent of the other homelab applications. Do not edit
neighbouring projects, reverse proxies or services as part of normal work here.

## Host resource safety

Do not run Wine on this home server. The Windows packaging tests on 2026-09-21
coincided with a runaway explorer.exe process explosion and host-wide OOM outages
reported by the user. No Wine processes remained in this task's prefixes when
checked afterward. Native Windows execution tests belong on the user's Z13 or
in a dedicated VM with enforced memory/process limits. Keep local packaging and
static checks bounded; do not troubleshoot the NIC or unrelated recovery units
as part of this task. See `docs/windows-build.md` for the incomplete test evidence.

## Shared-engine investigation

CLANNAD is a working reference baseline: read `docs/clannad-engine-fingerprint.md`
before bespoke work on a new PS2 VN, especially AIR, planetarian or Tomoyo After.
These candidates are untested, not claimed HuneX-compatible. Compare actual
parsers, opcode semantics and ELF consumers; investigate animation reuse at the
engine layer before implementing more edition-specific animation. Preserve
existing CLANNAD code and measured fidelity limits. Add an evidence-backed
fingerprint for each subsequently supported game.

Before reverse-engineering a new ISO format, follow the evidence and upstream
parser checks in `docs/adapters.md#shared-engine-investigation`. Compare observed
structures with both Remember11 and CLANNAD; do not assume every title is an
independent engine. Investigate KID/MAGES and other families when signatures fit.
The guide records the user's upstream research leads. Label confirmed, probable
and unknown compatibility separately, with edition-specific evidence. Shared
middleware or filenames alone do not establish a shared script VM. Reuse proven
parsers/helpers after licence checks; do not merge adapters based on attribution
alone. This policy does not require restarting current work or resuming Pia.

## Planned distribution work

Windows test installer: read `docs/windows.md` and `docs/windows-build.md`.
`windows/Launcher.cs` uses native WinForms/tray and a private pipe to
`vnkit/desktop_server.py`; port settings and opt-in HKCU start-at-login are local.
Keep loopback binding, exclusive Windows sockets, data-folder locking, UTF-8
startup and active-import stop protection. Installer uses pinned app-local tools;
uninstall preserves the separate data directory. `tests/test_desktop.py` and
`tests/test_windows.py` use temporary listeners. A real Windows install/full
conversion is still a device test, not established by cross-compilation or Linux
tests. `scripts/build-windows-package.py` builds a private test artifact; no public
publication is authorized. Keep its explicit tool/source selection separate from
the ordinary code-only package allowlist. The older Tk preview remains optional.

Read `docs/bring-your-own-iso-plan.md` when asked to implement a distributable
owner-supplied ISO workflow. It prioritizes a clean reproducible local import and
Add game UI, with direct-ISO media loading and native-animation fidelity as separate
later work. The initial import GUI/job layer is now implemented; see
`docs/import-gui.md` for its tested limits. Remaining roadmap milestones are not
completed support or authorization to publish. `docs/next-session.md` links both.

## Active target: Remember11; retain CLANNAD

The user authorized a playable Remember11 adapter with shared reader features.
Read `docs/remember11-runtime.md` and `docs/remember11-import.md`. Japanese PS2
SLPM-65550 v1.02 uses KID, not CLANNAD's HuneX engine. The source-script import
`private/library/remember11-live` runs alongside CLANNAD. The old investigation
is historical; the current CLI uses `remember11_import.py`. Do not claim
universal PS2 or KID support. Pia remains paused.

167 scripts / 128,290 instructions parse; 16 unsupported sites remain in original
DBG_* files. Full validation intentionally exits 3. Native effects, extras and
audiovisual fidelity remain incomplete. Original media, recovered tables, route
paths and test evidence stay private. Keep source-located fail-closed errors and
independent progress/activity. Character X is a centre anchor; BG/EV use a
different origin. Never apply CLANNAD's portrait offsets or native semantics here.

Run `node tests/remember11-vm.test.mjs`, the real smoke/browser harnesses and
`node scripts/validate-remember11.mjs private/library/remember11-live` for changes.
Shared-save browser tests accept VNKIT_GAME_ID, VNKIT_ROUTE_ID and VNKIT_CHECKPOINT
for this adapter, always with a temporary server/profile. Preserve existing
CLANNAD imports, saves and reader features.

The native read catalog uses compact 32-bit words; restore/progress migrate the
old verbose flags without touching study history. A full late-game save bank is
tested against existing server limits. Do not raise limits to hide an unbounded
per-line catalog. Private read paths are replayed with
`scripts/build-remember11-read-paths.mjs`; both source-earned chapter clears have
fresh replay evidence. Completed-route assumptions affect Skip read/red text,
never statistics. Keep path inputs/sidecars out of public packages.

## Existing playable target: CLANNAD

The user switched to `Clannad (Japan).iso`; **do not work on the Pia Carrot ISO
or its adapter while paused**. Reuse shared infrastructure. The user now requests CLANNAD-style lavender/gold
chrome with adjustable hue/saturation/surface opacity and a Dim surroundings toggle; see `docs/reader-interface.md`. The library
now has original blue console-era styling and optional CRT artwork filtering;
read `docs/crt-display.md` before changing the compositor. Preserve selectable
DOM text, atomic portrait composition, explicit GPU fallback and independent
per-device CRT preferences. `web/layout.mjs` / `web/layout.css` fit a complete
source-proportioned frame to the viewport; dialogue must remain inside it on
phones, including fullscreen. Do not restore the old mobile stacked-text layout.
Fullscreen controls live in the small ☰ menu. Use `tests/browser-mobile-layout.mjs`
for Firefox/Chromium geometry, opacity, touch and fullscreen checks; see testing
docs for the private Firefox test environment. Local `.hide-from-library` markers hide Pia without
deleting imports; the standalone reader does not require the ISO at runtime. CLANNAD is Japanese PS2 SLPM-66302 v1.01, HuneX (not PC
RealLive). Read `docs/clannad-runtime.md`, `docs/formats-clannad-ps2.md` and
`docs/next-session.md` before continuing. `private/library/clannad-live` is active.

The reader has basic implementations for every discovered script command site:
203 scripts, 308,727 instructions, zero unsupported sites and 97,783 resolved
direct references. Full fidelity is still incomplete (81 atlas/format entries,
native credits/MZD/montages, timing/audio gaps and no PS2 comparison). Full
validation intentionally exits 3. Read `docs/clannad-basic-execution.md`.

The latest bounded headless campaign reaches 69,738 logical text segments,
481 choice edges, 15 source endings and 164 scripts in 1,000 runs. Its two stops
were one optional display-hint restore mismatch, now fixed and checked at the
reached checkpoint for 200 boundaries. No unsupported opcode was reached. Timing
is simulated; not all routes/After Story are verified. The first-option run reaches
an ending after 5,320 segments/28 choices. Current Chromium covers 100 consecutive
pages after the former event-41 stop, later choice branches, 15 slots, movie/voice
completion, progress preservation and mobile layout. Historical 2,450 entry pages
belong to the earlier build; do not combine these counts or claim all-route fidelity.

Persistent G progress is separate from game slots and learning history. New runs
reset F/Z, including native F[500]=1. Old saves missing F[500] are migrated;
ordinary slot loads retain current persistent G. Preserve global-progress backup
and the native AFTER STORY gate; do not expose arbitrary future scenes. The native
77 transfer prompt and earned After Story entry still need real-route testing.
Timed text and CLR_/CLNV flushes must not silently discard buffered Japanese.
Unknown commands remain fail-closed; the basic native allowlist is explicit.

Menus/progress/date/sound-test additions: read `docs/clannad-menu.md`. Endings
open the main menu; never equate bad ends/shared credits flags with route clears.
`clannad-progress.mjs` owns native clear/light cells and optional progress
completion provenance. Manual marking is user-requested and explicitly labelled;
do not claim manual AFTER STORY tests are natural unlocking. Preserve independent
progress/history and pre-debug backups. All 63 badges come from DDAT's native table;
F1112 controls visibility. Decode all scene images before committing the scene,
and only schedule waits after the busy operation finishes. `tests/browser-clannad-menu.mjs`
checks these features using real checkpoints from `tests/clannad-menu-checkpoints.mjs`.

## Paused target: Pia Carrot

The supplied Japanese PS2 Pia Carrot 3 Round Summer standard edition
SLPS-25222, executable version 1.04, has static recovery and an incomplete actual
SCRP runtime. It is NOT a faithful full-game browser port. `docs/pia-runtime.md`,
`docs/compatibility.md` and `docs/next-session.md` record current evidence and next
work. Actual Chromium coverage is 100-plus pages (latest 103), plus the opening
movie boundary and subsequent script resumption; the separate 933-page headless run
simulates movie completion/timing and stops at RoomMenu in 7M30DNR. Never combine
those into a browser-coverage claim. The shared reader now follows the newer CLANNAD visual reference; the prior
summer stylesheet is retained as an unused historical file. Original synthetic fixture support is separate.
Never substitute sorted script strings for game behaviour or describe fixture
tests as commercial-game coverage.

## Structure and commands

- `vnkit/disc.py`, `source.py`: read-only ISO9660 and safe no-clobber extraction.
- `vnkit/adapters/clannad_*.py`, `hunex.py`: active HuneX/CLANNAD recovery and import.
- `web/adapters/clannad-*.mjs`: command VM, basic-native allowlist, precise motion and census.
- `vnkit/adapters/clannad_expression.py`: bounded audited ELF condition probe, never arbitrary execution.
- `vnkit/adapters/pia_ps2.py`, `pia_media.py`: edition detection, NFP, SCRP and images.
- `vnkit/adapters/pia_runtime.py`, `pia_native_data.py`: private runtime and source tables.
- `vnkit/adapters/pia_audio.py`, `pia_movie.py`, `pia_music.py`: source media conversion.
- `web/adapters/pia-*.mjs`: edition-specific VM, natives, schedule state and CG129 task.
- `web/navigation.mjs`: VM-driven Next choice, no hidden-text publishing/counting.
- `web/classic.css`, `theme.mjs`: configurable reference-inspired chrome and Dim surroundings.
- `web/crt.mjs`: exact native scene composition, including when CRT is off. Never round face/body positions to integer CSS pixels; output canvases must not capture themselves.
- `web/`: reusable DOM reader, state interpreter, IndexedDB and learning features.
- `fixtures/synthetic/`: original MIT test content, including generated SVG/WAV.
- `private/`: local discs/extraction/reports/assets/tool downloads; never distribute.
- `docs/`: investigation, support boundaries, adapter and content contracts.
- `.agents/skills/vn-import/SKILL.md`: reusable import workflow.

Reader/disc extraction use Python 3.11+ standard library only. CLANNAD media import
also requires pinned vgmstream r2117 and FFmpeg/ffprobe; see `docs/clannad-import.md`.
Node.js 22+ runs content validation and reader unit tests.

```sh
python3 -m vnkit --help
python3 -m unittest discover -s tests -p 'test_*.py' -v
node --test tests/reader*.mjs
node --test tests/clannad-vm.test.mjs
node tests/clannad-real-smoke.mjs private/library/clannad-live 150
node tests/clannad-campaign.mjs private/library/clannad-live private/clannad/new-campaign 1000
node scripts/validate-clannad.mjs private/library/clannad-live
python3 -m vnkit validate fixtures/synthetic
python3 scripts/reader-service.py status
python3 -m vnkit package
```

Browser tests have an optional pinned Playwright dependency; see
`docs/testing.md`. They must use an isolated browser profile. Public fixtures stay
synthetic; actual-game checks use the user's private import and retain outputs
under `private/`. Never describe the former as commercial-game coverage.
Server tests need permission to bind ephemeral loopback sockets in restricted
sandboxes. Do not call an unperformed check passed.

## Shared saves

Saves → Delete removes individual positions in the active bank; shared null
changes are tombstones and must never be stored as null records or delete progress.
Preserve CAS/retry/recovery rules for deletes as well as writes. Deleted autosave
stays absent until presentation resumes, including through background snapshots.
Activity → Clear current session subtracts only that session's exact per-day
contributions; keep prior sessions, seen/occurrence IDs, backlog, bookmarks and
manual pause. Activity v2 persists daily session ledgers, resumes sessions within four hours,
and uses a 04:01 local reading-day boundary. Individual session deletion retains
seen/occurrence IDs. V1 migration preserves an exportable backup and labels historical
day allocation as approximate; never reconstruct counts from retained backlog. See `docs/text-and-statistics.md` and `tests/browser-data-controls.mjs`.

See `docs/shared-saves.md`. Local is the default. Opt-in home-server sharing is
explicitly authorized by the user; no third-party upload is authorized. Preserve
both banks and device-local learning history. Only fixed save/progress keys go
through `web/save-storage.mjs` to `vnkit/shared_saves.py`. Compare-and-swap rejects
stale writers; never retry a conflicting write with a refreshed revision. Failed
writes freeze the shared session after bounded retries and preserve a distinct recovery record.
Retries reuse the operation ID and base revision; receipt acknowledgement must
never bypass a newer bank revision. `shared-pending` is persisted before transport.
Explicit recovery must reload without flushing the old engine into the repaired bank. Restore
validates game/signature/state. Keep source-checkpoint progress with Next choice
until the destination is presented. UI mode switching must not flush an old engine
into a newly selected bank. Browser tests must use a temporary server/state folder,
not the live shared bank. Back up with `scripts/backup-shared-saves.py`.

## Invariants

Preserve originals. Do not execute installers or disc binaries merely to
identify them. Reject unsafe paths, out-of-bounds extents and unintended
overwrites. Exact matching files may be resumed. Changed output goes in a new
directory; do not delete existing user work to make a rerun pass.

Do not upload game content, raw scripts, saves or activity. Never include them
in Git, releases, screenshots for publication, container layers or diagnostics
intended for sharing. Public tests use the original synthetic fixture only.
The package builder uses an explicit code allowlist; review it when adding files.

Keep game filenames, opcodes and character mappings in the adapter. Every
unknown control/state instruction fails closed with its source location. Preserve
stable source IDs, bytes/encoding and occurrence IDs independently. Loading a save
must not roll back learning history or republish/recount its current text. Next
choice must execute the VM, keep a pre-jump restore slot and roll back on errors
or cancellation; never bypass unknown native events or mark passed text as read.

Read licences before reusing upstream code. Maintain `docs/provenance.md` and
third-party notices. Keep adapter docs, support matrix and import skill current
with every support change. Full static parsing is not full execution coverage.

The default listener is 127.0.0.1:8891. Remote binding requires explicit HTTPS and
authentication. No public deployment is part of ordinary setup.

For local development use an isolated loopback server and temporary browser
profile. See docs/remote-access.md for optional private remote access. Never
change unrelated services or existing Tailscale routes.

## Completed-route read status

Read `docs/text-and-statistics.md` before changing Skip read. Normal Activity.seen
and adapter-supplied assumed read IDs are distinct. User-authorized completed-route
paths enable red text and Skip read without adding study counts or exposing skipped
text. Misae/Yukine/Sunoharas/Ryou/Kyou have fresh-entry VM-replayed paths; other
routes must report missing support. Never mark all script IDs read by filename.
The private signature-bound sidecar is built by `scripts/build-clannad-read-paths.mjs`;
keep it out of public packages. Mobile fullscreen removes the stage border.

Global pause: `web/global-pause.mjs` keeps playback intent separate from temporary
media suspension. `web/app.mjs` must block advancement and statistics while paused,
retain source wait/typewriter timing and preserve independent manual stats pause.
Bottom UI and fullscreen menu expose the same toggle. See reader-interface.md and
`tests/browser-global-pause.mjs`; saved media must not be permanently muted merely
because the user paused globally.

## Console player and previous-line navigation

The outer player uses fixed blue console styling in `web/console-player.css`;
colour/opacity preferences affect in-game surfaces and fullscreen panels. Library
title actions collapse by default. Inactive-title sound/progress menus must never
start the story, overwrite autosave or count study activity. Previous line uses
bounded session-only snapshots (`web/rewind.mjs`) and validated restore, retaining
current persistent progress and independent activity. Do not include skipped text
in rewind history. Q.Save/Q.Load controls/shortcuts are removed; retain old save
data. See `docs/reader-interface.md` and `tests/browser-console-polish.mjs`.

## ISO import GUI

The initial Add game / Import ISO flow is implemented; read `docs/import-gui.md`
and the remaining distribution roadmap. `vnkit/import_jobs.py` owns resumable
bounded uploads and one CLI-backed inspection/conversion worker. Only opaque
IDs cross the API; source folders are locally configured by
`VNKIT_IMPORT_SOURCE_DIR` (default toolkit root). Keep uploads/work outside the
served library. Verify before atomic install; reject existing game IDs and retain
incomplete compatibility status. Never upload game files to third parties.
`tests/test_import_jobs.py` covers recovery/safety and mocked CLI orchestration;
`tests/browser-import-ui.mjs` covers actual HTTP upload and actual ISO detection.
Do not call that a clean full-game GUI conversion. Light/Dim now changes outer
console chrome brightness; an unloaded reader shows only orbiting lights.
