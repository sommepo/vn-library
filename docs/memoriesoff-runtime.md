# Memories Off — original PlayStation

The supplied Japanese **SLPS-02296** single-track CUE/BIN dump has an experimental
source-driven reader. It appears in **Library → one → Memories Off → Read / resume**.
This is the PS1 original, not a PS2/PSP port. No executable version is asserted:
its SYSTEM.CNF does not contain a VER field.

The local importer recovers original scripts, backgrounds, portraits, XA voices
and SEQ/VAB music. The shared reader provides selectable Japanese, Copy, backlog,
activity, choices, Next choice, Previous line, 15 saves, fullscreen and the existing
opt-in shared-save bank. Save/restore retains source offsets, choices, call stack,
variables and random state. Persistent clear flags remain independent of positions
through the shared progress contract. No synthetic dialogue or ordered-text
playlist substitutes for native control flow.

**Sound test** is available in the collapsed Memories Off actions under **one**.
It plays the 16 imported tracks in numeric source order, with loop and stop
controls. Numbered labels do not claim recovered song titles. Both Chromium and
Firefox play every track and confirm that an inactive title creates no autosave,
progress or activity; leaving the panel releases its audio. The same isolated
runs repeat the 150-segment reader checks below. Evidence (2026-09-29):
`private/memoriesoff/sound-test-chromium-v2` and `sound-test-firefox-v3`.

## Import

Keep the CUE and its named BIN together. This importer accepts exactly one
MODE2/2352 track with INDEX 01 at 00:00:00. Other revisions and track layouts are
not admitted. It does not execute the game program or need a PlayStation BIOS.

```sh
python3 -m vnkit inspect '/path/Memories Off (Japan).cue'
python3 -m vnkit import '/path/Memories Off (Japan).cue' \
  --adapter memoriesoff-ps1 --work private/memoriesoff \
  --out private/library/memoriesoff-live
python3 -m vnkit validate private/library/memoriesoff-live
```

Import/validation intentionally exit **3** for incomplete native presentation.
Changed output is rejected; choose a new output/work directory. Source files,
recovered data and conversion caches remain private. CUE/BIN import is available
from the local CLI, **not the browser ISO uploader**. Beta.5 includes the reader
and importer source, but the Windows installer does not automate this conversion
or bundle its extra PS1 converter. The PS1 Add game notice explains the CLI route.
See [PS1 media tools](ps1-media-tools.md) for build instructions.

FFmpeg decodes XA. VGMTrans revision
`3e16daae49d42246f2d1b302b04f6e80a8037342` exports PS1 SEQ/VAB, and FluidSynth
renders the original instrument banks. Set `VNKIT_VGMTRANS` and
`VNKIT_MEMORIESOFF_SHORT_VGMTRANS` for external binaries. The latter uses the
small [short-VAB patch](../scripts/vgmtrans-memoriesoff-short-vab.patch): one
original four-frame sound is shorter than the upstream automatic scanner's
ten-frame heuristic. The patch uses its explicit VAB sample extent. A zero gap
separates sample data from the sequence in the temporary tool input; no sample
or sequence bytes are substituted. Retain upstream's zlib notice. The local
importer's tooling defaults refer to private binaries, not distributed tools.

## Measured coverage (2026-09-28)

- 46 source scripts, 71,978 parsed command sites, 27,619 text commands and 460
  source choice-string tables. All encountered opcodes have basic execution.
- 975 directly referenced images, 5,241 XA voice clips, 16 music tracks and 20
  sound effects convert and pass file-hash checks. No missing direct media.
- 500 simulated fresh-entry campaigns finish with **zero execution stops** and
  **1,740 restore/replay checks**. They cover 57,889 unique instructions, 22,873
  text sites, 364 choice edges and 39 scripts, earning five of six clear flags.
  Media/timing are simulated; this does not establish all routes/optional branches.
- Chromium and Firefox each display 150 actual text segments and play original
  voice/music. Both check selection, copying, resume without recounting, 15 slots,
  source-state loading, Previous line, Next choice and landscape fullscreen.
  Chromium verifies clipboard contents; Firefox verifies the Copy action only.
- Original synthetic Python/JS tests check raw-sector boundaries, unsafe CUE
  paths, LZSS overlap/truncation, source text boundaries, choices, byte arithmetic,
  progress, atomic rollback and malformed saves. These are not game coverage.

Private reports: `private/memoriesoff/campaign-v1`, `browser-v4` and
`browser-firefox-v1`. Earlier browser probes caught an incorrect palette-index
assumption and test timing/library-resume assumptions; they are not the final
visual evidence. Source, glyph sheets, screenshots, recipes and saves never ship.

```sh
python3 -m unittest discover -s tests -p 'test_memoriesoff.py' -v
node --test tests/memoriesoff-vm.test.mjs
node scripts/validate-memoriesoff.mjs private/library/memoriesoff-live
node tests/memoriesoff-campaign.mjs private/library/memoriesoff-live \
  private/memoriesoff/new-campaign 500
sh scripts/browser-env.sh node tests/browser-memoriesoff.mjs \
  private/library private/memoriesoff/new-browser
```

## Limits

Native transitions settle immediately. Particle/decorative overlays and the
calendar presentation are omitted. Audio fades and exact SPU synthesis/mixing
are not reproduced; FluidSynth is an approximation using original samples.
Native controller/system/gallery menus and original-console comparisons are
unverified. The shared reader UI supplies reading controls.

Six source branches address the byte immediately after a decoded script. Four
instructions are structurally unreachable after unconditional transfers; two
conditional sites remain unproven. None was taken in the campaign. They stay
fail-closed if reached; the reader never treats unknown buffer contents as a
valid ending. Static validation reports these separately from missing media.
The sixth clear flag and exhaustive optional choices are not claimed tested.

Text is predominantly CP932 with 36 custom slots. Their font bitmaps were
visually transcribed into font-hash-bound correspondence facts. This is not an
official encoding recovery or independent human proofread. Source bytes and
read IDs remain in private scripts. See the [engine evidence](memoriesoff-investigation.md).
