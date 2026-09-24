# Ever17 PS2 reader

The tested edition is **Ever17 -the out of infinity- Premium Edition**, Japanese
PS2 **SLPM-65421 v1.01**. All five main routes have completed source-script
replays, including the earned final-route unlock. Both protagonist entries into
the final route, the extra epilogue paths and all three bad-ending branches
also finish. Native presentation is still incomplete.

This is an edition variant of the Remember11 MAC interpreter. It reuses the
disc, archive, compression, audio and movie tools and the shared browser reader.
It does not require a Remember11 disc. The [original investigation](ever17-investigation.md)
records the evidence for that relationship; its earlier recovery-only status
is historical.

## Import and run

Use **Add game / Import media** and select this exact ISO. Ever17 is included in
the source version and Windows installer from v0.1.0-beta.3 onward. See [Windows setup](windows.md). Native Windows
conversion of Ever17 has not been tested.

On Linux, use the same pinned media tools as [Remember11](remember11-import.md):

```sh
python3 scripts/bootstrap-remember11-media.py --cached-only
sh scripts/audio-tools-env.sh python3 -m vnkit import '/path/to/Ever17.iso' \
  --adapter ever17-ps2 --work private/ever17-work \
  --out private/library/ever17
python3 -m vnkit validate private/library/ever17
node scripts/validate-ever17.mjs private/library/ever17 private/ever17-validation.json
python3 -m vnkit serve --library private/library
```

Omit `--cached-only` for a fresh tool download. The environment wrapper selects
the optional local Linux tool installation; ordinary installed tools can also
be used. `VNKIT_VGMTRANS` selects the patched VGMTrans binary. No disc executable
is run. Conversion uses at most two workers, with one music/movie worker.

Use the existing reader service when it is already running, rather than starting
a second listener. The reading URL is
`http://127.0.0.1:8891/?game=ever17-slpm65421-1.01`.
The prepared library works without the ISO present. Keep the ISO/work directory
if another conversion may be needed.

The maintainer's installed copy is `private/library/ever17-live`. The existing
private Tailscale reader uses the same `?game=ever17-slpm65421-1.01` query.

Import and validation return **3** for the documented presentation limitations.
Format/dependency failures return **2**. GUI installation permits only the named
presentation notice and requires zero unsupported story sites and zero unresolved
direct references. Different editions remain unsupported.

Exact existing files resume after hash checks. Changed output must use a new
directory; imports never replace existing game IDs or save banks. The manifest
records input/tool/adapter versions, source hashes, conversion settings and asset
mappings. All derived files, recipes, checkpoints and reports remain private.

## What is implemented

- Original CP932 dialogue, narration, speakers, source choices and conditions.
- Native local/global integer and bit banks, arithmetic, calls/returns and
  source-proven external script entries. Unknown state/control operations stop.
- Original backgrounds, CGs, portraits, voice, effects, music and movies.
- Persistent source clear flags, manual completion with separate provenance,
  ending return to the library and new games retaining earned unlocks.
- Shared reader controls, 15 saves, local/shared save choice, backlog, previous
  line, Next choice, Skip read, pause, text output, statistics, mobile layout,
  colour/opacity preferences, CRT display and sound test.

The final route uses the native four-route gate. You and Sara have distinct
good-ending and epilogue flags; their required epilogues are part of completion.
The reader does not infer clears from credits, file names or a generic ending.
Manual completion is explicitly labelled and does not add study activity.

## Measured coverage

The full private import contains **94 executable script resources**, **96,229
discovered instruction sites** and **16,083 assets**. Of those instructions,
**93,853** belong to story resources. The story census has zero unsupported
operations, missing direct resources or parse errors. Four additional MAC members
are native menu tables, not bytecode. Eighteen auxiliary/debug sites remain
unsupported, including two empty placeholder scripts; none are story entry points.

All 17,556 archive members were recovered. All 1,383 scene-image containers and
their additional frames converted, as did 14,364 voices, 147 effects, 54 original
music banks and all six PSS movies. Lossless movie conversion was checked against
decoded source frames/audio. No missing disc content or substitute media was used.

The five-route sequential replay starts fresh and carries only source-earned
progress. It reaches 40,084 distinct text IDs across 68 scripts and performs 504
save/restore comparisons before and after choices and at regular text intervals.

| Route | Presented segments in its replay | Choices | Restore checks |
| --- | ---: | ---: | ---: |
| Tsugumi | 12,466 | 40 | 104 |
| Sora | 13,029 | 49 | 124 |
| You, including epilogue | 11,307 | 38 | 98 |
| Sara, including epilogue | 8,776 | 32 | 80 |
| Coco, Takeshi entry | 14,793 | 35 | 98 |

Separate replays cover Coco's Boy entry and both earlier-route paths to the
post-Coco epilogue (334 restore checks), plus the three bad ends and You's ending
without the required epilogue (382 checks). Bad endings leave the main clear/gate
flags unset. These are **headless source-execution tests with simulated timing**,
not original-console comparisons or proof of every optional choice combination.
Counts across these campaigns overlap and must not be added as unique coverage.

The isolated Chromium reader check runs over 100 consecutive source segments and
choices with original art, voice and music. It also checks selection, clipboard,
15 save slots, load/reload without recounting, global pause, Next choice and
landscape fullscreen. A source-reached movie checkpoint decodes, pauses and
returns to the story after completion. Physical Android, Yomitan and native
Windows remain device checks for this title.

The browser ending suite separately finishes all five source-reached ending
checkpoints, verifies menu return, earned progress, older-save retention,
completed-route colour, sound test and Start again. Two isolated device profiles
pass shared-bank migration, conflict protection, offline recovery, export and
lost-reply retry tests. No live shared saves were used.

## Native details that must not regress

- Command directory: 130 twelve-byte ELF rows at `0x1e1338`. Source `0x4c`
  is an extra save-title instruction; later IDs shift relative to Remember11.
  Preserve source opcode/words even when normalizing dispatch.
- Six compact sound controls use two bytes, not Remember11's four. Map controls
  also have distinct widths. The null source command `0x60` stays invalid.
- Calculation 17 registers CG progress; 18–20 correspond to Remember11's 17–19.
- External entry selectors are derived from source load/wait/calculate/call
  sequences. Thirteen additional selectors are evidenced. Gaps before code can
  contain text; do not treat every word in them as an entry pointer.
- **End mode 2 runs credits and resumes at the next instruction.** End mode 1
  returns to the menu. Treating both as final ends loses epilogues and unlocks.
  Native evidence: `0x120c18`, `0x10bc10`, `0x1545e8`.
- Ever17 tiles are 16×16 with no Remember11 two-pixel gutter. Containers have
  five, six or ten sections. Its viewport is 640×480; character X is a centre
  anchor. Do not inherit Remember11's 448-line scene height.
- INIT's first table identifies STARTUP, DBG_MENU and four menu-table resources.
  The empty TC1B/TC1C placeholders are admitted only with their exact bytes and
  remain fail-closed. Never synthesize an ending from their zero padding.

## Remaining fidelity limits

Animated credits are omitted, with a source-located warning; the following story
continues. Native transitions, map/clock overlays, detailed text timing, font
effects and some sound envelopes are simplified. BGM uses the original Sony
instrument banks rendered by FluidSynth, not identical SPU2 synthesis.

The rare custom-font code `0x8753` currently retains its CP932 character `⑳`.
It appears in some Latin-text spacing and ending typography. Its FOP mapping
has not been established well enough to replace it. Original bytes/offsets are
preserved; no narrative is rewritten to hide this limitation.

Native galleries, shortcuts, promotional playback menus and debug menus are not
reimplemented. The shared library, progress controls and sound test provide the
reader's menus. Optional-scene coverage and original PS2 timing/visual comparison
are not exhaustive. Full validation therefore continues to report incomplete
native presentation rather than claiming perfect emulation.

## Reproduce the checks

```sh
python3 -m unittest discover -s tests -p 'test_ever17.py' -v
node --test tests/ever17-vm.test.mjs tests/remember11-vm.test.mjs
node tests/ever17-route-suite.mjs IMPORT PRIVATE_PLAN PRIVATE_OUTPUT
node tests/ever17-real-smoke.mjs IMPORT PRIVATE_OUTPUT 150 0
sh scripts/browser-env.sh node tests/browser-ever17.mjs LIBRARY PRIVATE_OUTPUT
sh scripts/browser-env.sh node tests/browser-ever17-routes.mjs LIBRARY PRIVATE_CHECKPOINTS PRIVATE_OUTPUT
sh scripts/browser-env.sh node tests/browser-ever17-import.mjs ISO VERIFIED_WORK NEW_PRIVATE_OUTPUT
```

The import browser harness deliberately resumes a verified cache and uses a
server-local ISO. It is not a fresh-cache conversion or upload test. It still
executes the real dependency preflight, CLI, validation and atomic install.
Public unit tests contain original synthetic instructions only.

`scripts/build-ever17-read-paths.mjs IMPORT PRIVATE_PLAN NEW_OUTPUT` replays the
five private recipes in earned order and builds a signature-bound `read-paths.json`.
It collects only text encountered during that route, never prior prerequisites.
The optional sidecar enables completed-route read assumptions without adding
statistics. Recipes and sidecars are not distributed. Without it, normal read
tracking still works and the progress panel reports missing assumed-read evidence.

Maintainer evidence lives under `private/ever17/`: `build-v3`,
`earned-campaign-v3`, `extra-campaign-v1`, `bad-campaign-v1`, the browser reports
and native probes. These files are not part of the public package.
