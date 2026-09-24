# Ever17 PS2: first comparison with Remember11 and Never7

**Historical investigation.** The subsequent [playable runtime](ever17-runtime.md)
now resolves the story parser stops and implements all five main routes. Counts
and "not playable" statements below describe the initial comparison, not current
support. Keep this report as evidence of which tools worked unchanged and which
needed an explicit edition variant.

Investigated 2026-09-23. **Ever17 is a related revision of the Remember11
PS2 engine.** This is supported by actual parser results and executable
structures, rather than the KID publisher name. Reusing that implementation is
the preferred next step. It is not a drop-in import and is not playable yet.

## Exact input

The supplied disc is Japanese **Ever17 -the out of infinity- Premium Edition**,
**SLPM-65421 v1.01**, NTSC. `SYSTEM.CNF` names `SLPM_654.21`; the image has
ISO9660 with UDF bridge descriptors, 2,048-byte sectors and 42 files.

| Fingerprint | Value |
| --- | --- |
| ISO size | 2,925,920,256 bytes |
| ISO SHA-256 | `45b7e194a205e761f1550dc5b728811f82dc91d72af95a14f5ab085e08c1ac4c` |
| Executable SHA-256 | `7bd43ef8ba43090eee7f54ef83ffdd5779834ef7b7f825c8e5a33663dc37e17b` |
| Executable | ELF32 little-endian MIPS, 1,287,912 bytes; stripped symbol table |

The filename identifies Premium Edition; the serial is also listed under that
edition in the [PCSX2 title record](https://wiki.pcsx2.net/Ever_17%3A_The_Out_of_Infinity).
The probe admits only the executable above. No disc program was executed, no
substitute resource was downloaded, and the original ISO was not modified.

## What actually transfers

| Layer | Result from this disc | Conclusion |
| --- | --- | --- |
| Disc | Existing bounded `Source`/ISO9660 reader succeeds | Confirmed reuse |
| Archives | All eight AFS tables, 17,556 members, pass the existing strict reader, including filename sizes | Confirmed reuse; no Never7 stale-size option needed |
| Compression | All 98 MAC members, INIT and 2,850 compressed non-MAC resources pass the existing KID LZSS decoder | Confirmed reuse; no codec change |
| Scene images | Existing Remember11 tile decoder reads 1,348 of 1,383 BIP images | Confirmed reuse for these entries; 35 variants still unsupported |
| Thumbnails | 1,317 of 1,383 scene T2P entries decode with the existing TIM2 helper | 66 unsupported pixel layouts remain explicit |
| Music | All 54 compressed Sony banks split and parse using the existing layout/sequence rules; one bank rendered through the existing converter | Confirmed tool reuse; these entries are not necessarily 54 distinct songs |
| Voice/effects | 14,510 entries have ADX headers; one `.ADX` entry is actually RIFF/WAVE. One original voice and effect convert successfully | Shared tools confirmed on samples; full audio decode/association not tested |
| Movies | Six PSS files; the small SDR movie demuxes and decodes with existing FFmpeg tools | Sample reuse confirmed; all-movie conversion not tested |
| Script VM | Same named command directory, common handlers, CP932 text and MAC instruction structures | Confirmed related engine; edition differences prevent unchanged execution |
| Never7 | No MWo3/oscr overlay layout; its CPS/OGDT decoder rejects the two tested image samples | Its script/image VM is not the right starting point |
| CLANNAD | No HED/MRG/MZX/SEEN structures | No HuneX VM compatibility evidence |

AFS counts: MAC 98, BG 540, CHR 1,724, EV 502, BGM 54, SE 147,
VOICE 14,364, ETC 127. Resource identity remains archive plus ordinal; filenames
are not story order. INIT expands to 30,067 bytes.
The ETC archive also contains 97 SPC entries not interpreted by this comparison.
Their consumers and role must be checked during native presentation work.

Most decoded scene images are 640×480. Larger native sheets also occur; they
must not be stretched into backgrounds by assumption. The 35 rejected scene
images have an additional directory variant (sample section count six, compared
with the supported five/ten). The sampled files hold two tile directories.
Their native selection/composition needs tracing before adding decoder support.
These are present but undecoded resources, not missing disc content.

## Script and native evidence

The executable's command directory is at **0x1e1338**, with 130 twelve-byte rows:
handler pointer, ASCII command-name pointer, reserved zero. Remember11 uses the
same row structure at 0x1e1c48. Ever17 has 129 non-null handlers. Of these,
128 map by name to Remember11 after normalizing `grap_`/`graph_` spelling.
This does not mean 128 fully verified runtime operations.

Ever17's **0x4c `save_title`** has no direct Remember11 counterpart. Subsequent
command IDs shift by one; the null slot moves from Remember11's 0x5f to 0x60.
For example, Ever17 0x74 means `msg_disp2`, while Remember11 0x74 means
`sel_disp2`. A naive import can therefore produce plausible output while
misinterpreting choices. Never rely on a parser's absence of errors alone.

Native addresses useful for the next step:

| Operation | Ever17 | Remember11 |
| --- | --- | --- |
| Conditional handler | `0x11b9a0` | `0x122250` |
| Variable calculation | `0x11c158` | `0x1227b0` |
| Dialogue | `0x11d4b0` | `0x123840` |
| Choices | `0x11dba8` | `0x124498` |
| Graphics view | `0x121ec8` | `0x125b40` |
| Graphics move | `0x11cb88` | `0x124aa8` |

The two listed graphics handlers have byte-identical first 64 bytes; the
condition handler has an identical initial instruction sequence too. Operand
read and command-dispatch structures agree. Together with matching resource
decoders and bytecode, this is strong evidence of a shared implementation
family. It is not proof of identical native state or every branch condition.

`save_title` reads a u16 at PC+2, writes the native title field, calls 0x11b3f0,
and advances four bytes. The research parser preserves this as an explicit
operation with `runtimeUnsupported`; it does not replace it with a no-op.
Six sound commands read their parameter from byte 1 and advance two bytes,
where the Remember11 parser expects four. Other measured width differences
remain recorded for review; automatic PC-step pattern matching is evidence,
not a substitute for tracing the handler's full control flow.

Text follows strict CP932 decoding through source operand pointers. No text was
translated, reconstructed or published to reading activity. Ruby, custom glyphs,
speaker resolution and complete inline-format semantics remain unverified.

## Current parsing boundary

Three comparisons are retained:

1. **Unchanged Remember11 decoder:** 38 of 98 MAC members report errors. The
   others are not proven compatible; opcode mismatches can terminate early.
2. **Name-based opcode map only:** 76 members report errors, mainly where
   `save_title` now stops explicitly rather than being misread as another command.
3. **Map plus measured save-title/compact-sound layouts:** 82 members parse
   without reported errors. The remaining 16 have 23 exact failure sites.
   This visits 87,267 instruction locations, including failed locations, and
   recovers 40,700 distinct per-member text pointers in the trial.

The remaining errors include unestablished lengths, invalid condition forms,
overlapping targets and entries that may be tables rather than scripts
(`SHORTCUT01`, `SHORTCUT02`, `APPEND`). Classify them from native consumers;
do not simply remove them from validation. Some errors could reflect inherited
control-flow assumptions rather than a new opcode. No route, ending, flag gate,
save/restore or browser execution test has been performed for Ever17.

## Reproduce the comparison

Python 3.11+ suffices for the corpus probe. Both inputs are the owner's discs;
the reference argument is a research dependency, not a proposed requirement
that future Ever17 users must own Remember11.

```sh
python3 -m vnkit inspect 'Ever 17 - The Out of Infinity - Premium Edition (Japan).iso' --fingerprint

python3 scripts/investigate-ever17.py \
  'Ever 17 - The Out of Infinity - Premium Edition (Japan).iso' \
  --reference 'Remember11 - The Age of Infinity (Japan).iso' \
  --out private/ever17/new-comparison --images

# Faster parser iteration, explicitly omitting media validation:
python3 scripts/investigate-ever17.py /path/to/Ever17.iso \
  --reference /path/to/Remember11.iso \
  --out private/ever17/new-script-comparison --scripts-only

# Existing pinned media tools; no Wine or game executable invocation:
sh scripts/audio-tools-env.sh python3 scripts/probe-ever17-media.py \
  /path/to/Ever17.iso --out private/ever17/new-media-probe \
  --vgmtrans private/tooling/remember11-vgmtrans-shell

python3 -m unittest discover -s tests -p 'test_ever17.py' -v
```

The main comparison intentionally exits **3**: research is incomplete and no
`content.json` is produced. Invalid input/tool failures exit **2**. Media sample
conversion exits zero on success but does not create a game import. Existing
matching files resume; different output requires a fresh directory.

The complete resource audit is in private `comparison-v1`; the updated script
comparison is `script-comparison-v2`. Do not add their overlapping counts.
`media-probe-v1` tests four audio/movie samples; `media-probe-v2` adds background
and portrait conversion. No private evidence or content belongs in public builds.
The latter resumed after correcting a sample filename in the probe. The generated
background and portrait were visually inspected; native placement/scaling is
still unverified. FluidSynth emitted SDL/GLib warnings but produced the checked
output file; this is not a claim of original SPU2 synthesis fidelity.

The complete Python suite passed **122 tests** with temporary loopback listeners
permitted. The first sandboxed run failed on socket permissions; it is not the
passing run. Remember11/Never7 Node VM suites passed. The three new synthetic
tests cover opcode/source preservation, title/compact layouts and fail-closed
unknown/truncated instructions. A separate private regression reparsed all
**167 installed Remember11 scripts** with the default decoder and found identical
JSON output. Run it with:

```sh
python3 tests/remember11-parser-regression.py /path/to/Remember11.iso \
  private/library/remember11-live private/ever17/new-reference-regression
```

These checks are parser/media evidence. No Ever17 browser or route test is claimed.

## Approach for playable support

Extend the measured MAC engine as an Ever17 edition variant, retaining shared
archive, compression, image/audio tools and the existing reader. The optional
opcode mapping in `remember11_script.Script` preserves the default Remember11
output; `ever17_script.py` is explicitly a research decoder. A separate Ever17
runtime entry, content identity and state signature are still required.

Next resolve remaining parse sites and native entry/table selection, then trace
variables, persistent progress, names, media IDs, choices and ending gates.
After that, implement the variant in the shared reader and test real successive
dialogue, both branches, save restoration and earned route unlocks. Do not copy
Remember11's game-specific flags or declare an entire KID engine supported.

Existing CLANNAD, Remember11 and Never7 imports and saves are unchanged. YU-NO
and Pia remain paused. No release or live-library installation was made.

For upstream leads and licence decisions, see [provenance](provenance.md#ever17-ps2-comparison-2026-09-23).
