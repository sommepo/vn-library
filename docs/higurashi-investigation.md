# Higurashi Matsuri: Kakera Asobi — PS2 investigation

This document records the initial recovery investigation. A source-driven reader
has since been implemented and installed; see [current runtime and test evidence](higurashi-runtime.md).
The format observations below remain useful; the later runtime resolves the
previously unfinished execution, text and composition work.

## Identity and input

| Item | Evidence |
| --- | --- |
| Game | ひぐらしのなく頃に祭 カケラ遊び / Higurashi Matsuri: Kakera Asobi |
| Platform and edition | Japanese PS2 standalone edition, SLPM-66913 v1.01; not the separate Append disc |
| Confidence | High: boot serial/version, exact executable fingerprint and native resource loader |
| Input size | 4,690,444,288 bytes |
| ISO SHA-256 | `0d7ff9509035cce07a9b06c8d2c813cadcf2c07adb97e4fa9da3041851f8f859` |
| ELF SHA-256 | `160fd33e89aec97bda32ad44cc28757f3f97caa2e4ad8fe8863a9ea105a5f750` |
| Filesystem | ISO9660 with a UDF bridge; volume `HGRSMTRR`, system `PLAYSTATION` |
| Boot | `cdrom0:\SLPM_669.13;1`, `VER = 1.01`, NTSC |

The normal ISO directory lists only `SYSTEM.CNF`, `SLPM_669.13` and
`IOPRP310.IMG`. Most of the disc is a separate raw-sector resource container.
Extracting only the ISO filesystem loses access to those resources. The adapter
therefore requires the complete ISO. Nothing from the disc was executed.

## Comparison with existing adapters and upstream tools

This is a **Shin/Alchemist PS2 format family**, established from the actual ROM,
script and image structures and matching upstream PS2 decoding code. It does
not match CLANNAD's HuneX MRG/HED/MZX0, Remember11/Ever17's MAC, Never7's oscr,
or Cartagra's KID SC3 formats. Those story interpreters cannot run this script.
The reusable reader, ISO safety utilities, PNG writer and Sony audio tools still
apply. This finding does not establish identical VMs across all Alchemist games.

Investigated sources:

- [Umineko Project AlchemistUnpacker](https://github.com/umineko-project/umineko-scripting/tree/4529a1198066f229a3d0ab064f282061caa90258/extraction/AlchemistUnpacker):
  BSD-3-Clause, with a PS2 Higurashi resource decoder. Its sector cipher, LZ10,
  palette permutation and graphic record layouts apply. Its bundled decrypted
  game directory was deliberately excluded. Our bounded reader obtains the
  directory, seed, checksums and names from the owner's disc.
- [Shin translation tools](https://github.com/DCNick3/shin-translation-tools),
  `e2fbd365948aa934f9b36f20f9add6d4013a7dca`, MPL-2.0: later SNR schemas,
  text and ROM documentation are useful comparisons. The inspected ROM tool
  explicitly lacks this embedded PS2 layout. No implementation was copied.
- [Shin engine](https://github.com/DCNick3/shin),
  `2405086f8a1d319c9df3605df38a4f0a6379a42d`, MPL-2.0: focuses on a later
  Switch edition of Umineko. It is not a ready-made interpreter for this PS2 disc.
- [Shin ROM notes](https://wikijs.dcnick3.me/en/shin/file-formats/rom) document
  the family and point to the older PS2 unpacker.
- [07th-mod enter_extractor](https://github.com/07th-mod/enter_extractor),
  `6ab07fd4b61a5b797de1570b1e85575ae43ad3e2`: later console research;
  no declared repository licence was found, so no code was reused.

The selected approach is to retain original source instructions and implement
this measured PS2 SNR variant behind the existing reader interface. A later-PC
script, translated console-arc port or filename-sorted text dump is not a
substitute for this disc's behaviour. No missing content was downloaded.

## Technical fingerprint

### Archive and filesystem

The resource container begins at `0x222e0000`, LBA `0x445c0`. ELF code at
`0x13ea2c` supplies this sector to the loader. Its header is `ROM ` followed by
version bytes `04 00 01 00` (1.4), index length in 2048-byte sectors and a key/CRC.
This disc's index is 927 sectors / 1,898,496 bytes.

Directory bytes after the 16-byte header use the bytewise LCG xor cipher. The
decrypted index CRC32 must equal the header key (`f7161099`). Directories contain
a count followed by 12-byte records: relative name/flags, offset units, size.
Directory offsets use 16-byte units within the index; file offsets use sectors
relative to the ROM base. Names are CP932, with `.`/`..` directory records.
The first 16 bytes of every resource sector use the same LCG with a sector seed.

Native evidence: `0x12fd18` header/loading, `0x12fdf4` directory cipher,
`0x12fe54` CRC, `0x12f9b0` sector cipher. The decoder checks ranges, CRC, path
traversal, directory cycles/aliases, case collisions and overlapping file extents.
Original input is read-only; output uses exact-match resume and no-clobber writes.

### Script, text and state

There is one `main.snr` (SHA-256
`6880c4196b3b20e93aacb8245fea4503702a572831b2d9c88dda484a02e11aa0`).
It begins `SNR `. The header records total size, code end at `0x6ee460`, and
entry `0x30`. Twelve appended tables contain asset metadata and other native
data. Structural parsing follows code order; it does not imply story order.

The ELF dispatch table at `0x20ca38` has 256 member-function records; 82 handlers
differ from the native default. Used instructions have been bounded and parsed
from `0x30` through `0x6ee460`. Register operands are signed 16-bit words:
`0x8000..0xbfff` are register operands (only 1,024 slots are valid);
`0xc000..0xffff` are negative immediate values. Mode-1 assignments use raw
signed 16-bit literals. This corrects the initial signed/negative hypothesis.
Native initialization clears 1,024 signed-word registers and supplies an entry
selector in register zero. There is a source call/argument stack. Arithmetic,
conditions, jumps, calls, indexed jumps, messages and visual/audio commands are
distinct operations. Their operand parsing is not a complete execution model.

The separate `CCommandGenerator` vtable is at `0x219a48`. Its slots `0x10`
through `0x210` allocate the command objects for opcodes `80` through `c0`;
their consumers perform the actual operations later. SGET's consumer is
`0x1b8470`, SSET's `0x1b85d0`. They use signed-word system storage through
`0x16a6f8`/`0x16a708`; playback/log reconstruction mode has different read/write
behaviour. Tracing only CScripter's operand readers would miss those effects.
The evidence script dumps both handler and generator ranges for continued work.

`MSGSET` (`86`) carries a message ID/flag word and a length-prefixed string.
`SELECT` (`8c`) carries two IDs, a destination register, an operand and two byte-
length strings, including NUL-separated alternatives. Its native parser also
recognizes an optional `!` prefix plus eight condition bytes. No such alternative
was found among this disc's 120 SELECT sites; register-based conditions and
special native selector commands still need implementation.

Text uses CP932 plus a compact 64-character kana/punctuation map recovered from
the exact executable at file offset `0x145618`. The decoder applies compact
mapping only to standalone bytes, never to the second byte of a CP932 pair.
The native map agrees with later Shin research. No OCR, machine translation,
other-edition script or invented Japanese is needed. All 90,224 script strings
decode without Unicode errors. They still contain source inline controls:
speaker boundaries, voice cues, ruby/page/timing semantics need a native text
parser before these become reader segments.

The executable names ordinary SELECT, CHARSELECT, FAKESELECT, chart and TIPS
handlers. Their state changes, persistent chapter unlocks and return paths must
be traced. Treating them as optional animations would risk changing routes.
There is no claim that routes, endings or even the opening run correctly yet.

### Media

| Resource | Count | Recovery and limits |
| --- | ---: | --- |
| PIC2PS2 pictures | 628 | All decoded to original-size PNG, including five tall credits images |
| BUP2PS2 portraits | 70 | All base/variant planes decoded; native mask/face placement and mouth animation are not yet composed |
| VDS voices | 71,213 | Source metadata followed by Sony ADS; all wrapper/audio extents checked |
| Sony ADS | 173 | 54 BGM and 119 effects; all headers/extents checked |
| VAG system effects | 9 | All headers checked |
| PSS movies | 29 | Extracted; full decode/playback audit not yet run |
| TXA | 158 | Extracted, not decoded |
| LZS | 21 | Extracted, not decoded |
| WIP | 13 | Extracted, not decoded |
| ANP | 5 | Extracted, not decoded |
| Other | 4 | SNR, font, icon and a batch file; batch file never executed |

PIC/BUP use a 256-colour PS2 palette and bounded LZ10 decompression. Face payloads
have two planes; mouth payloads have four. These are preserved separately until
the original masking/composition is verified. Eight small BUP files advertise
a 16-byte-padded length but omit final padding; actual chunk ranges remain checked.
Credits pictures reach 11,445 pixels high, so a square 4096-pixel limit was wrong.

vgmstream r2117 decodes one complete sample from each ADS, VDS (after removing
only its wrapper) and VAG container. This is sample codec evidence, not full
voice playback or reliable dialogue/voice association. There is no current
evidence that an external audio track is required. Native ANP/WIP/LZS/TXA roles
and animation reuse remain research work, not grounds for claiming compatibility
with the other installed engines.

## Commands

Python 3.11+ standard library is enough for recovery and structural/image audit.
The optional audio sample test uses the existing pinned vgmstream r2117 tool;
see [tool provenance](provenance.md). No game executable is launched.

```sh
python3 -m vnkit inspect \
  'Higurashi no Naku Koro ni - Matsuri - Kakera Asobi (Japan).iso' --fingerprint

python3 -m vnkit extract \
  'Higurashi no Naku Koro ni - Matsuri - Kakera Asobi (Japan).iso' \
  --level archives --out private/higurashi/recovery

python3 scripts/audit-higurashi.py private/higurashi/recovery \
  --out private/higurashi/audit --verify-files --write-media \
  --vgmstream private/tooling/vgmstream-r2117/vgmstream-cli

python3 scripts/higurashi-evidence.py private/higurashi/recovery/SLPM_669.13 \
  --out private/higurashi/native-evidence

python3 -m unittest discover -s tests -p 'test_higurashi.py' -v
```

For small probes, the standalone recovery entry point accepts repeated `--member`:

```sh
python3 -m vnkit.adapters.higurashi_ps2 \
  'Higurashi no Naku Koro ni - Matsuri - Kakera Asobi (Japan).iso' \
  --out private/higurashi/sample --member main.snr --member logos/alchemist.pic
```

Audit `--kind scripts|images|audio` limits work. `--write-script` retains full
source-located instructions and decoded strings **privately**; it is an audit
artifact, not a reader or text feed. Image buffers are processed sequentially.
Changed output must use a fresh destination; identical reruns resume safely.
Historical `recovery-v1` predates added manifest settings/version fields: retain
it rather than overwrite its manifest with a newer report.

Generic `import` detects this edition but returns `status: blocked`, exit 3,
without writing placeholder game content. Add game remains disabled. Parse,
path or decoder failures return nonzero; an audit exit 0 proves only its listed
structural checks, and does not override resource warnings or mean playability.

## Measured evidence and remaining work

Private evidence lives under `private/higurashi/`:

- `recovery-v1`: complete extraction of **72,323** ROM members, with extents,
  file hashes and the source fingerprint. `cli-resume-v1` checks selected-member
  extraction through the final CLI implementation.
- `audit-v1`: **72,323 file hashes verified**, **309,298 instructions parsed**,
  zero parse failures or direct jump-target errors, **90,224 decoded strings**,
  **89,279 MSGSET sites**, **120 SELECT sites**, **698 PIC/BUP containers decoded**,
  and all ADS/VDS/VAG headers checked. This is static coverage, not execution.
- `audio-audit-v2`: sequential vgmstream sample decoding with source names,
  tool fingerprint, exit codes and private logs.
- `native-evidence-v2`: reproducible dispatch/operand/loader/command-generator disassembly and
  the source-derived compact kana table. Never bundle these in public code.
- Public `tests/test_higurashi.py`: 11 synthetic tests covering hostile paths,
  bounds, CRC, sector recovery, no-clobber resume, LZ/palette, text pairs,
  source IDs and refusal to install an unplayable import. These tests contain
  no original game bytes.

The 11 Higurashi tests, three registry tests and twelve import-job tests pass.
Selected-member extraction was rerun with identical output. Generic import was
personally checked to return exit 3 and create no library directory. The import
skill passes its format validator. A local code-package check includes the new
tools/docs/BSD notice and excludes private data and game resource extensions;
it was not published.

One picture-table name, `macro.log`, has no recovered `.pic`. It remains an
explicit unresolved table name; this is not a reason to fabricate a replacement.
Most table names resolve, but dynamic references are unverified until the VM
executes. All 120 SELECT records have a common destination register; their
returned indices and native progress effects are still untested.

Next implementation steps, in order:

1. Trace `CCommandGenerator` and command consumers from the native vtables.
   Establish SGET/SSET, chapter entry selectors, special choices, TIPS/chart
   operations, persistent flags and source-earned unlocks.
2. Implement the bounded SNR VM and inline text parser, retaining exact source
   IDs and serializable registers, stacks, progress, scene and media state.
   Unknown control/state commands must stop with their source location.
3. Connect original pictures, correctly composed portraits and verified audio
   cues to the existing reader. Reuse the existing learning/save features.
4. Test 100+ real successive segments, every choice family, earned chapter gates
   and endings, restores and independent progress. Compare against the original
   where a reference run becomes available. No such comparison has been made.
5. Admit this exact edition to Add game/Windows only after that evidence exists.

No new interpreter is being written merely to replace a compatible one: the
existing interpreters and researched later Shin implementations have not been
shown to execute this PS2 variant. There is no established missing-file or text
encoding blocker; the unfinished work is engine execution and verification.
