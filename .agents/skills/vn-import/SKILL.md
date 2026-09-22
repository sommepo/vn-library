---
name: vn-import
description: Inspect authorised Japanese visual-novel discs, run the local VN Import Toolkit, extend edition-specific adapters and validate selectable-text readers while separating extraction from faithful story execution.
---

# VN import

Locate the repository containing `vnkit/__main__.py` and read `AGENTS.md` and
[the current handoff](../../../docs/next-session.md). The skill references runnable
code; it does not replace the toolkit or depend on information from prior chats.
Respect the user's active game. The latest target is the Never7 PS2 experimental reader;
read [its runtime guide](../../../docs/never7-runtime.md) and
[measured fingerprint](../../../docs/never7-investigation.md). Preserve Remember11, CLANNAD and their saves. Work on the Pia ISO/runtime remains paused. Preserve the configurable
in-game lavender/gold surfaces, fixed blue console player chrome and Dim toggle.
Library actions collapse by title; inactive-title sound/progress menus must not
start a story or write its autosave. Previous line uses bounded session-only
execution snapshots, preserving study history and global progress; see
[reader controls](../../../docs/reader-interface.md).
The library uses original blue console-era chrome. Optional CRT filtering and
its compositor contract are documented in [CRT display](../../../docs/crt-display.md).
Keep Japanese text selectable, movies on the native player, atomic portraits and
explicit graphics-failure fallback. Body/face artwork is composed in exact native
coordinates before scaling, even with CRT off. Do not reintroduce integer CSS
coordinate rounding or capture the renderer's own output canvases. The focused
`tests/browser-reader-polish.mjs` checks fractional-scale invariance, the silent
loading orbit, private artwork revalidation, theme persistence and stats groups.
`web/layout.mjs` and `web/layout.css` keep the complete game frame visible, with
compact selectable dialogue inside the artwork on phones and fullscreen controls
in a small menu. Do not restore the old below-art mobile textbox. The focused
`tests/browser-mobile-layout.mjs` covers geometry, opacity, touch and fullscreen;
see [testing](../../../docs/testing.md) for Firefox's private font dependencies
and headless fullscreen limitations. Physical Android rotation is a separate check.
See the reader/CRT docs before changing those paths. Display preferences never alter execution,
text events or statistics. `.hide-from-library` markers are reversible menu
visibility, not access control. Imported packages run without the ISO present.
See [reader controls](../../../docs/reader-interface.md) for VM-driven Next choice,
pre-jump backups and cancellation. Never bypass unknown commands to reach choices;
skipped narrative is neither published, backlogged nor marked read.

## Browser import entry point

Library → Add game / Import ISO supports existing server ISOs and resumable
uploads to the same reader server. Read [GUI import](../../../docs/import-gui.md)
for status semantics, dependency setup, private staging and recovery. ISO uploaded,
identified and imported are separate outcomes. The background worker runs the
existing CLI; it must never overwrite an installed game or expose raw sources.
Full clean-machine GUI conversion remains an acceptance check, not a claim made
by mocked orchestration tests or successful disc identification.

## Identify and choose an adapter

Inspect SYSTEM.CNF/serial, executable/version and archive signatures read-only;
an ISO or commercial title does not identify an engine. Never run installers for
identification or obtain missing game assets from the network. Use upstream code
only after checking its licence; consult [provenance](../../../docs/provenance.md).

Before independent reverse engineering, follow
[shared-engine investigation](../../../docs/adapters.md#shared-engine-investigation).
Read the [CLANNAD fingerprint](../../../docs/clannad-engine-fingerprint.md)
before bespoke work on a new PS2 VN, particularly AIR, planetarian or Tomoyo
After (all untested candidates). It records native evidence, direct parser/VM
comparison criteria and the shared-animation research gate. Add equivalent
fingerprints as subsequent games become supported; preserve existing code and
measured coverage rather than reorganizing it on a lineage hypothesis.
Compare signatures/layouts with Remember11 and CLANNAD and test existing parsers
when evidence fits. The guide records KID/MAGES research leads (Compendium,
impacto, GARbro, MagesTools, AnimED) and requires looking for other families too.
Distinguish confirmed layer-specific compatibility from probable similarities;
shared filenames, middleware or publisher attribution alone do not prove VM
compatibility. Preserve edition evidence and licence checks; reuse proven helpers
without restarting working adapters or resuming the paused Pia target.

```sh
python3 -m vnkit inspect '/path/to/game.iso' --fingerprint
python3 -m vnkit extract '/path/to/game.iso' --level disc --out private/new-disc
python3 -m vnkit extract '/path/to/game.iso' --level archives --out private/new-resources
```

Current commercial adapters are edition-specific and **incomplete**:

- `never7-ps2`: SLPS-25256 v1.01, experimental source-word reader. Read
  [runtime/commands](../../../docs/never7-runtime.md) and the disc fingerprint.
  MWo3/oscr and CPS/OGDT differ from Remember11; AFS/ADX voices, Sony BGM banks
  and PSS movies reuse proven tools. Native predicates are bounded read-only ELF
  data; never execute the disc binary. All 188 story and 39 mend credits tables
  now parse. Credits animation is omitted; validation still exits 3 for incomplete
  presentation. Read [route/menu evidence](../../../docs/never7-routes.md): ten main
  good outcomes and all 33 extra Append stories have source-entry replay evidence.
  Native flags 21–24 earn the Cure gate; row zero requires 21, other Append rows 70.
  Do not replace conditions with guide recipes or treat credits as story opcodes.
  Run `tests/never7-route-suite.mjs`, `tests/never7-append-smoke.mjs` and isolated
  `tests/browser-never7-routes.mjs` for route changes. Keep the anomalous native
  read-index entry in validation and preserve save-signature compatibility.
  Completed-route assumptions use ten replayed main-outcome paths; read
  [Never7 read status](../../../docs/never7-read-status.md). Rebuild with
  `scripts/build-never7-read-paths.mjs` from private source-choice recipes and
  earned dependencies. Only the newly completed target receives its path; never
  add later-route text to prerequisite clears or study history. Missing sidecars
  leave ordinary reading usable. Test the read modes with
  `tests/browser-never7-read-status.mjs`; shared-save tests need a stable text
  checkpoint and `VNKIT_CLEAR_FLAG=21` for Yuka. Keep all generated paths private.
  CLI and Add game use `never7_import.py`; the installer supplies the same media
  tools as Remember11. GUI admission requires a zero-unsupported/zero-unresolved
  script census, not just its allowed presentation notice. Recovery 0.4/import 0.6
  escape trailing dots in cache paths; retain original source names and IDs.
  `tests/browser-never7-clean-import.mjs ISO NEW_PRIVATE_OUTPUT` exercises the real
  upload/conversion flow; its optional `--verify-finished` only checks an already
  completed import after interruption. Native Windows execution still needs a
  device test. Use `scripts/validate-never7.mjs`, `tests/never7-real-smoke.mjs` and
  `tests/browser-never7.mjs` with private reports and isolated saves. Both SQ
  streams are retained; native BGM selects Song zero. Stale AFS filename-row sizes
  require the explicit Never7 opt-in, never relaxed extent/path validation.
  kidfile has no declared reuse licence. Do not claim exhaustive choices or PS2/SPU2 parity.

- `remember11-ps2`: Japanese PS2 SLPM-65550 v1.02, KID. **Incomplete playable
  runtime**, newly authorized and implemented after the failed generality trial.
  Read [runtime/native evidence](../../../docs/remember11-runtime.md) and
  [import/setup](../../../docs/remember11-import.md). Do not reuse HuneX semantics
  or PSP eight-FF markers. `remember11_script.py` and `remember11-engine.mjs`
  execute original bytecode; all media conversion steps are runnable scripts.
  Five/ten-section image headers and centre-anchored CHR placement differ from
  BG/EV. Music needs the separate channel-pressure-patched VGMTrans binary.
  MV08 is proven video-only; do not silently accept missing audio in other movies.
  Preserve persistent native banks/catalogs separately from study activity.
  Import/validate exit 3 while presentation/extras remain incomplete. All unknown
  control/state commands fail closed. Static coverage is not all-route proof.

- `clannad-ps2`: Japanese PS2 SLPM-66302 v1.01, known ELF hash. HuneX, not PC
  RealLive. Read [import/setup](../../../docs/clannad-import.md),
  [formats/native evidence](../../../docs/formats-clannad-ps2.md) and
  [runtime coverage](../../../docs/clannad-runtime.md).
- `pia-ps2`: paused SLPS-25222 v1.04 NFP/SCRP recovery; separate incomplete runtime.
  If the user resumes it, read [paused handoff](../../../docs/pia-handoff-paused.md),
  [Pia runtime](../../../docs/pia-runtime.md) and native/media docs linked there.
- `synthetic`: original MIT test content only, never evidence of commercial support.

Unknown releases require investigation. Do not claim all HuneX, NOBORI or other
editions work because one disc was decoded. No faithful route percentage is known.

## Run Remember11

```sh
python3 scripts/bootstrap-remember11-media.py --cached-only
sh scripts/audio-tools-env.sh python3 -m vnkit import '/path/to/game.iso' --adapter remember11-ps2 --work private/remember11 --out private/library/remember11-live
node scripts/validate-remember11.mjs private/library/remember11-live private/remember11/new-validation.json
node tests/remember11-vm.test.mjs
node tests/remember11-real-smoke.mjs private/library/remember11-live 150 private/remember11/new-smoke
VNKIT_REPORT_DIR=private/browser-tests/remember11-new sh scripts/browser-env.sh node tests/browser-remember11.mjs
```

Omit `--cached-only` for a fresh software bootstrap. Use new work/output paths
for changed imports; never overwrite existing game assets. The historical
`remember11_ps2.import_game` recovery helper is not the current CLI entrypoint;
production imports use `remember11_import.py`. The reader does not need the ISO
once the standalone import is built. Keep raw data and test paths private.
Completed-route read sidecars must come from fresh VM replay using
`scripts/build-remember11-read-paths.mjs`, with checked choices and source-earned
chapter clears. Never mark whole scripts read or fabricate cross-chapter flags.
Consult the runtime report for exact tested endings and remaining differences.

## Run CLANNAD

Python 3.11+ handles disc/server work. Node 22+ validates. Optional vgmstream r2117
and FFmpeg/ffprobe decode audio/video; see setup. Existing the development host tools are private.

```sh
python3 scripts/bootstrap-clannad-media.py --cached-only
sh scripts/audio-tools-env.sh python3 -m vnkit import private/clannad/disc --adapter clannad-ps2 --work private/clannad --out private/library/clannad-live
python3 -m vnkit validate private/library/clannad-live
node scripts/validate-clannad.mjs private/library/clannad-live private/clannad/new-census.json
node tests/clannad-real-smoke.mjs private/library/clannad-live 150 private/clannad/new-smoke.json
node tests/clannad-campaign.mjs private/library/clannad-live private/clannad/new-campaign 1000
```

Omit the environment wrapper when FFmpeg/ffprobe are on PATH. Another ISO or
extracted disc directory needs a fresh workspace/output. Exact matching files
resume; changed output is refused. Do not delete user work to make reruns pass.
Full import/validation exit **3** while support is incomplete; exit **2** indicates
format/dependency/I/O failure. Packaging-only success is not full validation.

The server is already `vnkit-reader.service`: use
`python3 scripts/reader-service.py status|restart|start|stop`, never a duplicate
listener. Private Z13 URL and origin rules are in
[remote access](../../../docs/remote-access.md). A fresh checkout without this
service can run `python3 -m vnkit serve --port 8891`. No public deployment or
unrelated service/route changes are implied.

## Decision evidence and failure signatures

- ALLPAC/VOICE packed offsets put high sector bits in word bits28–31. Earlier
  plain-sector probing corrupted later extents. Use `resources-v2`, not the
  rejected `private/clannad/extracted` probe.
- MZP codec9 needs paired MZU residual colour; missing conversion is not a missing
  disc asset. Use `media-v3`; older media-v1/v2 omitted these backgrounds.
- SEEN scripts are strict CP932 command streams. Entry is native SEEN0414 with a
  SEEN6900/Z00 prologue call. Source SCR_ADR labels validate jumps; never sort text.
- EIF means else-if. Fallthrough ZY sets the condition; IFJP bypasses that reset.
  Native FCAL rejects scenario numbers outside 400–8999, including 9070/9077.
- Source VPLY uses global hex IDs with a 20000-clip bank split; underscores keep
  the pending voice selector. Do not infer voice association by similar filenames.
- WTK2 retains visible text but emits/counts only new sources. Empty WTKY is a
  key wait, not missing text. Save/load preserves state without replaying events.
- WTVT appends text at source voice-position cues without restarting audio. Save
  and restore its current voice position and independent segment/occurrence IDs.
  WCOF changes window visibility; it is not a no-op. Its fade remains immediate.
- `clannad_effects.py` converts SE.ACX separately into `effects-v1`. SE_NAM section
  3 takes priority over section 2; never substitute same-named VSE audio. Source
  sound fade envelopes remain degraded. Events 30 and 10 present buffered text/voice
  during motion/input through nested presentations; never defer or discard that
  text, restart its voice at the following key wait, or publish it twice.
- MNWL inserts a source newline; count/export policy excludes its whitespace.
  GCLS/GMSA and QK0 are proven original no-ops in this edition’s dispatcher;
  this is not permission to ignore other unknown commands. Events 9 and 75 now
  retain their source animation/timing and final scene state.
- `Unknown/Unresolved native event` is an explicit execution boundary. Trace its
  callbacks/resources, including completion and variable effects, before enabling
  it. Nonessential visual degradation must be named; unknown state cannot be skipped.
- `refusing to overwrite different file` requires a new build destination.
  Unsafe paths/out-of-bounds extents mean reject the operation, not relax checks.

Current basic execution covers every discovered site in all 203 scripts, with
zero unsupported commands and zero unresolved direct references. Detailed native
presentation remains incomplete; validation still exits 3. Read
[basic execution](../../../docs/clannad-basic-execution.md) for the explicit native
allowlist, lost-timed-text fix, SEB, movie/voice, progress rules and evidence.
The 1,000-run campaign reaches 69,738 logical segments, 481 choice edges, 15 source
endings and 164 scripts; timing is simulated, and earned After Story unlocking is
not yet tested. Current browser evidence is 100 consecutive pages after the old
event-41 boundary, separate from historical 2,450 entry pages. Never add them.

Important continuation rules:
- Prioritize source branches/state/text across routes over native animation polish.
  Unknown instructions remain fail-closed; zero unsupported sites is not fidelity.
- JUMP has an optional target label; empty FRET / over-depth FCAL are native no-ops.
- Initial F[500]=1 is native, and absent old-save values are repaired. G survives
  new playthroughs in a separate browser record. Ordinary slot loading overlays
  current G, preserving earned flags. Back up global progress alongside saves and
  activity. Do not show the AFTER STORY entry before its native title gate.
- WTTM/WTTK/ECTW and CLR_/CLNV flushes can contain new text. Preserve logical
  source/occurrence IDs and do not discard it or republish retained display text.
- The malformed symbolic conditions use exact-ELF bounded evaluator evidence,
  not invented variable aliases. See `clannad_expression.py`; its private probe
  test is not a general emulator or permission to execute installers.
- Development metadata key ordering can change the legacy save signature even
  when fields match. Test with the final import. The explicit checkpoint-rebase
  utility requires deep equality and validates every save; do not relax reader
  compatibility validation to accept arbitrary checkpoints.
- Keep partial browser, headless, original-engine and synthetic test evidence
  distinct. Signed16 overflow and new unknown parameter forms still fail closed.

## CLANNAD menu maintenance

Read [menu/progress/date evidence](../../../docs/clannad-menu.md) when changing
endings, completion or presentation loading. Endings must persist progress and
open the menu. Manual completion is explicitly user-requested here; keep its
provenance distinct from source-earned flags, keep a pre-change progress backup,
and never count it as reading or natural After Story coverage. Ryou has no unique
native clear flag; only its exact reached ending records completion. Misae's light
is earned separately in Tomoyo's route. Fuko's returned light repays a consumed
light; debug restoration must not manufacture a fourteenth light.

Original DDAT badges are recovered into `nativeData.calendar`; F1112 controls
visibility. Decode a full detached scene (body and face together) before swapping
the visible DOM. Busy operations must release before scheduling zero-duration
waits; a timer firing while busy can leave a restored scene stuck. Keep menu
errors visible inside the dialog. The sound test uses existing original BGM and
must not advance story state or learning statistics.

Use `tests/clannad-menu-checkpoints.mjs` to produce private reached checkpoints,
then `tests/browser-clannad-menu.mjs` with VNKIT_CHECKPOINTS/VNKIT_REPORT_DIR.
The latter distinguishes a real reached Misae ending from manual unlock tests.
It also deliberately delays a face request, fails a content request, and checks
progress export/reload and ownership errors. See the linked doc for exact commands.

## Shared-save maintenance

Read [shared saves](../../../docs/shared-saves.md) for per-game local/shared
selection. Local remains default; sharing to this private home server is opt-in
and authorized here. Preserve both banks and keep activity/seen/history local.
Never resolve a stale revision by silently overwriting newer server data. Shared
writes freeze after bounded transport retries and retain a separate recovery.
Retry operation IDs/base revisions remain immutable; server receipts acknowledge
lost replies without bypassing newer bank revisions. Persist `shared-pending`
before transport. Explicit recovery reloads without flushing the old engine;
Reload shared saves instead archives recovery and chooses the server position. Autosave and route
progress commit atomically; unpresented Next choice traversal retains checkpoint
progress. Keep the save-location panel reachable from Library on load failure.
Saves → Delete uses fixed-slot null changes, with the same revision/retry/recovery
rules as writes. Never store a null record or delete route progress. Deleted
autosave stays empty until presentation resumes. Activity → Clear current session
subtracts only its persisted per-day counters. Sessions resume within four hours;
reading days start at 04:01 local time. Individual deletion preserves seen IDs;
v1 migration backs up history and labels estimated old day attribution. Test
`tests/reader-sessions.test.mjs` as well as browser data controls, retaining earlier sessions and encountered
text/occurrence IDs. See [activity policy](../../../docs/text-and-statistics.md)
and `tests/browser-data-controls.mjs`; reset/deletion must not emit old dialogue.
Use `tests/browser-shared-saves.mjs` (isolated server/profiles) and the consistent
`scripts/backup-shared-saves.py` helper. Never test against the user's live bank.

## Extend and validate

Use [adapter contract](../../../docs/adapters.md). Keep filenames/opcodes/native
addresses/character mappings in `vnkit/adapters` and `web/adapters`, outside the
shared reader. Use the existing safe writers and bounded source class. Preserve
raw fingerprints, stable source IDs and independent presentation occurrence IDs.
Unknown instructions fail at their original location with atomic state rollback.

```sh
python3 -m unittest discover -s tests -p 'test_*.py' -v
node --test tests/reader*.mjs tests/clannad-vm.test.mjs
python3 -m vnkit validate fixtures/synthetic
sh scripts/browser-env.sh node tests/browser-clannad.mjs
sh scripts/browser-env.sh node tests/browser-clannad-modes.mjs
sh scripts/browser-env.sh node tests/browser-clannad-native.mjs
sh scripts/browser-env.sh node tests/browser-clannad-voice-cues.mjs
VNKIT_CHECKPOINTS=private/clannad/new-campaign VNKIT_REPORT_DIR=private/browser-tests/new-basic sh scripts/browser-env.sh node tests/browser-clannad-basics.mjs
```

The old extension/navigation harnesses contain opening-only stop/flag assertions;
use the current basics harness for the new boundary/progress behavior. The older
reports remain historical evidence, not current regression results.

The browser modes test requires the private source-reached motion checkpoint;
its generation is documented in the runtime report. Use `tests/browser-poll.mjs`
for asynchronous IndexedDB conditions: Playwright 1.55 `waitForFunction` does not
poll the resolved Boolean of an async callback. Test at least 100 real
successive text boundaries plus choices/saves/media. Audit all discovered scripts,
unresolved references and unsupported semantics. Original-engine/device/Yomitan
comparisons remain explicitly unverified until performed. Follow the
[text/activity contract](../../../docs/text-and-statistics.md): no future text
feed, no rerender/restore/reconnect duplicates, no skip-inflated study totals.

Update adapter docs, compatibility, handoff, AGENTS.md and this skill with every
support change. Keep discs, scripts, media, saves, reports and screenshots under
ignored private paths. `python3 -m vnkit package` uses a code-only allowlist with
original synthetic fixtures and attribution; review additions and never publish
without instruction. Reuse by copying this skill with the toolkit checkout/code
package, preserving these relative links; a lone skill needs an explicit toolkit
location and adjusted links.

Completed-route read assumptions: consult the activity contract before changing
Skip read. `scripts/build-clannad-read-paths.mjs` replays recorded choice paths and
rejects divergent endings; private IDs stay in the import sidecar, not public code.
Never seed statistics/backlog or guess route text from filenames. Test with
`tests/reader-read-status.test.mjs` and `tests/browser-read-status.mjs`.

## Windows distribution

Read [Windows setup](../../../docs/windows.md) and
[build/evidence](../../../docs/windows-build.md). The test installer uses an
original WinForms tray launcher, app-local checksum-pinned tools and the existing
Python server through a private control pipe. Port changes are explicit; never
change ports silently or kill an occupied listener. Keep install files separate
from user data and preserve it during upgrades/uninstall. The Windows package
builder adds only an explicitly selected converter and its corresponding source.
Native Windows installation and complete imports require device evidence.
Do not run Wine on the home server: the attempted tests were associated with a
runaway process/OOM incident. Use the user's Windows device or a dedicated VM
with enforced memory/process limits for execution tests.

## Task usage tracking

The user requests a model/token CSV for roadmap work. Follow
[the counting policy](../../../docs/task-usage.md) and run
`scripts/record-task-usage.py` to update local `task-usage.csv`. Use actual model
metadata and counter deltas; distinguish cached input and output subsets. Keep
measurement timestamps and partial outcomes. Never infer an exact missing count,
include subsequent tasks in an earlier total, or publish the raw session logs.
