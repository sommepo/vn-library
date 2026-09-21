# Pia Carrot 3 PS2 adapter notes

Scope: **SLPS-25222, SYSTEM.CNF version 1.04 only**. This adapter has not been tested against limited, budget, Dreamcast, PC, or other NOBORI releases. Files and archive sizes are inventory evidence, not an engine-wide support claim.

Implementation: `vnkit/disc.py` (ISO9660/no-clobber I/O), `vnkit/elf.py` (read-only ELF evidence), `vnkit/adapters/pia_ps2.py` (edition, NFP, SCRP, import report), `vnkit/adapters/pia_media.py` (bounded MIT-derived MLH/NBP). No disc executable is run. See the repository adapter guide for the reader's separate content contract.

## API

```python
from vnkit.adapters import pia_ps2
pia_ps2.detect(source)                       # evidence and exact-edition match
pia_ps2.inspect(source, fingerprint=True)    # source is ISO or extracted DISC directory
pia_ps2.extract(source, destination)         # all NFP members and standalone disc files
pia_ps2.import_game(source, output)          # images/static recovery; returns status=blocked
```

An extracted disc directory contains `SYSTEM.CNF`, `SLPS_252.22` and original `.NFP` files. A directory of expanded NFP members is an archival output, not a substitute input to this adapter. Use `--level disc` when preparing a directory to re-import. `Source.read_at` is bounded at 64 MiB; `Source.chunks` streams larger resources. Out-of-bounds fields, duplicate paths and unsupported signatures raise `FormatError`, and CLI failures are nonzero.

## ISO and NFP

ISO uses 2,048-byte sectors. Both-endian ISO extent fields are cross-checked. Multi-extent, associated, interleaved, unusual filename and cyclic-directory forms are rejected rather than guessed. A UDF bridge exists, but the implemented reader uses ISO9660. Files are streamed, originals preserved, and output paths reject absolute forms, `..`, empty components, control characters, backslashes, colons and symlink destinations. Atomic creation never replaces a differing existing file; identical content resumes by exact SHA-256. Generated manifests omit transient `created`/`unchanged` state so reruns are deterministic. Extraction directories must remain private and not be writable by an untrusted concurrent process.

NFP starts with `NFP2.0 (c)NOBORI 1997-2002`. Little-endian u32 fields at `0x34`, `0x38`, `0x3c` hold member count, table offset (`0x800` in this image), and first payload area. Each table entry is 32 bytes: zero-terminated filename space through `+0x17`, byte offset at `+0x18`, byte length at `+0x1c`. Archive extents are byte offsets, not sectors; stored sizes include disc alignment where present. Each member is copied unchanged. All 20,408 NFP member extents and names were checked.

## SCRP parsing

`SCRP` is at file offset zero, followed by a declared size. `CODE` begins at offset eight and its u32 size describes the following payload. That payload begins with three u16 fields: stack bytes, local numeric-variable count, local string-variable count. The instruction buffer starts at **file offset 22**. Branch targets and FUNC relocation offsets are relative to this buffer, not the whole file.

After CODE come `NVAR`, `SVAR` and `FUNC` relocation blocks, terminated by `TERM`. Each relocation block contains zero-terminated ASCII names followed by zero-terminated lists of u32 buffer offsets; an empty name ends the block. The native loader uses these terminators, and declared lengths have inconsistent conventions between CODE and relocation chunks; the parser preserves both nominal and consumed lengths and follows the evidenced loader. Unknown blocks fail. FUNC references patch four-byte pointers; variable references patch smaller operands. The import preserves all relocation tables for future VM work.

The ELF `_scrRunCode` at `0x00127900` dispatches through a 256-pointer table at virtual `0x001e9b20` / file `0x000e9ba0`. Fifty-six entries are defined, with retained `__scrCmd…` symbols. `Elf32.evidence()` recovers named handlers and direct MIPS JAL targets without executing code. Getter calls establish operand widths; special cases are verified from the handler body:

| Opcode(s) | Static operand layout |
| --- | --- |
| 10 SKIP | u16 length, then exactly length embedded bytes |
| 11 JUMP / 13 CALL | u32 CODE target |
| 12 JUMPZ | u8 register, u32 CODE target |
| 14 RET | none |
| 15 SWITCH | u8 register, u8 case count, then count × (u32 value, u32 target) |
| 20 MOV | u8, u8 |
| 21 MOVI / 22 MOVA | u8, u32 |
| 28 PUSH / 2A POP | u8 |
| 29 PUSHI | u32 |
| 30–39 arithmetic | even forms u8,u8; odd immediate forms u8,u32 |
| 3A–3C unary | u8 |
| 40–45 bit operations | even forms u8,u8; odd immediate forms u8,u32 |
| 46 NOT | u8 |
| 50–53 logical binary | even forms u8,u8; odd immediate forms u8,u32 |
| 54 LNOT / 58–5D comparisons | u8 |
| 60 INTVECT | u8,u32 |
| 61 INT | u8 |
| 62 RESUME / 63 INTON / 64 INTOFF | none |
| 70 LDGNVAR / 71 LDGSVAR | u16,u8 |
| 72 LDLNVAR / 73 LDLSVAR / 78 STRADD | u8,u8 |
| 79 STRFREE | u8 |
| 80 FUNC | u32 pointer placeholder, named by FUNC relocation |
| 8F EXIT | none |

Reproduce the underlying source evidence without running the executable:

```bash
python3 -m vnkit.elf private/pia-extracted/SLPS_252.22 _NopeningCtrl __scrReadCode __scrReadFunc __scrCmdSWITCH _NnftGetFntIndex > private/elf-evidence.txt
```

The small evidence disassembler prints undecoded/R5900-specific words explicitly and is not a full MIPS disassembler or an emulator. Its outputs are private. Retained symbols, operand getter calls and instruction bytes allow the documented static conclusions to be checked independently.

These are parsing semantics, **not implemented execution semantics**. Unknown opcodes stop decoding with a byte location. Every jump/call/switch/interrupt target must land at a decoded instruction boundary. Every FUNC call must resolve to a relocation and every FUNC relocation must be consumed. Trailing zero padding after final EXIT is explicitly measured. The compiler's embedded SKIP strings cannot be treated as opcodes or read in file order to invent story order.

Stable IDs use `SCRIPT.SPC:code:00000000` and `SCRIPT.SPC:string:00000003`, retaining source byte offsets. Identical strings at distinct offsets remain distinct. Name/resource strings and message fragments are not conflated into dialogue. No machine translation or inferred reconstruction is used.

## Japanese and custom glyphs

All 117,781 identified zero-terminated string payloads decode with strict CP932. F040/F057/F05E decode to U+E000/U+E017/U+E01E, respectively, and need the original custom glyphs. Their occurrences total 4/5,976/849 across 3,532 strings. The executable `_NnftGetFntIndex` at `0x00144294`–`0x001442d4` maps F040–F0FF to `index = source_code - 0xCF90`. `FNT24X25.NFT` declares width 24, height 25, two bits per pixel; a glyph is 150 bytes, beginning at the font data offset plus index × 150. The toolkit generates an exact private glyph specimen and records those offsets. It retains PUA values rather than guessing Unicode symbols. A complete reader port will need a source-backed font/text-export policy. Ruby and inline substitution/control semantics are unverified.

## Graphics and sound

MLH 1.04 and 1.02 use linked member records; the pinned upstream codec is the basis for bounded decompression. Stored buffers and decompressed sizes are retained. A 4 KiB LZSS ring starts at offset FEE, uses least-significant-bit-first flags and bounds every reference. Decoded NBP contains part geometry/orientation plus original pixel samples. Supported 24/32-bit and 8-bit indexed variants become lossless PNG at original resolution. Known PF effect images are grayscale despite their 24-bit field; this is accepted only with the evidenced name and exact dimensions. Verified all-zero alignment padding is checked, not treated as pixels. Tile direction 3 and four-bit indexed data remain explicit failures.

RGBA samples and PS2 palette conversions are not proof of original blending/chroma-key rules. Eye/mouth sprites, position, layering, animation timing and transition effects require native presentation semantics. Never select background/sprite files by similar names and call that a scene.

VAS stores PS2 sound data; NMUS contains sequenced music in SQ and BD/HD banks. No browser-audio conversion or reliable line/voice mapping is implemented. The original movie is a PS2 PSS stream. None of these resources is replaced or downloaded.

## Failure signatures and next work

* `expected SCRP/CODE`, out-of-bounds extents or bad target: fail that import; preserve evidence and original bytes.
* `unknown opcode`: never skip it; inspect retained handler table and ELF source address.
* `FUNC has no relocation name`: report a real unresolved dependency, not a no-op.
* `Unsupported NBP tile direction 3` / `bpp=4`: preserve raw MLH member and list a presentation gap.
* `refusing to overwrite different file`: use a new versioned output directory or inspect the changed artifact; never blindly delete originals.
* Current `status=blocked` is expected even with zero static parse failures: game execution is absent.

Implement VM state, native initialization and source-backed media associations before exposing the actual story. Then compare original behaviour and test 100+ real presented segments and branches; static scans cannot satisfy that runtime milestone.
