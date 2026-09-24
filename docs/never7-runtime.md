# Never7 PS2 reader

This is the Japanese PS2 **SLPS-25256 v1.01** edition. It now runs source scripts
in the shared reader, with original backgrounds, portraits, voices, effects,
music and movies. All ten main good-ending outcomes and all 33 additional Append
stories now have start-to-end execution evidence; see [routes and endings](never7-routes.md).
It is still an experimental import with incomplete presentation fidelity.
The [disc fingerprint](never7-investigation.md)
records what was measured and what transfers from earlier games.

## Run it

The local import is `private/library/never7-live`. The running reader uses
`http://127.0.0.1:8891/?game=never7-slps25256-1.01`; the existing private Tailscale
address works with the same `?game=` value. No ISO is needed during reading.
CLANNAD and Remember11 are retained. The Windows package and Add game screen now
include Never7; select the ISO and choose Add game just as for the other two titles.

For another copy of this exact edition, install the same pinned media tools used
by Remember11, then run:

```sh
python3 scripts/bootstrap-remember11-media.py --cached-only
sh scripts/audio-tools-env.sh python3 -m vnkit import '/path/to/Never7.iso' \
  --adapter never7-ps2 --work private/never7-new \
  --out private/library/never7-new
node scripts/validate-never7.mjs private/library/never7-new private/never7-validation.json
```

Omit `--cached-only` on a fresh software setup. The environment wrapper is only
for the local Linux tools directory; installed FFmpeg/ffprobe and FluidSynth can
be used directly. `VNKIT_VGMTRANS` selects the existing patched VGMTrans shell.
See [Remember11 dependencies](remember11-import.md) and [provenance](provenance.md).
Windows execution of this new adapter has not been tested. Never run Wine here.

Import and full validation deliberately return **3** for incomplete support.
Dependency/format failures return **2**. A successful partial import writes
`content.json`, `manifest.json` and `compatibility.json`. A finished recovery alone
is not a playable import. The GUI accepts the documented presentation notice only
when the script census has zero unsupported sites and unresolved direct references.
Unknown story instructions still prevent installation.

Every stage can be run separately and resumed:

```sh
python3 -m vnkit.adapters.never7_ps2 '/path/to/Never7.iso' --out private/never7/recovery-current
python3 -m vnkit.adapters.never7_ps2 '/path/to/Never7.iso' --images --out private/never7/images-v1
sh scripts/audio-tools-env.sh python3 -m vnkit.adapters.never7_audio '/path/to/Never7.iso' --work private/never7/audio-v1 --jobs 2
sh scripts/audio-tools-env.sh python3 -m vnkit.adapters.never7_music '/path/to/Never7.iso' --work private/never7/music-v1 --vgmtrans private/tooling/remember11-vgmtrans-shell
sh scripts/audio-tools-env.sh python3 -m vnkit.adapters.never7_movie '/path/to/Never7.iso' --work private/never7/movies-v1
python3 -m vnkit.adapters.never7_import '/path/to/Never7.iso' --work private/never7 --out private/never7/new-reader --prepared
```

`--prepared` assembles existing stage outputs and reports missing media. It is for
investigation, not a claim that an incomplete cache contains all resources. Use a
new output for changed conversions; exact matches resume without overwriting.
Recovery version changes also need a new work folder. The original investigation
cache is retained as evidence and can still feed `--prepared`.

Recovery 0.4 and import 0.6 use percent-escaped extraction names for source files
whose names end with a dot (for example `OLM/O0.` becomes `raw/OLM/O0%2E`). This
avoids Windows silently stripping the dot. ISO lookup names and stable source IDs
are unchanged. Original percent signs are escaped to prevent path collisions.
The compiler can still read earlier Linux recovery folders. New conversions
should use a new workspace; existing installed games and saves are not replaced.

## Installer and clean-import evidence

The Windows package now registers this exact edition in Add game and supplies
its media dependencies. No additional download or manually copied game file is
needed beyond the owner's ISO. The same single worker, resumable uploads,
tool checks and atomic library installation used by the other titles apply.

A full 3.59 GB ISO upload and fresh conversion completed through the Linux
Chromium GUI on 2026-09-22. The workspace included spaces and Japanese characters.
The upload copy matches the original SHA-256. All scripts and asset IDs match the
earlier tested import, so its runtime signature and save compatibility are
unchanged. Full validation reports zero errors, unsupported sites or unresolved
references, including 7,245 bounded condition probes. Exit 3 still records missing
native presentation.

The new output passed 178 browser text segments and two choices with voices,
BGM, pause, copy, save/load, reload, Next choice and fullscreen layout. Separate
browser checks passed source-earned Yuka/finale endings, menu unlocks and progress
preservation. Main route recipes were replayed against this new output as well.
See [GUI evidence](import-gui.md#clean-never7-import-2026-09-22) for the interrupted
harness/resumed verification boundary. These are actual conversion tests with
existing Linux tools, not a fresh OS setup or native Windows execution claim.

On Windows, quit the old tray app, install the updated package, reopen VN Library
and use Add game. Still to check on the Z13: installer update, a complete Never7
conversion, audio playback, route/save controls and reopening after quitting.

## Execution and state

`never7_script.py` decodes native word commands and strict CP932 pointers, including
pointers inside named string objects. Stable text IDs use symbol plus byte offset.
The native entry is `init_intdat`, with actual calls into the opening; filenames
are never used to infer order.

`never7-engine.mjs` implements registered choices, labels, forward/from-start
jumps, cross-overlay transfers, the native single return frame, signed 16-bit
variables, media and waits. Choice indices write native variable 16. Persistent
flags use the executable's Gamedat2Sys list and nonzero-latch semantics; an old
position must not roll back independent persistent progress or study history.
End commands return to the library with earned completion flags. The native
Append menu supplies gated story entries, and route progress/manual completion
is available. Native credits animation and system-save prompts are not reproduced.
The installed import has [completed-route read paths](never7-read-status.md) for
all ten main outcomes. These enable red text and Skip read independently of study
counts. The optional private sidecar is built by replay, not included in new
imports automatically.

`never7-predicate.mjs` evaluates only the recovered `oscrIfCheck` function and its
bounded read-only switch tables. Calls, stores, system calls, external memory,
unknown instructions and excessive execution fail closed. This is not a general
PS2 emulator. Function bytes, tables, conditions and actual game text stay in the
private import. No native executable is run as a process.

All 227 tables now parse: 188 oscr story tables with 102,383 instructions and
39 mend credits tables with 3,442 instructions. There are 59,457 story text sites
and 805 condition sites. The credits format was established through its actual
native consumer, not by ignoring the previous parse failures. It is structurally
validated but not animated. One anomalous native read-index slot points inside a
string, not a scenario array; validation reports it separately. There are zero
unresolved direct story or menu references.

All 805 predicates were exercised with nine uniform signed-variable profiles:
7,245 bounded evaluations, 4,801 native instruction addresses, no evaluator errors.
This checks the evaluator's accepted operations; it does not prove every possible
variable combination or equivalence to an original PS2 run.

## Media and text

- Native ELF image tables bind IDs to exact CPS extents. 13 table entries do not
  have supported PNGs; no discovered direct scenario reference targets them.
  The complete recovery also retains 86 unsupported image variants privately.
- The AFS/ADX tools convert 9,907 voice clips, 104 sound effects and three streamed
  songs to FLAC. The exact edition opts into stale filename-row size metadata;
  member-table bounds and safe paths are still enforced. Original packed IDs
  determine association, never similar filenames.
- 24 BGM banks render using the original instruments, native bank table and song
  zero selection. Both source MIDI streams and Song records are retained. Source
  loop points are used where decoded. FluidSynth is an approximation of SPU2.
- PSS conversion preserves decoded video pixels and PCM audio as VP9/FLAC, with
  hash comparisons for each of the 18 original/converted movies. Twelve contain
  audio; six are video-only in the source. The strict silent-PSS parser rejects
  audio packets rather than discarding them. Browser tests seek near movie ends
  to exercise script resumption; they do not watch every frame.
- Source sound waits track the effects channel's playback completion. Immediate
  effects and the native repeating-effect set use the shared audio manager.
- Speaker separation uses the executable's 63-entry name table and two opening
  delimiters, not a guessed name pattern. Choices keep their complete source text.
- CP932 spelling/newlines remain unchanged. `\k` and `\p` control segments/pages;
  `\t` inline pauses currently settle immediately. No separate ruby markup was
  found in parsed text. Ruby support in the synthetic reader is not evidence of
  native ruby/font parity here.

Transitions, fades, CG pans, decorative effects, calendar artwork, native clock/
score displays, vibration and original text timing remain incomplete. Background
and portrait positions follow distinct native tables/anchors. No CLANNAD portrait
offsets are applied. Original-console audiovisual comparisons remain unperformed.

## Evidence and regression commands

```sh
python3 -m unittest discover -s tests -p 'test_never7.py' -v
node --test tests/never7-vm.test.mjs
node tests/never7-real-smoke.mjs private/library/never7-live private/never7/new-smoke 24000 3
# Optional final argument loads persistent progress from an earlier real run.
node tests/never7-campaign.mjs private/library/never7-live private/never7/new-campaign 50
sh scripts/browser-env.sh node tests/browser-never7.mjs private/library private/browser-tests/never7-new
# To include a movie reached by actual source execution:
node tests/never7-media-checkpoints.mjs private/library/never7-live private/never7/new-media-checkpoints
VNKIT_MOVIE_CHECKPOINT=private/never7/new-media-checkpoints/movie-at.json \
  sh scripts/browser-env.sh node tests/browser-never7.mjs private/library private/browser-tests/never7-with-movie
```

Use an isolated server/profile for all browser tests. Never use the live shared
bank. The browser harness opens its own ephemeral listener; sandbox permission
may be needed. Reports and screenshots remain private.

The earlier build's browser report is
`private/browser-tests/never7-final-v3/report.json`: 178 source segments, two
choices, 15 voiced segments, original-bank BGM, decoded scene images, selection
protection, clipboard, 15 manual slots, save/load, reload without recount,
Next choice without skipped-narrative counts, global pause and landscape
fullscreen. A source-reached movie checkpoint also decoded, paused and returned
to the story on completion. The checkpoint builder reached it after 6,204 text
segments; that traversal was headless, not additional browser coverage.

An earlier audio browser run timed out during initial loading without a captured
cause. Subsequent isolated runs passed; the cause of that timeout remains unknown.

Headless runs simulate timers and movie completion. They compare continuation of
the live VM against restoring the same checkpoint into a fresh VM, including the
choice result and subsequent variables. They are not audiovisual tests. The earlier
campaign is `private/never7/final-campaign-v2/summary.json`: 50 sequential runs,
430,482 text presentations including repeats, 3,073 choice comparisons, 7,355
restores, 53 scripts and three distinct source ending locations, without VM
errors. Persistent flags were earned by preceding runs, not manually set. These
are repeated traversals, not 430,482 unique lines or proof of all routes.

`private/never7/final-validation-v2.json` records the earlier state, retaining all
39 unsupported table sites. The current route reports and browser reruns
are in [the route report](never7-routes.md); do not combine old and new test counts.
The earlier ten Python format tests and 15 Node reader/VM test files passed. The reusable
skill passed its format check. These synthetic/unit checks are separate from
the actual-disc evidence above.

The verified import was installed atomically as `private/library/never7-live`.
Read-only requests confirmed the existing service lists it and serves its content
and interpreter. The other imports and live save banks were not changed; the
service did not need a restart.

Shared reader features include backlog, export/import, local/shared save storage,
15 slots, bookmarks, previous line, global pause, auto, Skip read, Next choice,
text output, activity tracking, CRT controls and sound test. Their availability
comes from the common reader; checks performed specifically with Never7 are listed
in its browser reports. Yomitan/device use, native Windows conversion, external
WebSocket consumption and all-route comparisons have not been repeated for this
new adapter. Existing CLANNAD/Remember11 tests are not Never7 route evidence.

Never7-specific read-mode and shared-save checks now pass; see
[read status and cross-device evidence](never7-read-status.md). Chromium and
Firefox cover the read paths, and two isolated Chromium profiles cover shared
save conflicts/recovery. Physical devices and external text consumers remain
separate acceptance checks.

## Next work

1. Compare representative scenes and choices with original PS2 execution.
2. Expand optional-scene/choice-history comparisons beyond the tested endings.
3. Render the now-identified credits presentation interpreter and native effects.
4. Verify source Song routing/mixing against PS2 audio and improve native timing,
   CG crops, calendar and decorative presentation.
5. Add clean Windows/GUI import coverage before public support or packaging.

Task/model/token measurements are in local `task-usage.csv`. See
[the measurement policy](task-usage.md); the port remains in progress.
