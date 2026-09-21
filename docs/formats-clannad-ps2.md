> Current basic-command/native evidence is in [basic execution](clannad-basic-execution.md).
> Earlier descriptions of MVPL, SEB, named conditions and quoted NCK as unsupported
> are superseded there. Detailed presentation remains incomplete.

# CLANNAD SLPM-66302 format and adapter notes

These notes apply only to the tested Japanese PS2 executable SHA-256
`1fee7a7a08db470b811e287103038f3f158a4d59c36246449c176ecc208c073a`.
The importer rejects another executable before using fixed native addresses.
Do not infer general HuneX, PSP, PC RealLive or other CLANNAD edition support.

## Reusable components

`vnkit/source.py` supplies bounded ISO/directory reads. `disc.py` supplies safe
no-clobber extraction. `adapters/hunex.py` contains MZX and nested MRG primitives;
`png.py` writes original-size PNG without resampling. `clannad_ps2.py` handles
this edition's top-level archives. `clannad_script.py`, `clannad_native.py`,
`clannad_media.py`, `clannad_audio.py`, `clannad_movie.py` and `clannad_import.py`
separate parsing, native data, media and packaging. The browser VM/motion/census
live in `web/adapters/clannad-*.mjs`; the generic reader has no game filenames.

The parser writes version-1 `vnkit.clannad-script` JSON retaining raw source
SHA-256, CP932 encoding, instruction byte offsets, original argument strings,
labels and expression ASTs. Stable IDs are `SEENnnnn.MZX:xxxxxxxx`; combined
logical text preserves each component ID. Content is `vnkit.content` v1 with
`runtime.id = clannad-ps2-hunex`, v1, lazy source-program URLs and native tables.
Save format remains `vnkit.save` v1 with a runtime discriminator and game/source
signature, full VM state, pending presentation and media positions.

## Archive details

ALLPAC.HED records are `<IHH>`: packed sector offset, allocated sector count,
low 16 bits of exact length. Sector = `(word & 0xffff) | ((word >> 28) << 16)`;
bits 16–27 must be zero. Files start at sector×2048. Exact size combines allocated
upper bits and the low length, subtracting 65536 if above the allocation.
NAM records are 30 ASCII bytes and CRLF. Keep archive indices because names repeat.
The first packed-sector wrap is index 1058; treating the word as a plain offset
corrupts later resources. Correct extraction is `resources-v2` (adapter 0.1.1).

Nested `mrgd00` has a LE16 section count and 8-byte extent records; its data base
is after the table. See `hunex.mrg_sections` for checked sector/byte extents and
exact-size reconstruction. Untested high offset nibble variants fail explicitly.

MZX0 is followed by a LE32 decoded length. Commands operate on 16-bit words:
RLE, overlapping backreference, 64-word literal ring, or literals. The previous
word resets at 4096-word boundaries as evidenced by the native decoder. Images
and voices use non-inverted bytes; scripts use inversion. Final whole-run padding
can exceed the declared output, which is bounded and truncated to that length.

## Images

MZP section 0 stores `<8H>` width, height, tile dimensions, grid dimensions,
codec and flags, followed by palette and tile modes. Modes 1/2 draw; 0 is blank.
PS2 indexed CLUT swaps bits 3/4; source alpha 0–128 maps to PNG 0–255.
Nested two-image MRG holds colour and a separate mask; larger atlases need layout.

24-bit pixels are **not interleaved RGB**. They use two bytes of high bits per
pixel and a separate one-byte residual plane. Native transform at 0x112ae8:

```
R = (high & 248) | (fine >> 5)
G = ((high << 5) & 255) | ((low & 224) >> 3) | ((fine & 24) >> 3)
B = ((low << 3) & 255) | (fine & 7)
```

Codec 8 stores both planes in one tile. Codec 9 pairs `.MZP` high bits with the
following same-stem `.MZU`; require the pair to preserve full colour. MZU bottom
tiles contain extra unused padding. Native tile reads use the first tile-sized
residual plane, not that padding. Earlier media-v1/v2 probes omitted 518 such
backgrounds; the accepted set is **media-v3**. MZD endings remain separate work.

## Audio/video

VOICE HED words pack offset as above and allocation in bits16–27. NAM records
are eight bytes. Global VPLY hex IDs below 20000 use VOICE; others use VOICE2
index `id−20000` (native 0x11d338). Seven wrapper bytes precede MZX data, which
decodes to CRI AHX. BGM.AFS and VSE.AFS contain standard AFS extent tables/ADX.

Pinned vgmstream r2117 decodes the original AHX/ADX to PCM16; FFmpeg writes FLAC
without resampling. Retain source sample rate, channels, sample count and loop
markers. `numberOfSamples`, not vgmstream's default loop-expanded `playSamples`,
describes the one-pass output. VGMTrans/FluidSynth are unnecessary for this game.

OPENING.PSS is MPEG-2 640×448, 30fps, plus Sony SShd codec-1 stereo PCM16 at
48kHz/512-byte channel interleave. Matching initial PTS is 3789/90000. The shared
strict PSS converter originally named `pia_movie` can decode this exact format;
the CLANNAD wrapper verifies it, with no old-game assets or mappings. Output is
lossless VP9/FLAC MP4; decoded-video and PCM hashes are verified. Source MVPL
integration is a separate, still-unresolved runtime task.

## Native sources

Use the runnable read-only evidence utility; it never executes the MIPS binary:

```sh
python3 scripts/clannad-evidence.py private/clannad/disc/SLPM_663.02 --address 0x14c080 --bytes 0x220
python3 scripts/clannad-evidence.py private/clannad/disc/SLPM_663.02 --xref 0x377744
```

The MIPS listing is a subset and marks unknown words; do not treat it as a full
decompiler. Entry pointer 0x378158, sprite table 0x1c6ad8/names 0x203b70,
background names 0x1ffa00, music names 0x1ff330, event table 0x1f9060. Every
84-byte event entry contains resources and four callback pointers. Event 23/24
use SSHREN00.BIN through 0x1392c0/0x12c500; retain the terminal zero-duration row.
SCR_ADR.MRG independently provides 203 label tables. All 3,320 stored offsets
match parsed labels, including the eight inactive/debug programs.

Unknown command arguments, unresolved aliases, unsupported atlases and native
events are separate diagnostics. Never turn them into empty strings or inferred
story order. See [runtime evidence](clannad-runtime.md) for the active stop.

## Additional native presentation evidence

Event 9 callbacks are 0x13b3e8/0x13b420/0x13b478/0x13b568. Init clears actor
zero through 0x14f790. Its original EF_CGSH23B colour/mask image is 640×480;
rotation uses bottom-right anchoring (anchor tables 0x1c17f8/0x1c1828), hold 30
frames, −500 angle units per tick, float radians/unit at 0x3b1c84, and retirement
counter 66. `clannad-motion.mjs` preserves these values; original GS blending and
pixel rounding have not been compared with a running console.

Event 75 callbacks are 0x143ea8/0x143f68/0x144130/0x144298. Fourteen variants
come from 0x1fef98 (backgrounds), 0x1fefd0 (title strips) and 0x1ff008 (final
white/black flag). The crop at 0x1ff040 is 270×30; draw position is (370,427).
The update state machine has waits 60/120/90, original float32 increments at
0x3c5074/78, and strip counter 0–88, advancing its 45 rows every two frames.
It lasts 470 updates at 60 Hz. The final scene uses the original SIRO/KURO lookup
and 0x14f748 background setter. `clannad-eyecatch.mjs` owns the presentation.
The reader hides its prior textbox and uses the complete 640×480 interlude
frame, returning to the ordinary 640×448 artwork plane afterward. This preserves
the title strip without cropping; original GS overscan/compositing and complete
source window styling have not been compared with a running console.

MNWL writes `^` into the native message buffer at 0x14c798. The renderer's
0x1205fc branch resets horizontal position and advances its line, rather than
printing that marker. The adapter retains a source-located newline in logical
text. Source-dispatched no-ops are explicit: Q has no handler in the 0x3c5704
jump table; G at 0x14c310 accepts only GOTO, ignoring GCLS/GMSA. P likewise has
no handler. This edition evidence must not be generalized to other HuneX games.

## Message windows, voice cues and sound names

WCOF's dispatcher 0x14d6fc branches to 0x14d410 and calls 0x12c1e8(0), writing
0 to window-enable 0x1cfe14. The alpha update at 0x12e460 drives 0x1cfe00 toward
zero; text update 0x14f068 calls the same setter with 1. The adapter saves the
visibility target and reopens it for new text. Original alpha envelopes are an
explicit instantaneous degradation; this command is not a script jump/no-op.

WTVT at 0x14d820 stores its integer in 0x3775c4. Update 0x14e6a8 checks voice
activity and 0x14ebec compares 0x10b4f0's elapsed-voice result with that target.
That function reports the tick accumulator at 0x501b98 multiplied by 17; update
0x10b3ec advances it by the native frame delta. The adapter normalizes the cue
as `ceil(sourceValue/17)*1000/60` milliseconds. This is source clock emulation
using the browser's audio position; original console drift/start latency remains
unverified. It appends source text without resetting the voice and leaves the
following WTKY as a manual boundary. A blocked/paused browser voice retains
manual reading; panels and hidden tabs pause these timed continuations.

SE_NAM.MRG contains four nested sections of 32-byte records. Native 0x122008
normalizes case and searches section 3 before section 2. Section 3 has 23 short
names with native IDs 10000+index; section 2 has 54 VSE names with index IDs.
Duplicate names must preserve this priority. SEPL/SELP (0x14d074/0x14d1c0) select
channel `argument1 & 1`, default zero, and optional fade duration. SEPL sets repeat
false, SELP true through 0x10c410. The play function 0x10bff8 selects ACX for IDs
>=10000 and the stream path for lower IDs. SESP calls 0x10c4b0; SEFD 0x10c588.

SE.ACX starts with two big-endian words (zero, count), followed by count `(offset,
length)` big-endian word pairs. All 23 bounded entries are original CRI ADX audio.
`clannad_effects.py` validates names/counts/extent nonoverlap and uses the same
pinned vgmstream/FLAC converter in a separate `effects-v1` cache; it does not
invalidate the large voice cache. Source-name SHA-256 and addresses are in native
metadata, derivatives in the import manifest. UI MSB/MSH audio is separate.

## Newly recovered concurrent presentation and input

Event 30 is enabled. Its callbacks are 0x13fa90/0x13fad0/0x13fb70/0x13fb78.
SSHREN00.BIN rows 155–168 total 280 ms (17 native ticks). The updater sends X
through 0x12c500, removes actor zero and releases the script at completion.
The already-buffered source text/voice is presented during this motion, with a
nested text presentation on the wait. The following WTKY retains that display
without emitting it again, then clears the consumed buffer on advancement.

MSNL at 0x14c858 inserts a primary-buffer newline (0x14c8b8), applies original
name substitution (0x14c8ec → 0x147178) and creates another native font slot
(0x120228). Slots 1/2 and palette selectors 0–19 are accepted. Both text sources
remain on the same DOM page; exact font-slot placement/colours are explicitly
normalized. Optional presentation `dialogue` parts preserve each speaker and
sentence separately for speaker-configurable exports and character counting.
They are checked against source on restore. They do not create extra occurrences.

NCK0/NCK1 dispatch at 0x14cd10/0x14ccb4 to 0x147488; NCK2 at 0x14cea8 ANDs both
comparisons. NSC0/NSC1 use substring helper 0x1474c8. The adapter handles the
original default names, literal comparison strings and numeric F destinations.
Custom name entry, quoted/F-expression parameter forms and NCK3 remain closed.
This avoids assuming JavaScript character length reproduces native CP932 byte
truncation for unimplemented custom inputs.

Event 10 callbacks are 0x13b580/0x13b5d0/0x13b880/0x13ba50. Recovery verifies the
callback table and reads constants/resources from the fingerprinted ELF:

- Initial lowering: actor-zero Y advances by integer `180*frame/27`, scaled by
  448/480, then releases the script while retaining the lowered actor.
- EVTN(0,1), then EVWT: clear actor zero, keep EF_CGSH23B at source (320,660).
- EVTN(0,2), then EVWT: rotate the source image around (320,680), drawn at
  (320,860). Counter period is 49 frames; angle step 1365 uses the original
  radians/unit float. The SWING effect fires at frame 34.
- This second EVWT has new buffered dialogue/voice. Present it during the spin;
  discarding it when the later CLR arrives would lose an original line.
- Player input enters retirement: continue until frame 13–35, release the
  interpreter, then EVTN(0,3)/CLR continue the source. Auto/explicit Next choice
  acknowledge this non-choice animation wait; they do not select a story option.

`clannad-swing.mjs` keeps its phase clock in saved execution state. Panels and
hidden pages pause it. Disposing the renderer for an old phase must not overwrite
the new phase's clock. Original PS2 pixel rounding/GS compositing comparison is
unverified; the implementation is based on the callback and draw-parameter trace.

The next first-option stop is event 41 at `SEEN3419.MZX:00000c6a`. Callbacks are
0x140c78/0x140c80/0x140d88/0x140d90. A 10-frame X table lies at 0x3c4950;
retirement depends on 0x12ba88 (global 0x1c5844) or a signal. Its lifetime/interaction
with the subsequent event 44 has not been established. Do not mistake 0x12ba88
for a voice-position function or enable just the visual oscillation.
