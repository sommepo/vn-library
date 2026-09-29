# Otogirisou and Kamaitachi PS1 readers

The exact Japanese PS1 editions **Otogirisou Sosei-hen SLPS-01645** and
**Kamaitachi no Yoru Tokubetsu-hen SLPS-01794** have experimental, source-driven
local readers. They appear under **one**. Neither is a transcript reader.
The source programs drive branches, page retention, choices and earned progress.
Original-console comparison and exhaustive route coverage are not established.
Import and validation intentionally return exit **3** for the limits below.

## Presentation and reader behaviour

Both use a 320×240 native frame. Text sits directly over the artwork, retaining
source glyph positions, paragraph/page controls, colours and inline choices.
There is no bottom dialogue box or boxed choice list. Original bitmap glyphs
are presented through selectable Unicode DOM text, with the source atlas as
masks. The frame scales as a whole on phones and in fullscreen.
Retained `displayText` is separate from newly counted `text`; revisiting a save
must not recount its displayed page. Previous line and Next choice use the
ordinary bounded reader mechanisms. Name input is a separate native boundary.

Word lookup uses connected inline glyph spans. Each whole source text run is
anchored once; relative offsets within it preserve the original bitmap positions
without turning every character into a separate dictionary-scanning paragraph.
This also avoids native button-content centring for inline choices. No generated
word segmentation, duplicate hidden text or unrevealed story text is inserted.

The two engines are distinct. Kamaitachi interprets 42 source SCE resources;
its bounded native text kernel owns font layout and several source predicates.
Otogirisou runs a bounded set of original integer MIPS routines over its exact
executable/CDIMG resources, with explicit host media calls. It has no BIOS,
installer, filesystem, network or arbitrary native-code execution interface.
Every unimplemented control operation stops with its source position.
The shared integer probe's unaligned load/store instructions are tested; this
reuse does not resume the paused 428 reader.

## Local import

Keep each original single-track MODE2/2352 CUE and its BIN together. Exact
executable and SYSTEM.CNF hashes are checked; no unrecorded version number or
other edition is admitted. Browser Add game remains ISO-only and does not
accept these CUE/BIN pairs. Beta.5 packages include both readers and importer
source; the Windows installer does not automate their PS1 conversion.

```sh
python3 -m vnkit import '/path/to/Otogirisou.cue' \
  --adapter otogirisou-ps1 --work private/otogirisou-import-work \
  --out private/otogirisou-import
python3 -m vnkit import '/path/to/Kamaitachi.cue' \
  --adapter kamaitachi-ps1 --work private/kamaitachi-import-work \
  --out private/kamaitachi-import
python3 -m vnkit validate private/otogirisou-import
python3 -m vnkit validate private/kamaitachi-import
```

The ordinary CLI calls `chunsoft_import.py`, retaining separate recovery,
artwork, audio, movie and assembly outputs. An identical rerun resumes its
verified caches; differing files require a new output directory. Recovery alone
still produces no playable content. Source and converted files remain private.

Dependencies are Node.js 22+, FFmpeg/ffprobe, FluidSynth and the external
VGMTrans exact-VAB build. `VNKIT_CHUNSOFT_VGMTRANS` selects that executable;
the maintainer default is the private Otogirisou tooling folder. Its source
VAB lengths and bounded ADPCM frames address these discs' instrument banks;
the unmodified exporter is not interchangeable for all resources. The audited source patch and [build instructions](ps1-media-tools.md) ship with
beta.5, with the upstream zlib notice. The executable is not bundled in the
ordinary code package or Windows installer. See [provenance](provenance.md).
External tool configuration is confined to each conversion's work directory.

Otogirisou uses the bundled source-font-bound Unicode correspondence in
`vnkit/adapters/otogirisou_charset.py`. Its 1,745 glyphs comprise 1,557 unique
cropped bitmap identities with Kamaitachi's native CP932 font and 188 source-bitmap
visual reviews. It has no official mapping or independent human proofread.
Only glyph-ID/codepoint facts, review methods and eight texture hashes ship;
original fonts and annotated review material remain private. Every texture
hash is checked before the map can be used. `VNKIT_OTOGIRISOU_FONT_REVIEW` is an
optional explicit override, retaining the same checks and legacy map format.
Kamaitachi's 2,026 mapped glyphs derive from its native CP932 lookup table.

## Media and measured limits

Kamaitachi recovers all 2,441 PAC members and decodes all 1,025 IKE members.
The reader has 1,962 original BGD/SDW images, 968 additional lossless index
textures and its original font atlas. Silhouettes combine index bytes by their
native maximum operation before applying two source-controlled colour ramps;
rendering uses approximate half blending. Four background layers retain the
native painter order. Music has 73 original sequence/bank conversions; sound
has 301 base cues, 30 paired parts, 33 source variants and 16 paired variants.
Native cue completion times drive waits. SPU envelopes, live sound modulation,
loop phase, palette animation, native transitions and several BIN effects are
approximate. Four low-numbered sound-modulation operands remain diagnosed and
omitted because their out-of-range native writes have not been verified.
Twenty remaining control sites in auxiliary scripts stay fail-closed; they are
not treated as harmless no-ops or evidence of complete bonus/menu support.

Otogirisou uses its own CDIMG, **not the bundled Machi demo's SNB/SBB/GSF**.
There are 45 initial script banks; bank 45 is auxiliary data loaded through
scene resources 205–209, not missing disc data. That auxiliary loading path
and remaining special scenes are not implemented by this reader. Ordinary
source scenes, 27 music banks, 131 logical effect cues and 47 native-dispatch
movies are converted. Movie 42 starts inside an incomplete previous frame;
the importer checks that exact prefix before admitting the next complete frame.
Native movie selectors 43–49 have no verified source stream association and
stay unavailable. They were not reached in the measured campaign. Two paired
texture scenes currently use the first image. Native visual effects, fades,
precise reveal timing, SPU envelopes and live audio changes are approximate.
Effect cue changes after sample-end waits remain a synthesis limit.

No original firmware or console has been used for audiovisual comparison.
These limits mean playable reading support, not complete native emulation.

## Evidence and local paths

The source-driven candidate campaign, using real asset catalogues with simulated
media/timing, covers:

| Reader | Runs | Text boundaries | Choices | Save restores | Result |
| --- | ---: | ---: | ---: | ---: | --- |
| Otogirisou | 20 sequential earned cycles | 38,001 | 1,038 | 565 | 20 ends, 7 distinct source end positions, no runtime errors |
| Kamaitachi | 20 sequential runs | 93,932 | 2,199 | 1,763 | 17 ends, 3 bounded runs, no runtime errors |

The Kamaitachi budget stops are not endings or complete route evidence.
Earlier experiments with placeholder assets or failed movie/edge-glyph handling
are retained separately and must not be added to these totals.
Chromium and Firefox each pass 100 actual text segments **for each game**,
selectable original-font text, original audio, inline choices, reload without
recounting, Next choice and phone portrait/landscape bounds. These browser runs
use fresh profiles and temporary servers/save banks. No live saves are tested.

Local final imports are `private/library/otogirisou-live` and
`private/library/kamaitachi-live`. Recovery, Unicode review, source routines,
route recipes and reports stay under their private game folders.
`private/chunsoft-ps1` contains conversion work, final browser reports and the
shared regression logs. The final CLI outputs are in `cli-v1/otogirisou` and
`cli-v2/kamaitachi`; earlier candidates are not the installed source of truth.
The initial corrected campaign reports are
`private/otogirisou/initial/candidate-campaign-v3.json` and
`private/kamaitachi/initial/candidate-campaign-v1.json`. Final CLI build replays
are `initial/cli-campaign-v1.json` in each game folder; these repeat the campaign
and must not be added as distinct story coverage. Both CLI imports and identical
cache resumes complete with the documented exit 3. Final Chromium browser
reports are `private/chunsoft-ps1/browser-{game}-final-v1`; Otogirisou explicitly
completes three movies and resumes text. Firefox final reports use
`browser-{game}-final-firefox-v1`, with a temporary server over installed assets.
The shared regression passes 211 Python cases and 21 Node test files. Memories
Off separately passes all 16 sound-test tracks and 150 actual reader segments.
Invalid-save probes reject changed glyphs, source signatures, palettes/gains and
sound references without changing the current state. The local code-package
audit includes the new modules and excludes all private data. Live HTTP health,
catalogue and resource reads confirm nine visible installed games; existing
content manifests are unchanged and no live saves were written.

```sh
node --test tests/sound-novel.test.mjs tests/chunsoft-presentation.test.mjs \
  tests/428-native.test.mjs tests/reader-audio-loop.test.mjs
python3 -m unittest discover -s tests -p 'test_chunsoft_ps1.py' -v
node scripts/validate-chunsoft-ps1.mjs private/library/otogirisou-live
node scripts/validate-chunsoft-ps1.mjs private/library/kamaitachi-live
sh scripts/browser-env.sh node tests/browser-chunsoft-ps1.mjs \
  private/library private/chunsoft-browser-new otogirisou-slps01645
```

Use the Firefox environment described in [testing](testing.md). The validator
hashes every catalogued asset and replays 150 opening text boundaries. It also
censuses all Kamaitachi script commands; it does not pretend that Otogirisou's
native kernel is an exhaustive static story/media-reference audit.
See [the historical investigation](chunsoft-ps1-investigation.md) for exact
format evidence. 428, Pia and YU-NO remain paused. Usage task:
`chunsoft-ps1-playable`. Beta.5 publishes code, tests and documentation only;
all game data and private review materials remain excluded.

## Word-lookup correction (2026-09-29)

The first glyph renderer made every character absolutely positioned. Yomitan's
DOM scanner inserted layout boundaries between them, so a lookup could see only
one character. Whole-page selection tests did not detect that integration bug.
`SoundNovelPage` now anchors a complete run and keeps its glyphs in inline flow,
using relative offsets to retain the source coordinates and original masks.
No import rebuild, VM/signature, save, source text or reading-history change.
Refresh the browser to load the updated renderer and stylesheet.

The regression uses the actual upstream Yomitan DOMTextScanner at revision
`67db60ddc2cbd7b5172d777c117e3201d7ddff0f`, loaded from private test tooling.
No extension code ships with the reader. It tests forward/backward text scanning,
word-sized selections and native caret hit testing in narration and choices.
Synthetic variable-width/bearing glyphs verify exact placement at desktop and
phone sizes, wrapped choices and partial reveal. Reapplying the former absolute
positioning deliberately reproduces the broken single-character boundaries.
Full dictionary popups and physical phone extension configurations remain
separate from scanner compatibility tests.

Use `VNKIT_YOMITAN_TEST_ROOT=private/tooling/yomitan-scan-regression-v1` with
`tests/browser-chunsoft-ps1.mjs` or `tests/browser-sound-novel.mjs`. Source hashes
and the GPL licence remain in that private folder. Final game reports are
`private/chunsoft-ps1/word-lookup-{game}-{chromium,firefox}-final`; synthetic
reports are `word-lookup-synthetic-chromium-v4` and
`word-lookup-synthetic-firefox-v3`. Each actual-game browser run also repeats
100 segments and save/resume without recounting. All browser profiles and save
servers are disposable. Usage row: `chunsoft-word-lookup`.
