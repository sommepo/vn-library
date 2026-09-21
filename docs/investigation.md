# Supplied image investigation

The supplied image is **Piaキャロットへようこそ!!3 ～round summer～**, Japanese **PlayStation 2 standard edition SLPS-25222, executable version 1.04**. Identification confidence is high: the original `SYSTEM.CNF` boots `cdrom0:\SLPS_252.22;1`, declares `VER = 1.04`, and selects NTSC. The executable is little-endian ELF32, MIPS/R5900, entry address `0x00100008`, and retains 8,040 symbol entries. This is a console-specific NOBORI archive/SCRP/native-engine stack; PC F&C or NScripter assumptions are inappropriate.

The ISO is 2,293,760,000 bytes. SHA-256 is `bdfdf53bbcfa2f90399353d5f8f747e214d14fbf98a9e594743bb62a51e8ba5a`. It was only opened for reading; none of its executables or installers were run. The toolkit inspected a standard ISO9660 primary volume descriptor at sector 16. UDF bridge identifiers BEA01/NSR02/TEA01 are also present at sectors 18–20; extraction uses the ISO9660 directory tree, and the UDF tree has not been independently compared.

## Resources found

| Disc file | Bytes | Indexed members | Actual evidence |
| --- | ---: | ---: | --- |
| NVAM.NFP | 1,844,086,784 | 18,224 | `.VAS` voice/stream candidates; raw PS2 audio blocks |
| NVAS.NFP | 40,574,976 | 3 | `.VAS` named music streams |
| NEV.NFP | 77,864,960 | 297 | MLH event artwork containers |
| NBG.NFP | 20,463,616 | 93 | MLH background containers |
| NCHR.NFP | 39,833,600 | 290 | MLH character containers, including separate eye/mouth images |
| NETC.NFP | 201,959,424 | 102 | Interface artwork, `FNT24X25.NFT`, `MINIGAME.LHT`, `OPENNING.PSS` |
| FCHIP.NFP | 44,877,824 | 243 | MLH animation/chip resources |
| NMUS.NFP | 12,503,040 | 38 | MLH containers with BD/HD sound banks and SQ sequences |
| NSCR.NFP | 8,802,304 | 1,118 | `.SPC` files with SCRP/CODE/native relocations |

Other disc files are `SLPS_252.22`, `SYSTEM.CNF`, `IOPRP253.IMG` and `MODULES.MLH`. `OPENNING.PSS` is 157,763,584 bytes and starts with an MPEG program-stream pack header. The soundtrack is not entirely prerecorded WAV/MP3: NMUS contains sequenced PS2 music and instrument banks. Treating these bank files as ready-to-play browser music would be incorrect. Voice sample rates/interleaving and exact line associations remain unverified. No missing disc resource has been established. A conventional PCSX2 reference run additionally needs the user's own PS2 BIOS, which is not supposed to be present on a game disc.

## What was established

Opening the disc, recovering archive entries, parsing script instructions, and executing the original game are separate outcomes:

* ISO9660 and all nine NFP archive indexes are validated. Complete archive extraction produced 20,412 files, including four standalone disc files, using no-clobber writes and SHA-256 manifests.
* All 1,118 scripts parse completely: 1,039,001 instruction records, zero unknown opcode/boundary/branch-target/native-relocation errors.
* 117,781 embedded string values decode under strict CP932, including 85,498 with non-ASCII characters. These counts include resource names and other data; they are **not** counts of dialogue pages or completed reading. There are 50,067 static `Mess` calls and 34,489 `Hitret` calls. Multiple message calls can compose a page.
* 3,532 strings contain custom glyphs: CP932 bytes F040, F057 and F05E, represented as Unicode private-use characters. Their exact 24×25 font bitmaps have been recovered using the executable's glyph-index formula. No guessed Unicode replacements have been applied. Standard CP932 decoding alone does not render these correctly with a normal Japanese font.
* All 1,058 NFP-contained MLH files decode. Supported image formats produce 4,307 original-resolution PNGs. Ninety-seven individual images remain explicitly unsupported: 96 tile-direction-3 chip images and one 4-bit indexed image. These are source-located in the private compatibility report.
* **Story and original presentation execution are not implemented.** The browser registers this import as blocked and presents the report. Static source data are deliberately not exposed as a fabricated linear novel.

## Entry point and concrete execution blockers

The opening is established from executable dataflow, not filename order. `_NopeningCtrl` at virtual address `0x0013d268` loads the `OPEN01` literal at virtual address `0x001f76c0` (ELF file offset `0x000f7740`) into controller state. The same controller calls `_SetNscrExec` at `0x0013d800` using that scenario field, after title/name/uniform setup.

`OPEN01.SPC` first calls `EnterScenario` at file offset `0x2d` (CODE offset `0x17`). Its next native query, `GetSysGameClear`, occurs at file offset `0x3f`; `JUMPZ` at file offset `0x4e` branches on the result before any dialogue. The early branch invokes `AddSelectMess` and `SelectStart`, or bypasses that menu according to persistent original system state. The first `Mess` call is only at file offset `0x35e`. A port must represent this state and the prior native initialization, not arbitrarily choose a branch.

The script VM, its stack/register/interrupt conventions, and 119 distinct native functions require executable implementations. Native functions include scheduling, work, money/condition, character attributes and affection, room menus, asynchronous tasks and table-game hooks. The executable also retains dedicated waiter/cashier/cleaning/dishwashing/warehouse routines and blackjack functions. A reader that discards those systems changes the game and route conditions. The initial recovery checkpoint had no executable opening slice. The subsequent source-script runtime now has real browser opening checks and a 933-page control probe; see [current coverage](pia-runtime.md). Full-game fidelity remains unverified, and the room/day/work systems still need implementation.

## Approach selection and research

The approach selected is safe local extraction, reusable source-located static parsing, existing proven media conversion, and a small versioned browser-reader interface. The adapter fails closed until real execution semantics are implemented. The next substantive port work should implement the known SCRP VM and its native game functions, or adapt an interpreter that demonstrably supports this exact PS2 format with selectable text. Full PS2 emulation alone does not meet the DOM-text requirement. No applicable existing browser interpreter was established in the inspected references.

[PS2 Visual Novel Tool](https://github.com/punk7890/PS2-Visual-Novel-Tool) explicitly lists this game; its `alphaUnit.gd` and `comFuncs.gd` provide relevant NFP/MLH/NBP conversion evidence. A bounded Python adaptation is included under its MIT licence, pinned to commit `e27f4f940af07f46ae1dbed7cdefd9e4be5cf667`. The project is an extractor/converter, not a story interpreter. [Tsukiweb's resource instructions](https://github.com/requinDr/tsukiweb-public/wiki/Recreating-the-resources) concern a different game/engine and were used for architectural/reference comparison, not as proof of format compatibility. [GARbro](https://github.com/morkt/GARbro) was inspected as a potential resource tool; relevant PS2 support was not established. See [provenance](provenance.md) for inspected licences and the no-unlicensed-copy decisions.

## Reproduction and evidence

Run the documented CLI `inspect`, `extract --level archives`, `import --adapter pia-ps2`, and `validate` operations. Importing this exact image intentionally returns exit code 3 because the story is unsupported, even though its static recovery succeeds. Generated private outputs include `inventory.json`, `manifest.json`, `compatibility.json`, `analysis/elf-evidence.json`, `analysis/custom-glyphs.json`, original glyph pixels, per-script JSON and declared converted images. Every instruction and string has a stable source identifier and byte location. See [format notes](formats-pia-ps2.md) and [compatibility](compatibility.md).
