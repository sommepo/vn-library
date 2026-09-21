# Test evidence and remaining checks

## Session reset and save deletion (2026-09-19)

`tests/browser-data-controls.mjs` passes **eight groups per browser** in Chromium
and Firefox. Reports are `private/browser-tests/data-controls-chromium/results.json`
and `data-controls-firefox/results.json`. Both use fresh profiles, a source-reached
CLANNAD portrait and a temporary server/database. Checks cover confirmation/cancel,
reset to zero with corrected totals and preserved previous sessions/read markers/
backlog/current save/progress/manual pause; JSON export/reload without recount;
rollback after a denied activity write; local deletion and slot reuse; deleted
autosave surviving pagehide then being recreated by advancement; a real shared
deletion commit with a deliberately lost reply (one revision only); another device
seeing the slot empty; explicit failed-deletion recovery without data loss. The
final harness also checks no reset text event and a bounded mobile save panel.
No user's live bank was written by a test. Physical phone testing is still separate.

Run with `VNKIT_REPORT_DIR=private/browser-tests/new-data-controls sh
scripts/browser-env.sh node tests/browser-data-controls.mjs`. `VNKIT_BROWSER=firefox`
selects Firefox; this host needs the private-library/font environment documented
below. Reports/screenshots/exports stay private. Earlier v1 captured an earlier-
session snapshot before the new session had been persisted; v2 corrected the
test timing and passed. No product fix was needed for that probe failure.

`private/browser-tests/data-controls-shared-final/results.json` passes all **12**
existing shared migration, conflict, recovery and lost-reply groups. The older
harness needed explicit same-URL navigation waits when switching banks and a wait
for responsive resizing; failed intermediate reports remain private. The final
run retains the original behavioral assertions.

All five Node reader test files pass, including **15 shared-store tests**, and
the activity reset test covers per-day subtraction over midnight, repeated resets,
pause retention, earlier totals and occurrence deduplication. **8 Python shared-
save tests** and **18 server tests** pass, covering null deletion changes, protected
progress keys, auth/origins, stale revisions, persistent receipts and backup history.
No new route coverage or interpreter/asset/save-format change is claimed.

## Phone frame, opacity and fullscreen (2026-09-19)

`private/browser-tests/mobile-layout-verified/results.json` passes **14 groups**
from `tests/browser-mobile-layout.mjs`. It uses a source-reached CLANNAD portrait,
fresh Chromium 140 / Firefox 141 profiles and an ephemeral server/state directory.
It checks full artwork/textbox/nameplate/Next bounds at six viewport sizes:
412×915, 400×500, 490×345, 915×412, 360×640 and 1360×960. It covers touch and
selection protection, transparent/opaque fills and combined UI opacity, actual
fullscreen entry/exit and its controls, maximum-size long-text scrolling, normal
advancement and a real source choice at both compact orientations. The long-text
probe is original synthetic DOM content, never a fabricated game line/save.

The Firefox test has a native fullscreen limitation: its headless monitor is
1366×768, and native fullscreen switches to that size regardless of the emulated
phone viewport. Resizing the desktop test window exits fullscreen; the harness
checks the resulting normal layout and re-enters through a real button click.
The report records actual dimensions and screenshots capture the complete page.
Chromium retains the phone-sized viewport in fullscreen. Neither run proves
physical Android rotation, OS-bar hiding or Yomitan behaviour. Earlier probes
remain private: v1 had a wrong backlog-heading expectation; v2 needed to await
the fullscreen-change event; v3 exposed the Firefox desktop resize behaviour.
v4/final geometry passed but Firefox lacked visible fonts, so those screenshots
were superseded by the verified run, which checks for working proportional fonts.

Install the optional pinned Firefox revision with the existing private tools:

```sh
PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64 sh scripts/browser-env.sh \
  node private/tooling/playwright/package/cli.js install firefox
# On a desktop with browser libraries and system fonts:
VNKIT_REPORT_DIR=private/browser-tests/mobile-new \
  sh scripts/browser-env.sh node tests/browser-mobile-layout.mjs
```

On this minimal the development host test host, additional libraries were extracted privately:
GTK 3.24.52-0ubuntu1, epoxy 1.5.10-2build1 and Xinerama 2:1.1.4-3build2 under
`private/tooling/firefox-sysroot`, with package hashes in
`private/tooling/firefox-debs/manifest.json`. Existing audio/sysroot libraries
supply the remaining dependencies. No host packages/services were changed.
Firefox's content sandbox could not see the privately extracted fonts; the test
command below allows them in its **disposable, local-only test browser**. This
does not change reader settings or recommend disabling a user's browser sandbox.
The harness rejects missing-font/tofu-only test runs.

```sh
MOZ_DISABLE_CONTENT_SANDBOX=1 \
LD_LIBRARY_PATH="$PWD/private/tooling/firefox-sysroot/usr/lib/x86_64-linux-gnu:$PWD/private/tooling/audio-sysroot/usr/lib/x86_64-linux-gnu" \
VNKIT_REPORT_DIR=private/browser-tests/mobile-new \
sh scripts/browser-env.sh node tests/browser-mobile-layout.mjs
```

Current CRT regression evidence: `private/browser-tests/mobile-layout-crt-v1`
(11 groups). Current basic execution regression: `mobile-layout-basics-v1`
(7 groups, including the same 100 post-event-41 pages, real choices, 15 slots,
movie/voice completion, progress preservation). These repeat earlier coverage;
do not add them to the total of unique route text. No VM/asset/signature change.

## Current menu/media pass (2026-09-19)

- `private/browser-tests/clannad-menu-v5/results.json`: **nine passed groups**.
  Real reached Misae ending → menu → new run with retained completion; delayed face
  request with atomic scene/date display; explicit content HTTP failure and retry;
  second-tab ownership error; manual School Life/light checklist and After Story
  entry; all 53 music rows plus real vocal-track playback/Stop; mobile layout;
  completion JSON export/reload and wrong-game rejection. The After Story gate
  was exercised with **manual debug progress**, not naturally earned prerequisites.
- `private/browser-tests/clannad-menu-basics-v2/results.json`: all seven existing
  basics groups pass again: **100 consecutive actual text pages after event 41**,
  both later choice branches, 15 slots, movie playback/save/resume (seek to end),
  immediate voice completion/panel pause, G preservation and mobile layout.
  These repeat earlier coverage; do not add the page counts together.
- `private/clannad/menu-audit/checkpoints-final/checkpoints.json`: reproducible
  first-option headless traversal reaches Misae, 5,320 logical segments/28 choices.
  No invented PC/F state; timing/media simulated. Only its reached final portion
  is played in the menu browser test, not the full 5,320-page route.
- **53 Python tests and 49 Node reader/CLANNAD tests pass.** Native calendar
  visibility, idempotent manual lights, the 13-light total including Fuko's
  consumption/repayment pair, compatibility rejection and no false good-ending
  flag have unit coverage. Original synthetic fixture remains separate.
- All 203 scripts still report zero unsupported command sites and zero unresolved
  references. Full import validation intentionally exits 3 for incomplete native
  presentation/81 atlas or format entries. Calendar mapping adds no new image
  derivatives; all 63 badges were already decoded from the ISO.

Earlier failing probes are retained. Menu v1 needed CLANNAD-scoped selectors in
its multi-game library; v2 compared a stale periodic autosave during a timed
scene; v3 passed. Basics v1 exposed a real zero-duration wait/busy race, corrected
by scheduling after operation completion; v2 passed. v4/v5 cover export/reload
and final loading controls. Physical devices, Firefox, Yomitan, original PS2 and
natural full After Story progression remain unverified. See [menu documentation](clannad-menu.md).

## Previous broad basic pass (2026-09-17)

`private/browser-tests/clannad-basics-v5/results.json` passes seven check groups:
100 consecutive actual text pages after the old event-41 limit; both later-choice
alternatives compared with VM state; 15 manual slots; real source-triggered movie
playback/save/reload/resumption (seek to end); immediate voice and completion wait
with panel pause; earned G progress preserved through old saves/new playthrough;
mobile viewport. These are source-reached checkpoints, not new entry coverage.

The 1,000-run private campaign reaches 69,738 logical text segments, 481 choice
edges, 15 source endings and 164 scripts. Its two assertion stops were one optional
saved-display-hint mismatch, now fixed and rechecked at the actual checkpoint for
200 further boundaries. No unsupported opcode/resource boundary was hit. Timing
is simulated; After Story unlock and all-route fidelity remain unverified.
See `private/clannad/basics-audit/campaign2/report.json` and
`restore-regression-resolved.json`. The first-option run completes at a source
ending after 5,320 segments/28 choices. All 203 scripts statically validate with
zero unsupported sites / unresolved references, but presentation remains degraded.

Final automated checks: **53 Python tests, 47 reader/CLANNAD Node tests pass**.
The native condition probe has an optional private-ELF test; no game binary/text
is bundled. The original synthetic fixture separately validates.

Failed browser probes are retained: v1 used development checkpoints with a
field-order-dependent signature; strict deep-equality rebase produced compatible
copies. v2 asserted the slot count before IndexedDB rendering; v3 passed. v4
looked at a stale periodic autosave after voice completion; v5 explicitly persisted
live state and passed, also testing nonempty earned completion flags. These failed
assertions are not missing disc content or passed checks.

Original PS2 comparison, every route, natural After Story unlock, physical Z13/
Android, Firefox and Yomitan are still unperformed. Earlier F[500] difference
checks below used a missing native default; they are historical implementation
observations, not current original-engine fidelity evidence.

## Historical opening extension and 15 slots (superseded build-v10)

The extension/navigation harnesses below include obsolete expected event-41
stops and F[500] assertions. Their old reports are historical. Use
`tests/browser-clannad-basics.mjs` for current boundary/progress checks.

- `private/browser-tests/clannad-2450-v2/results.json`: eleven Chromium checks
  passed, including **2,450 ordinary source text pages from entry and 19 choices**,
  both first-choice alternatives, media, selectable Japanese, clipboard success/
  denial, save/load/export/import, backlog, responsive layouts and independent
  WebSocket consumption. The counter excludes two concurrent native messages;
  they are presented during the same traversal and tested separately below.
- `private/browser-tests/clannad-extension-v4/results.json`: six reached-checkpoint
  check groups passed: event 30 concurrent text/voice and selection/panel pause,
  partial-wait reload without duplicate output/counts, independent slot 15 storage/
  export/import/reload, both later choice-17 branches and their different F[500]
  flags, simultaneous-speaker copy, event 10 artwork/motion/SWING/input retirement,
  source-state resumption, legacy halted-autosave recovery, and rollback of ordinary
  advancement at the remaining unsupported boundary. These are **not** extra
  consecutive opening pages.
- `private/browser-tests/clannad-navigation-v5/results.json`: seven Next-choice/UI
  checks pass after extending the path to 19 choices. Unknown event 41 rolls the
  jump back without skipped text output, read credit or history pollution.
- `private/browser-tests/clannad-voice-cues-v4/results.json`: the existing original
  voice cue, dictionary-panel pause and mid-clip save/reload regression passes
  with the final stopped-save recovery code.
- `private/clannad/route-audit-v3/report.json`: actual-script control audit with
  simulated timing/input reaches **2,487 segments, 19 choices**. All 19 option pairs
  have different text traces; 14 change later F/G flags beyond F[1089]. Full ending
  routes are unverified. The first-option stop is event 41; a choice-16 alternative
  stops at MCOL. The audit is bounded at 800 boundaries per alternative.
- `private/clannad/static-validation-v8-swing.json`: all 203 scripts/308,727
  instructions inspected; 97,696 direct references resolve. 1,399 unsupported
  command sites remain. There are 103,826 ZM sources plus 46 MSNL sources. Opcode
  presence is not proof that every argument combination/native context works.
- `private/clannad/validation-live-v10.txt`: all 47,151 registered resources
  checked; only the expected incomplete-runtime error remains (exit 3).
- Python: **51 tests pass**, including authorized isolated loopback-server tests.
  The four reader/CLANNAD Node files pass; direct CLANNAD execution reports **18
  synthetic adapter tests**. The original public fixture validates (263 instructions,
  eight assets). The updated repository-local skill passes its format validator.
- Final build is promoted as `private/library/clannad-live`; the previous live
  import is preserved. Import revision 0.2.0 pins implementation hashes. Existing
  source/runtime identity and older save keys remain compatible. Its implementation
  hashes describe conversion-time code; the later stopped-save recovery patch is
  captured by the code-package manifest and private handoff. No unrelated
  services/routes or user browser saves were changed by the fresh test profiles.

Historical failed probes remain private: the first 2,450-page run completed the
reading path but its test mistook the *expected* clipboard-denial status for a
runtime error; v2 corrected that assertion and passed. Extension v1 queried the
save list before its IndexedDB rendering finished; v2/v3 use an explicit wait.
A validation begun against a build directory during its promotion produced
transient missing-path messages; `validation-live-v10.txt` reran against the stable
live path and is the accepted resource evidence. None indicates absent ISO data.
Physical Z13/Android, Firefox, Yomitan and comparison against original PS2 execution
remain unperformed. Full route/ending fidelity is still unverified.

```sh
VNKIT_SEGMENTS=2450 VNKIT_REPORT_DIR=private/browser-tests/new-2450 sh scripts/browser-env.sh node tests/browser-clannad.mjs
node tests/clannad-route-audit.mjs private/library/clannad-live private/clannad/new-route-audit
VNKIT_CHECKPOINTS=private/clannad/new-route-audit VNKIT_REPORT_DIR=private/browser-tests/new-extension sh scripts/browser-env.sh node tests/browser-clannad-extension.mjs
```

## Earlier CLANNAD interface and Next choice checkpoint (2026-09-17)

The new [reference-inspired interface](reader-interface.md) and navigation were
tested separately from the 1,800-page reading run below:

- Six original synthetic navigation unit tests pass. All four reader/CLANNAD Node
  test files pass, and the public fixture still validates (263 instructions/eight assets).
- `private/browser-tests/clannad-navigation-v4/results.json`: seven Chromium
  checks pass. The first jump passes 258 unpresented narrative segments and reaches
  `SEEN0414.MZX:000041a5` with exactly the same VM state as sequential execution.
  Both options and their subsequent choices match ordinary advancement. No skipped
  narrative enters reading totals, seen IDs, backlog or the external WebSocket feed.
- Choice reload, pre-jump backup, cancel and reload mid-jump restore the expected
  state without duplicate publication/counting. Fifteen source choices are reached
  through fast-forward, then native event 30 correctly cancels/restores the jump.
  These traversed pages are **not additional consecutive reading coverage**.
- Desktop light/dim, nameplate, tablet, portrait phone and landscape screenshots
  were generated and personally inspected. Dim persists and leaves game/dialogue
  colours unchanged. No horizontal overflow at the tested sizes.
- `private/browser-tests/clannad-modes-classic/results.json`: eight existing
  actual-import mode/media regression checks pass (clipboard, plain WebSocket,
  skip-read, auto, companion, pause, source motion and standalone movie).
- The first navigation run passed; extended runs v2/v3 exposed an enabled Next
  button while the prior text event was still being persisted/published. The
  button now stays disabled until advancement completes; v4 passes rapid normal
  advancement as well as the new interruption test. Earlier evidence is retained.
- The repository-local skill validates. No ISO, private import or unrelated
  service/route was modified. Physical Z13/Android, Firefox and Yomitan checks
  remain for the user; this change does not expand native opcode support.

```sh
node tests/reader-navigation.test.mjs
node --test tests/reader*.mjs tests/clannad-vm.test.mjs
VNKIT_REPORT_DIR=private/browser-tests/clannad-navigation-new sh scripts/browser-env.sh node tests/browser-clannad-navigation.mjs
```

## Earlier CLANNAD extraction/runtime checkpoint (2026-09-17)

The user's active target is Japanese PS2 CLANNAD SLPM-66302 v1.01. Pia Carrot
work is paused. [CLANNAD coverage](clannad-runtime.md) records the latest actual
execution boundary and separates contiguous browser pages from headless probes.

- Final Python suite: **51 tests passed**, including compound source IDs and
  existing extraction/HTTP/WebSocket/package boundaries.
- **14 CLANNAD adapter unit tests passed** using original synthetic commands and cover variables,
  branches, source substitutions, continuation pages, atomic error rollback,
  source motion, rotation, interlude save state, window visibility, voice cues and sound channels. They are not game coverage.
- Actual Chromium opening run passed 1,800 consecutive pages, eleven choices and both first-choice
  alternatives. `private/browser-tests/clannad-1800/results.json` has the evidence.
- Actual browser mode checks passed copy/auto-copy success and denial, plain/JSON
  external WebSocket consumers, skip-read, auto, backlog, save/export/import,
  restore/reload deduplication, manual activity pause and the live companion.
- Separate reached-checkpoint tests passed events 23/24, event 9 rotation and
  event 75 interlude,
  including panel pause and remaining-time restoration. Original Japanese voice
  completion was explicitly tested, without a synthetic tone or slowed playback.
- WTVT's two source-timed passages in voice 12432 append without restarting audio;
  panel pause, mid-clip reload and the final manual boundary passed. The corrected
  polling tests are `clannad-modes-v2`, `clannad-native-v5` and
  `clannad-voice-cues-v3` under `private/browser-tests`. Earlier async predicates
  were not reliably polled by Playwright 1.55; those affected checks were rerun.
- Original OPENING.PSS decoded-video and PCM hashes roundtrip. Standalone browser
  playback passed; its source MVPL command remains unimplemented.
- The documented full import command was personally rerun against
  `private/clannad/disc`; extraction/media/packaging safely resumed and returned
  expected exit 3 for incomplete runtime. An ISO-view attempt against this
  directory-fingerprint cache was correctly refused without overwriting it.
- Existing private Tailscale HTTPS `/api/health` returned `ok: true` from the development host.
  No duplicate listener or unrelated service/route changes were made.

```sh
node tests/clannad-vm.test.mjs
node tests/clannad-real-smoke.mjs private/library/clannad-live 150
node scripts/validate-clannad.mjs private/library/clannad-live
sh scripts/browser-env.sh node tests/browser-clannad.mjs
sh scripts/browser-env.sh node tests/browser-clannad-modes.mjs
sh scripts/browser-env.sh node tests/browser-clannad-native.mjs
sh scripts/browser-env.sh node tests/browser-clannad-voice-cues.mjs
```

The latter tests need the private reached checkpoints documented in the runtime
report. They create isolated profiles and keep screenshots/reports under private
paths. Physical Z13/Android, Firefox, Yomitan and hosted Renji UI tests remain
unperformed. The wire protocol and independent external consumers were checked;
that does not establish every browser extension's behavior. No running original
PS2/emulator comparison or full-route test has been performed.

## Paused Pia checkpoint (historical)

Latest Pia checkpoint: **2026-09-08**. The actual game now has an incomplete
source-script runtime. The dated initial-recovery section below is historical;
its earlier static-only limitations are superseded by this checkpoint and
[the runtime coverage report](pia-runtime.md).

## Current wrap-up checks

- Python public-code suite: **45 tests passed**.
- Node reader/VM/schedule/task checks: **all four test files passed**.
- `python3 -m vnkit validate private/library/pia-live`: passed content/resource
  validation. This does not certify all routes or native behavior.
- Full-inventory control probe: **933 original pages, five choices, 12 scripts**;
  explicit stop at `7M30DNR.SPC:code:0000013e` (RoomMenu). The 1,200-page request
  returns exit 3, deliberately. One movie, 12 waits and two sound boundaries were
  simulated; graphics/audio timing was not checked by that probe. Save before
  and after the original first choice reproduces eight subsequent boundaries;
  all three alternatives are separately exercised.
- All 1,118 scripts parse. The reference census still has 18 unresolved source
  script references; missing original CG references use source-evidenced FILEERR
  behavior only when the import includes the archive inventory.
- Real browser results are recorded in `private/browser-tests/pia/report.json`;
  read the latest `passed` field and checks rather than assuming a run passed.
  The test uses original art, first voice, music, Japanese selection/copy,
  100-plus pages, choice, quicksave/load, and a 412px viewport. `--movie` also
  reaches the original opening movie, checks video/audio decoding and seeks to
  its end to verify the source script resumes. It is not full-duration playback.
- Opening-movie decoded video and PCM hashes match the source for the lossless
  VP9/FLAC variant. Independent browser video/audio checks passed. Three real
  music/ambient FLAC files and a native effect also passed browser decoding.
- The existing reader service is active. Private Tailscale HTTPS health passed
  from the development host; physical Z13/Android/Yomitan checks remain user-device tests.

```sh
python3 -m unittest discover -s tests -p 'test_*.py' -v
node --test tests/reader*.mjs tests/pia-vm.test.mjs tests/pia-schedule.test.mjs
python3 -m vnkit validate private/library/pia-live
sh scripts/browser-env.sh node tests/browser-pia.mjs --movie
node tests/pia-real-smoke.mjs private/library/pia-live --max-segments 150
# Expected exit 3 at the documented room-menu boundary:
node tests/pia-real-smoke.mjs private/library/pia-live --max-segments 1200 \
  --all-scripts --diagnostic-skip-movie --report private/evidence/next-room-probe.json
```

Private runs require the user's converted assets and an isolated browser profile.
Public tests use only original synthetic data. Existing reader URLs should be
reused; do not launch a duplicate foreground service on port 8891.

## Initial recovery checkpoint (2026-09-07, historical)

Source SHA-256:
`bdfdf53bbcfa2f90399353d5f8f747e214d14fbf98a9e594743bb62a51e8ba5a`.

| Check | Result |
| --- | --- |
| Read-only ISO inspection and full fingerprint | Passed |
| Disc extraction and exact-match rerun | Passed; 13 files, no changed originals |
| Extracted disc-directory inspection/fingerprint | Passed |
| NFP extraction and exact-match rerun | Passed; 20,412 resource outputs |
| Full SCRP static parser scan | All 1,118 scripts; 1,039,001 instructions; zero boundary/target/native-relocation parse failures |
| Strict CP932 string decoding | All 117,781 embedded strings decoded; 3,532 explicitly retain custom PUA glyphs |
| MLH decompression | All 1,058 containers / 5,434 members decoded |
| Supported artwork conversion | 4,307 original-dimension PNGs; every declared output exists |
| Unsupported artwork | 97 source-located failures retained: 96 tile-direction-3 images and one indexed-4 image |
| Final import and repeat | Exit 3 both times; deterministic reports and no-clobber outputs match |
| Final reader content validation | Exit 3; exactly two deliberate errors: blocked import and first unsupported native instruction at OPEN01.SPC+45 |
| Real script-to-resource references | **Unverified:** dynamic/native expression resolution is not implemented |
| Real 100-segment execution / branching | **Not performed:** no faithful executable representation |
| Real save/load / media playback | **Not performed:** VM/native gameplay/audio unsupported |
| Original-engine comparison | **Not performed:** no original executable run or supplied reference session |

The restaurant background and a character sprite were personally viewed after
conversion. That checks representative image decoding, not every image, colour
blend, placement or original animation. Font glyph bitmaps were recovered from
the disc with source-evidenced indexing; Unicode substitution/ruby/control
semantics remain unverified. Raw audio and movie resources were preserved.

Private reproducible evidence includes `private/evidence/adapter-results.json`,
`validate-final.json`, `import-real.log`, `import-resume.log` where present,
extraction manifests and `private/library/pia/compatibility.json`. These outputs
must not be included in public diagnostics or releases.

## Automated public-code tests

```sh
python3 -m unittest discover -s tests -p 'test_*.py' -v
node tests/reader-engine.test.mjs
python3 -m vnkit validate fixtures/synthetic
```

The Python suite passed **30 tests**: 3 disc, 5 script/archive, 8 image and 14
server/relay/CLI/release checks. They cover unsafe paths/symlinks, malformed/truncated
formats, exact-match resume, strict source identities, unknown instructions,
palette/PNG conversion, actual socket traffic, Origin/Host/token rejection,
coalesced/idle WebSockets, invalid payloads, restart deduplication and code-package
boundaries. Real loopback sockets require sandbox permission; tests do not expose
a public service or use copyrighted fixture data.

The reader core passed **11 tests**: both fixture routes (over 120 segments each),
conditions, variables, shared subroutine return, pre/post-choice save state,
unknown/missing op/target/media rejection, altered save rejection, ruby export,
character policies, unique-versus-repeat/skip activity, inactivity/hidden/pause,
backup validation and a 30,000-instruction in-memory synthetic traversal with
bounded save size. This scale test measures the VM, not a 30,000-line rendered
backlog or real-game runtime performance.

The original fixture validates with 263 instructions and 8 local assets. It uses
original generated SVG artwork and tone WAVs. Its “voice” file is a timing signal,
**not recorded speech or evidence of original voice support**.

## Personally run Chromium browser checks

Playwright **1.55.0**, Chromium **140.0.7339.16**, isolated fresh browser profiles.
`tests/browser-smoke.mjs` passed **15 acceptance checkpoints**:

- Explicit synthetic labelling; DOM Japanese/ruby and image rendering.
- Successful browser Clipboard API copy with ruby reading excluded.
- Selection/Space, textbox clicks and dispatched touch events do not advance.
- Equal sentences at two source locations remain distinct.
- Full quicksave/load state, independent activity and current occurrence identity.
- Skip-read adds no reading characters and stops at a choice.
- Both branches, their conditions, call stack and subsequent media state.
- Reload/resume does not recount or republish restored text.
- Actual external native WebSocket and live page receive one complete event.
- 116 successive fixture segments across media and timing changes.
- Encountered-only backlog search; save export/import; wrong-game save rejection.
- Persistent activity/session export and pause control.
- Desktop 1280×900, mobile 390×844 and tablet 820×1180 without horizontal overflow.
- Injected clipboard permission denial with understandable alternatives.
- No uncaught browser JavaScript errors.

The desktop/mobile screenshots were viewed locally. The Linux test host initially
had no fonts; fonts and browser libraries were downloaded/extracted privately,
not installed into the system. The successful final checks used those fonts.
Browser outputs/screenshots remain under `private/browser-tests/` and are excluded
from the code package.

`tests/browser-modes.mjs` separately passed **9 additional checkpoints**: a single
complete typewriter event; skip stops on unread text with correct totals; auto
pauses/resumes around selection; auto waits for a slowed fixture voice tone;
second-tab Web Lock rejection before session mutation; manual pause and reload
identity; independent activity backup restoration; fullscreen enter/exit; zero
uncaught JavaScript errors. Evidence is `private/browser-tests/modes-report.json`.
This verifies voice timing with an original tone, not original-game speech.

`tests/browser-import.mjs pia3-round-summer-slps25222-1.04` passed **4 separate
actual-import checks**: the versioned game ID appears with a blocked status and
no Read action; its source-specific report loads; a converted original image
decodes through the reader asset endpoint; private script analysis returns 404.
This caught and fixed an ID filter that incorrectly rejected the version dot.
`private/browser-tests/import-report.json` explicitly records **zero** actual
story segments executed. This is an import-boundary test, not narrative playback.

Run against the isolated server:

```sh
python3 -m vnkit serve --port 8891 --allow-origin https://renji-xd.github.io
# In another terminal, once optional test tools are installed:
sh scripts/browser-env.sh node tests/browser-smoke.mjs
sh scripts/browser-env.sh node tests/browser-modes.mjs
sh scripts/browser-env.sh node tests/browser-import.mjs pia3-round-summer-slps25222-1.04
```

For optional browser tools, `sh scripts/bootstrap-browser.sh` downloads the
SHA-256-pinned Playwright core tarball and its pinned Chromium build into
`private/tooling/`. Python 3.12+ is recommended for this optional bootstrap's
tar filtering; the runtime still needs only Python 3.11+. On this Ubuntu 26.04
host the pinned runner needs `PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64`
for browser download. Required host libraries were instead extracted from
downloaded `.deb` files into `private/tooling/sysroot/`; their versions/checksums
are recorded privately. A normal desktop with those shared libraries installed
can use the browser directly. No browser tool is needed for importing or reading.

The tarball SHA-256 is
`6b63fdf41725afb924880728d39cf560d770f785a861d18c15611e99dd3172bd`.
These optional tools are not redistributed with the toolkit.

## Deployment/package checks

- Direct Python server launched on `127.0.0.1:8891`; actual HTTP/WebSocket tested.
- Compose configuration passed `docker compose config --quiet`.
- The pinned Python 3.14.4 slim-bookworm image tag was verified through its registry manifest.
- Docker image build/run **not performed successfully**: this account lacks Docker
  socket access, and noninteractive sudo requires authentication. No permissions
  or unrelated services were changed. The direct launch is working independently.
- Remote TLS/Basic-auth implementation exists, but a device-trusted certificate
  and authenticated remote-browser/WSS session have **not** been exercised.
- The code-package workflow was tested from an isolated unpacked archive: toolkit
  version and synthetic validation work; private assets/symlinks are excluded.
- The repository-local skill passed the skill-creator validator and an independent
  forward test against the real blocked import and unpacked code package.

## Checks still requiring your device or further engine work

Yomitan lookup, native Android long-press/selection handles and scrolling, Windows
Firefox/Chromium permissions, real audio listening/volume balance, mobile
fullscreen, HTTPS/WSS certificates and the live hosted Renji UI are unverified.
Renji's exact receiver **source** and the matching wire protocol were checked;
that is different from testing its hosted UI in your browser.

Try the fixture first: select/lookup/copy a ruby phrase; clear selection without
advancing; choose both routes; save before/after a choice; reload; verify study
history stays intact; export saves and activity and restore them in another
profile; connect Renji and verify one event per new presentation. On Android,
long-press and scroll the textbox/backlog without moving the story.

These user checks cannot certify this game's routes. Full route execution,
room/day/work systems, original-scene/media fidelity and original-console
comparison remain necessary before this ISO can be called a faithful full port.

## Console menu and CRT regression (2026-09-19)

See [CRT commands and scope](crt-display.md). Current evidence:

- `private/browser-tests/crt-v4/results.json`: eleven groups passed, actual
  CLANNAD portrait/date artwork, all six shaders/presets, custom zero-radius
  geometry, text selection/story/history invariants, off/reload, forced GPU loss
  and recovery, no-WebGL fallback, desktop/mobile menus and controls. The isolated
  compositor fixture is original synthetic data, not additional route coverage.
- `private/browser-tests/crt-basics-v1/results.json`: seven groups, **100 successive
  real pages with CRT enabled**, both later-choice alternatives, slot 15,
  actual movie playback/save/resume/completion (seeked to the end), voice wait,
  retained earned progress and mobile layout. This overlaps existing coverage;
  do not add it to earlier page totals as unique coverage.
- `private/browser-tests/console-menu-v1/results.json`: nine existing menu groups
  passed after restyling, including delayed face/atomic scene/date, visible load
  failure and retry, competing-tab error, reached Misae ending, persistent progress,
  manual After Story entry, all 53 sound-test entries and export/reload rejection.
- Targeted Python server suite: 17 passed, including hidden catalogue entry with
  assets preserved and private marker rejected by the resource allowlist.
- Three CRT unit tests cover preference normalization/presets and bounded output
  pixel dimensions. All browser runs use fresh profiles, not the user's saves.

CRT browser tests use Chromium software rendering (SwiftShader). They do not
establish physical Z13/Android/Firefox GPU performance, 4K monitor quality or
parity with RetroArch/MiSTer/CRT hardware. The CRT feature does not change game
adapter support, import/save signatures or the existing full-validation exit 3.


## Optional shared saves (2026-09-19)

`private/browser-tests/shared-saves-v1/results.json` records 10 passed groups on
an ephemeral server/database and two independent Chromium profiles. Actual
CLANNAD reached portrait state, slot 15 and explicit manual-progress provenance
transfer without changing local banks or counting restored text. Stale writes,
network failure, recovery/reload, exports and mobile layout passed. No user's
live shared data or browser profile was used. A consistent SQLite backup of
that test database passed integrity checks. See [shared-save tests](shared-saves.md).

`private/browser-tests/save-location-basics-v1/results.json` passes the seven
existing local-mode groups: 100 real pages, 15 slots, two later-choice alternatives,
movie/save/resume, voice wait, earned progress and mobile layout. This repeats
prior coverage, not an additional 100 unique story pages. The current targeted
Python checks passed 17 existing server tests and 5 shared-save tests; reader
unit suite passed 27 tests, followed by a sixth shared-storage test verifying
checkpoint progress is committed with its corresponding in-flight seek autosave.
Real Windows/Android device handoff over Tailscale remains a user check.


## Colour, loading, stats and portrait polish (2026-09-19)

```sh
VNKIT_REPORT_DIR=private/browser-tests/new-polish sh scripts/browser-env.sh node tests/browser-reader-polish.mjs
```

This harness owns an ephemeral server/database and isolated Chromium profile.
`private/browser-tests/reader-polish-final/results.json` has seven passing groups:
delayed face with silent/reduced-motion orbit and atomic scene; private image
revalidation; identical real-portrait native pixels at four fractional display
sizes; colour/strength/opacity persistence and companion updates; corrected CRT
portrait; overall/session metrics with real presented counts and rate formula;
mobile layout/manual pause. The alpha-cache probe is a separate rendering test,
not evidence of additional source-game behavior. No user's shared bank is touched.

`polish-crt-v1/results.json` passes the 11 existing CRT/menu groups, including
synthetic atlas/rotation tests, text selection, GPU loss and no-WebGL fallback.
`polish-basics-v1/results.json` and `polish-unfiltered-basics-v1/results.json`
pass seven groups each with CRT on/off: 100 real consecutive pages, both later
choice alternatives, slot 15, movie/resume/completion, voice wait, persistent
progress and mobile. They repeat existing route coverage. Targeted server tests
pass 18 cases including private 304, changed-file invalidation, Host/Origin checks
and API no-store. All five reader Node test files pass.

Image first loads and revalidation round trips remain; no remote latency benchmark
or physical Z13/Firefox/Android test was performed. The supplied blue-haired
portrait crop has no attached source checkpoint; the regression uses the existing
source-reached Sunohara body/face checkpoint. Native coordinates are scale-invariant
there, and screenshots confirm removal of its unfiltered rectangular join.

### Four-hour sessions and 04:01 reading days (2026-09-19)

`tests/reader-sessions.test.mjs` checks reload continuity, the exact four-hour gap,
idle-heartbeat exclusion, 04:00/04:01 and year boundaries, persisted multi-day
ledgers, deletion/reset without recounting, and v1 migration/ledger validation.
The reader regression suite passed 42 tests. Updated browser data controls passed
10 groups in Chromium and Firefox, using a real reached CLANNAD checkpoint in
isolated profiles/banks; a modified test-only timestamp simulates a four-hour
break. They cover the Today card, cancellation/deletion of an individual session,
reload continuity, reset/write failure and existing save deletion/recovery.
Reports: `private/browser-tests/four-hour-sessions-chromium-final/results.json`
and `private/browser-tests/four-hour-sessions-firefox/results.json`.
These are desktop headless checks, not physical Android testing or added route coverage.

### Read colouring and completed paths (2026-09-20)

43 reader tests and 18 HTTP-server tests passed. Canonical read paths were replayed
from fresh School Life entry using actual imported scripts: Misae 5,685 IDs,
Yukine 8,043, Sunoharas 10,158, Ryou 9,716 and Kyou 13,913. Divergent traces were
rejected; no new claim of all-route or console fidelity. Timing was simulated.
`tests/browser-read-status.mjs` uses isolated state and real game content to check
manual Misae/Yukine completion without activity seeding, Next choice with unchanged
character/seen counts, inherited red text, configurable colour, Skip read activation,
arrow-only advance and touch fullscreen border removal. Firefox report:
`private/browser-tests/read-status-firefox-final/results.json`; Chromium:
`private/browser-tests/read-status-chromium-verified/results.json`.
The mobile geometry/opacity/touch/fullscreen regression passed 14 groups in both
engines (`private/browser-tests/read-status-mobile-layout/results.json`). Physical
Android and dictionary-extension testing remain user checks.

### Global pause (2026-09-20)

44 reader unit tests passed, including media-intent preservation and exclusion of
replaced/ended clips. Isolated real-CLANNAD browser checks passed four groups in
Chromium and Firefox: stopped media/advancement/statistics, music resume,
typewriter freeze/resume, and fullscreen controls preserving manual statistics
pause. Chromium additionally passed actual source animation and original movie
pause/resume with current-compatible checkpoints. Reports:
`private/browser-tests/global-pause-media-verified/results.json` (six groups),
`private/browser-tests/global-pause-firefox/results.json` (four groups).
The older campaign movie save has a different signature and is correctly rejected;
use `basics-audit/browser-checkpoints-v1/feature-MVPL.json` for browser tests.
No physical phone or exhaustive route/media testing is claimed.


### Console player, title menus and rewind (2026-09-21)

`tests/browser-console-polish.mjs` passed eight groups in Chromium and Firefox
with temporary server banks and disposable profiles. Private reports:
`console-polish-v3/results.json` and `console-polish-firefox-v2/results.json`.
Coverage: collapsed title actions; inactive CLANNAD progress and 53-track sound
test without autosave/activity; real CLANNAD state restoration with unchanged
study counts; fixed outer chrome under theme changes; borderless fullscreen
controls; rewind through a source choice/branch; phone geometry; Remember11
rewind and CLANNAD menus while Remember11 remains active. Screenshots stay private.
This is focused UI/navigation evidence, not additional all-route coverage or a
physical Android/extension check. Nine `tests/reader*.mjs` test files passed,
including bounded snapshot history. The first Firefox launch lacked its private
GTK environment; the documented Firefox environment above resolved it.

Run with `VNKIT_REPORT_DIR=private/browser-tests/new-console-polish sh
scripts/browser-env.sh node tests/browser-console-polish.mjs`; set
`VNKIT_BROWSER=firefox` and the private GTK/font environment for Firefox. Old
browser harnesses targeting the removed Q.Save/Q.Load buttons or expanded title
menus require selector updates before reuse; their historical results remain
historical. Existing quicksave data is deliberately retained in Saves.

### ISO GUI, idle orbit and Light mode (2026-09-21)

`tests/browser-import-ui.mjs` passed six groups in Chromium
(`private/browser-tests/import-ui-v1/results.json`) and Firefox
(`private/browser-tests/import-ui-firefox-v1/results.json`). Actual HTTP upload of
original synthetic bytes persists across reload; invalid input is not importable.
The supplied CLANNAD ISO is actually fingerprinted/identified via an opaque server
source ID; the installed game is offered without duplicate conversion. Token,
foreign-origin and traversal rejections are exercised. Light/Dim, empty-reader
orbit without textbox, concise settings and reopening the actual game also pass.
The eight console/rewind/mobile groups still pass (`console-polish-import-v1`).

Six import-manager unit tests cover chunk retry/mismatch, bounds, interrupted
jobs, changed sources and staged installation classification. Their conversion
subprocess is mocked, not evidence of a new full-game GUI import. All 18 existing
HTTP/WebSocket tests, nine reader Node test files and seven CLANNAD Python tests
pass. Actual dependency preflight succeeds for both supported adapters on this
server. Private GTK dependencies were used for Firefox; physical Android upload
and a multi-gigabyte browser transfer remain unperformed.

The normal empty library hides synthetic content. Use `/?fixture=1` explicitly
for developer fixture browser tests; this is not an imported game.
