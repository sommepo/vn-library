# Cartagra Japanese text

The exact PS2 font now has a visually reviewed Unicode map for all **2,446
glyphs used by the 100 recovered scripts**. The importer can use it to produce
selectable dialogue, speaker names, choices and ruby in the shared reader.

This is a transcription of the original glyph shapes. It is not a recovered
official encoding table, an exact reference-font match, or an independent human
proofread. Corrections may still be needed, particularly for rare lookalikes.
No sentences were translated, paraphrased, or supplied from another edition.
The original glyph IDs, text tokens and source offsets remain available.

## What was tried

- Targeted upstream searches found no exact Cartagra PS2 Unicode table.
- LunaTranslator's PS2 common table has a different order. Its GPL code/table
  was inspected privately and was not copied into the toolkit.
- Remember11's font is not an exact match or a compatible character table.
- IPAex Mincho and Noto Serif CJK were compared by glyph shape. Noto Serif Bold
  supplied better candidates, but neither reference is the source font.
- Two earlier Tesseract passes were inaccurate. Their output was used only as
  additional review suggestions, never accepted as dialogue automatically.
- Codex compared all 17 source/candidate contact sheets, then enlarged ambiguous
  glyphs and duplicate kanji candidates. This caught missing radicals, kana
  voicing marks, and confusion between similar punctuation and Latin glyphs.
  Similarity scores and agreement between tools were not approval criteria.

Japanese punctuation width is not recoverable as an original Unicode choice
from these custom IDs. The review uses documented conventional Japanese forms
for question/exclamation marks, parentheses and dashes, with separate half/full
spaces. Source IDs and native advance widths are preserved independently.

## Reproduce the work

The research tools are optional. Reading an import uses no OCR or reference
font. Use a separate virtual environment for matching/review:

```sh
python3 -m venv private/cartagra/font-tools-venv
private/cartagra/font-tools-venv/bin/python -m pip install \
  Pillow==12.1.1 numpy==2.4.3 fonttools==4.61.1
```

`scripts/cartagra-font-match.py` makes unverified shape candidates from a
source font and an encoded reference font. It uses one numeric worker and
bounded batches. `--kanji-only --encoding cp932` limits the candidate vocabulary;
this is a research setting, not evidence that the source encoding is CP932.

`scripts/cartagra-font-review-pack.py` combines suggestions into numbered sheets,
with the source bitmap on the left. Every approval starts false.
`scripts/cartagra-font-review-detail.py` enlarges unresolved/duplicate candidates.
`scripts/cartagra-font-finalize-review.py` applies an explicit completed review
ledger bound to the font and review-file hashes. It refuses unfinished reviews.
None of these tools can establish review accuracy by themselves.

Current private evidence is in `private/cartagra/font-research-v1`:

- `review-pack-v1`: all 17 sheets and initial unverified suggestions.
- `detail-v2` through `detail-v11`: enlarged ambiguity/correction checks.
- `review-edits.json`: checked sheets, corrections, source hashes and limits.
- `reviewed-map-v2.json`: current reviewed map; v1 is superseded.
- Font/upstream receipts and `research-leads.json`: provenance and outcomes.

Build a fresh import from the existing verified extraction/media caches:

```sh
python3 -m vnkit.adapters.cartagra_import \
  --work private/cartagra \
  --review private/cartagra/font-research-v1/reviewed-map-v2.json \
  --out private/cartagra/new-unicode-library/cartagra
node scripts/validate-cartagra.mjs private/cartagra/new-unicode-library/cartagra
VNKIT_UNICODE=1 sh scripts/browser-env.sh node tests/browser-cartagra.mjs \
  private/cartagra/new-unicode-library private/cartagra/new-unicode-browser
```

Omitting `--review` retains the bitmap preview. Candidate-format files, a wrong
font hash, or any missing used glyph stop the Unicode import. Scripts are checked
again before execution. Missing mappings report the source script and offset.
No replacement characters or guessed text are emitted.

## Reader and save behaviour

The adapter turns source speaker/ruby controls into the common text-run format.
The reader's existing DOM, dictionary interaction, copying, backlog, live page,
WebSocket publisher, typewriter, auto, skip and activity features then apply.
Ruby exports use the existing base/reading/both setting; normal counts include
the base spelling once. Font colour/size/timing controls still have the same
documented presentation approximations as the preview.

This changes presentation, not script execution. The save signature retains the
original execution identity. Loading an older bitmap save reconstructs its
current presentation from source and preserves its occurrence ID, state banks,
read flags and progress. It does not retroactively count bitmap reading as study
activity. Statistics remain independent of saves.

Static evidence: all **22,697 text streams**, **325 ruby groups** and **2,446
used glyphs** decode with no missing mapping. This is coverage, not a proof of
every transcription. `unicode-browser-v1/report.json` records 150 successive DOM
segments, one choice, ruby, names, original music/voice/movies, copy, selection,
backlog, external WebSocket delivery, reload deduplication, saves, pause and
fullscreen in a fresh Chromium profile. `unicode-upgrade-v1.json` compares 102
boundaries after loading real old-preview dialogue/pre-ending saves.

`unicode-campaign-v1/report.json` repeats all 16 source-earned ending flags with
Unicode enabled: 148,263 presentations, 21,039 distinct text sites, 107 choice
edges and 1,681 restore/replay comparisons, with no stops. Timing and media are
simulated. `unicode-ending-v1/report.json` checks an earned pre-ending checkpoint
through the browser ending/menu/unlock and a new playthrough. These repeat the
existing paths; they do not establish exhaustive optional-branch coverage.

The tested import is installed at `private/library/cartagra-preview`. The former
bitmap build is preserved outside the served library at
`private/cartagra/cartagra-preview-before-unicode-v1`; `unicode-install-v1.json`
records the move. The staging path used by the tests is historical after install.
No saves were edited, no service restart was needed, and local/Tailscale content
requests both return Unicode mode. The other four games remain in the catalogue.

Firefox, physical devices, dictionary extensions and an independent Japanese
proofread still need checking for this import. The remaining macro instruction,
auxiliary menus and native presentation limits in [the runtime guide](cartagra-runtime.md)
are unchanged. Add game and Windows support the exact disc from v0.1.0-beta.3.

The distributable `vnkit/adapters/cartagra_charset.py` contains only the reviewed
glyph-ID/Unicode-codepoint correspondences and expected font hash. These are
original VN Library transcription data, under MIT. The importer checks the
owner-supplied font and coverage of every used glyph before converting media.
It needs no OCR tools or reference fonts. Original font bytes, scripts, review
images, annotated review files and reports stay private. The table matches the
previously tested private mapping; this is packaging, not a new transcription.
