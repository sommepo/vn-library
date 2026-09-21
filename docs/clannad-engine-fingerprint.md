# Known fingerprint: CLANNAD PS2 HuneX

Recorded from the working implementation and disc evidence, 2026-09-21.
Compare new PS2 VNs against this baseline **before bespoke implementation**,
particularly the user's candidates AIR, planetarian and Tomoyo After. Their
compatibility is **unknown**: no second disc has been tested here. The proposed
NEC Interchannel / Interchannel connection is a research lead, not engine proof.
Do not reorganize or redo CLANNAD to perform this comparison.

## Identity and confidence

Japanese SLPM-66302 v1.01, ISO9660 with a UDF bridge, 2048-byte sectors.
ELF SHA-256: `1fee7a7a08db470b811e287103038f3f158a4d59c36246449c176ecc208c073a`.
Disc SHA-256: `35077758488971fc919b2afdadd4e9ebaad48ac67443cf281bbdbfed9bae81e9`.
The executable contains HuneX Consumer 3D System for PlayStation2 identification
and CLANNAD H3D assertion paths. Structural and executable evidence supports this
identification; it is not inferred from Key branding or the PC RealLive release.

CLANNAD is our working reference implementation for broad basic execution.
All 203 discovered scripts (308,727 instructions) have basic command coverage.
That makes its parsers and interpreter valuable evidence, without proving other
games compatible. Preserve the measured limits in [runtime](clannad-runtime.md)
and [basic execution](clannad-basic-execution.md): animation is a major gap, but
81 atlas/format entries, some timing/audio/extras and full-route/PS2 comparisons
also remain incomplete or unverified. Do not turn user-reported playability into
an assertion that every route or native routine has been verified.

## Observed technical signature

| Layer | Disc/native evidence and reusable implementation |
| --- | --- |
| Main archive | `ALLPAC.HED/NAM/MRG`, 4,729 members. HED `<IHH>` records: sector `(word & 0xffff) \| ((word >> 28) << 16)`, reserved bits 16–27 zero, allocation in sectors, exact-length low word. NAM has 30 ASCII bytes plus CRLF; names may repeat. First sector wrap at member 1058. `vnkit/adapters/clannad_ps2.py` |
| Nested containers | `mrgd00`, LE16 section count, eight-byte `<HHHH>` sector/offset/allocation/length records relative to the table end. Bounds and exact-size reconstruction in `vnkit/adapters/hunex.py:mrg_sections` |
| Compression | `MZX0` + LE32 decoded size; 16-bit word RLE, overlapping backreferences, 64-word literal ring and literal runs. Previous word resets every 4096 words; bounded final-run padding. Script literals inverted; images/voice non-inverted. `hunex.py:decompress_mzx`, based on licensed mangetsu plus native corrections |
| Script structure | `SEENnnnn.MZX` decompresses to strict CP932 command text, not a presumed binary opcode stream. Semicolon-separated underscore commands: four-character mnemonics, tagged ZM text and ZY/ZZ labels. Raw offsets/arguments retained by `clannad_script.py`; `SCR_ADR.MRG` supplies 203 native label tables, all 3,320 offsets checked |
| Control/state | IF__/EIF_, CALC with F/G/Z expressions, SEL/SEB choices, GOTO/IFJP, JUMP, FCAL/FRET. Four-frame call stack; F/Z reset on new game, F[500]=1, G persistent across playthroughs. Native SEB tables and named conditions are edition-specific. `web/adapters/clannad-engine.mjs`, `clannad-basic-events.mjs` and `clannad_expression.py`; compare semantics, not only command spelling |
| Graphics | MZP section-zero `<8H>` width/height/tile/grid/codec/flags, palettes/tile modes. PS2 CLUT swaps bits 3/4; alpha 0–128. Two-image MRG colour/mask pairs. Codec 8 packs split 24-bit planes in one tile; codec 9 pairs same-stem MZP high bits with MZU residuals. `clannad_media.py`; preserve native size and fractional body/face composition |
| Audio/voice | BGM.AFS/VSE.AFS contain AFS extents and CRI ADX. VOICE/VOICE2 HED/NAM/MRG uses packed offsets, eight-byte names, seven-byte wrappers before non-inverted MZX → CRI AHX. VPLY IDs below 20000 select VOICE; others use VOICE2 index minus 20000. SE.ACX is big-endian zero/count plus offset/length pairs containing ADX. `clannad_audio.py`, `clannad_effects.py` |
| Movie | OPENING.PSS: MPEG-2 640×448 at 30fps and Sony SShd codec-1 stereo PCM16, 48kHz, 512-byte channel interleave. Shared bounded PSS converter; movie codec compatibility alone does not establish VM compatibility |
| Names/layout | ALLPAC triples, SEEN scripts, SCR_ADR.MRG, SE_NAM.MRG, paired MZP/MZU and colour/mask objects, VOICE/VOICE2, BGM/VSE, SSHREN00.BIN. Treat these as corroboration; resource indices and native aliases matter more than filenames alone |
| Text rendering | CP932 Japanese, native name substitution, buffered pages and voice cues. MNWL's `^` is a newline, MSNL creates additional font slots. Source renderer branch 0x1205fc and font-slot routine 0x120228; browser normalizes font placement/colours to selectable DOM. No source ruby syntax established. Do not mistake DOM typography for a decoded native font implementation |

See [format notes](formats-clannad-ps2.md) for formulas, native addresses and
reconstruction details. Older stops in that document are superseded by basic
execution; they are historical evidence, not today's runtime boundary.

## ELF loading and dispatch comparison anchors

These are virtual addresses in the fingerprinted ELF, not portable offsets or
addresses to apply to another executable:

- 0x1107a8 validates the packed archive sector calculation; compare arithmetic,
  argument flow and table consumers in another binary.
- Entry pointer 0x378158 selects `seen0414.mzx`, which calls SEEN6900/Z00.
  Startup order is source-driven, never filename order.
- Script scanner 0x14a96c and dispatch table 0x3c5704; FCAL/FRET at
  0x14c14c/0x14c0ac; initialization 0x147ac0..147b48.
- Native resource tables: sprite table 0x1c6ad8 / names 0x203b70,
  backgrounds 0x1ffa00, music 0x1ff330, event table 0x1f9060.
- VPLY loader selection 0x11d338; sound-name lookup 0x122008 searches
  SE_NAM sections 3 then 2; 0x10bff8 selects ACX vs stream by native ID.
- Pixel reconstruction 0x112ae8; message/window/voice handlers are documented
  in the format notes. Shared CRI decoding demonstrates middleware reuse only.

Use `scripts/clannad-evidence.py` for read-only listings/xrefs on this ELF.
Compare candidate routines by control flow, constants, table layout and callers,
allowing relocation/compiler differences. Do not apply CLANNAD's fixed native
addresses or hash-gated expression probe to another game.

## Animation fingerprint and research gate

There is not yet evidence for one universal animation file format. Current
presentation combines:

- Script transitions, placement, alpha/palette/shake and waits (including FADZ,
  VIOL/VIO1, MCOL, BXDK/BXNG/BXFL and EVTN/EVTS/EVWT).
- SSHREN00.BIN motion rows consumed through 0x1392c0 / 0x12c500, including
  events 23/24/30. Retain terminal zero-duration rows.
- Native event table: 84-byte entries holding resource data and four callback
  pointers. Precise events 9/10/75 use recovered rotation, anchor, timing and
  title-strip tables; other callbacks are simplified explicitly.
- MZD credits/endings and native montages, including event 74's 241-row table
  at 0x1fca10 and dispatcher 0x1387f8. MZD remains incompletely decoded; do not
  claim it shares semantics with MZX merely because names resemble each other.

Existing implementations: `web/adapters/clannad-motion.mjs`,
`clannad-swing.mjs`, `clannad-eyecatch.mjs`, `clannad-basic-events.mjs`, plus
native recovery in `vnkit/adapters/clannad_native.py`. Preserve wait/input,
concurrent dialogue, state signals and saved clocks when extending visuals.

Initial upstream search on 2026-09-21 found the
[PS-HuneX_Tools](https://github.com/RikuNoctis/PS-HuneX_Tools) description of
MRG/NAM/HED script tooling, but did **not establish a compatible animation
interpreter**. This is a bounded search result, not proof none exists. Existing
[provenance](provenance.md#clannad--hunex-additions-2026-09-17) records
[mangetsu](https://github.com/rschlaikjer/mangetsu) and
[PS2 Visual Novel Tool](https://github.com/punk7890/PS2-Visual-Novel-Tool), and
licence limits on other HuneX tools. No new upstream code was copied.

Before further animation implementation, inspect relevant upstream source/specs
for these exact structures and compare any newly supplied disc's commands,
motion records, atlas layouts and native consumers. Record negative results too.
If two discs demonstrate the same system, put the proven decoder/scheduler in a
shared engine module with per-edition data; keep bespoke callback behavior in
its adapter. If only related, implement an explicit variant. Do not delay all
CLANNAD work indefinitely waiting for another disc, or generalize an untested
native event ID across titles.

## Required comparison report for the next ISO

Record each result as confirmed / probable / unknown / incompatible, with
source offsets, parser revision, commands, corpus counts and failures:

1. Do main/nested archive structures match? Does the existing bounded parser
   extract valid members unchanged, including high offsets and duplicate names?
2. Does the MZX decoder work unchanged, including inversion, reset boundaries,
   final padding and declared sizes?
3. Do decoded script headers/grammar, labels, text and argument forms agree?
4. Which opcodes transfer unchanged, which differ, and which are unknown?
   Compare branches, arithmetic, variable scope, calls, waits and native IDs.
5. Do original graphics/audio decode identically? Validate paired planes, masks,
   palette/alpha, voice mapping and timing, not merely a successful file open.
6. Are file-loading/dispatch routines recognisably shared? Record structural
   evidence rather than matching absolute addresses or vendor strings alone.
7. Are animation commands, tables and callbacks shared, related or unrelated?
8. Conclude: compatible engine with edition data, related engine variant, or
   unrelated/insufficient evidence. State the demonstrated reuse per layer.

A parser passing real structures from both discs is stronger evidence than an
online attribution. Successful extraction still does not prove story execution.
Use the existing modules directly in private bounded probes; don't weaken their
validation or force the CLANNAD importer past its executable fingerprint gate.
Every subsequently supported game should gain a similar evidence-backed
fingerprint and links from the adapter guide, improving recognition cumulatively.
