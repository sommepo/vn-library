# YU-NO: original Japanese PC-98 CD

Status: resource recovery and a private original-runtime reference. **There is
no playable VN Library import yet.** Do not put this edition in the supported
installer list or describe the new PC-9800 shell as a completed game port.

Paused at the user's request on 2026-09-23. Preserve the recovery and private
reference; do not resume implementation without a new request. The current
handoff and last failed experiments are in `docs/next-session.md`.

## Identified media

The supplied ZIP and subsequently unpacked folder contain one CUE and ten BIN
tracks. Track 1 is MODE1/2352; tracks 2–10 are CD audio. Track 2 has a two-second
INDEX 00 pregap. The data track contains an ISO9660 volume named `YU_NO`.
Its README specifies NEC PC-9801 machines, MS-DOS 5.0A or later, 25 MB hard disk
space and 86/26K/Canbe sound. The startup batch invokes PLAY6, AMD and
`AI5X START.MES A X`. This is strong evidence for the original Japanese PC-98 CD
release, not the later Windows Elf Classics edition or a console port.

The exact executable fingerprint admitted by the recovery script is:

```
AI5X.EXE SHA-256
04f2e70a535208d5d9cb879b8f7ccde96c267aadad6907ff9760e8376b02893d
```

The full track hashes, resource hashes, decoded hashes, sector positions and
file mappings belong to the private recovery manifest. The current disc has all
nine referenced CD audio tracks. Their relationship to in-game music has not
been established. They must not replace the separate native FM sequences.
No proprietary NEC BIOS/font ROM or MS-DOS installation is included. A private
reference boots with NP2kai's BIOS implementation, a distributable font and
FreeDOS(98); its visual/audio fidelity to physical hardware remains unverified.

## Confirmed technical fingerprint

| Layer | Measured structure |
| --- | --- |
| Programs | DOS MZ / EXEPACK AI5X and installer; original AMD and PLAY6 drivers |
| Containers | `YUNO_A` through `YUNO_O`, four-byte header, encrypted 20-byte directory entries |
| Directory | Count u16; version/rotation byte 1; initial key 0x55; ROR8 by one then incrementing XOR key; 14-byte name, u32 relative offset, u16 size |
| MES compression | MSB bitstream; literal flag + byte; 12-bit ring position / 4-bit length + 2; 4096-byte ring starts at 1; zero position terminates |
| Scripts | 870 MES files accepted by lime-juice's `yuno` preset without recovery warnings |
| Images | 1,018 unique GP4 files decode with juice-img; 1,019 physical entries |
| Other resources | 183 S4, 270 A6, 107 M26 and 107 M86 files; EFFECT.DAT and MOUSE.FNT |
| Display | 640×400; four-plane 16-colour output; palette ports A8/AA/AC/AE |
| Text | Source dictionary-expanded Shift-JIS glyph codes; fullwidth 16×16; halfwidth 8×16 font reads from PC-98 character-generator ports |
| Ordinary dialogue rectangle | Script assigns x=14..67 in eight-pixel units, y=320..377; line pitch 19; other screens set their own rectangles |
| Mouse | Source cursor font and A6 region tables; game-controlled pointer/hotspot handling |
| Animation | S4 and original AI5 animate/blit/palette operations; not a PS2 animation system |
| Audio | PLAY6 music driver and separate M26/M86 sequence variants; no voice container identified; AMD is the mouse driver |

The native archive consumer searches volumes A through T in order. One filename,
`MPPART1.GP4`, occurs with different payloads in D and H. Recovery retains both,
selects D according to the native search, and records the shadowed H copy. It
does not silently overwrite either source.

The Windows AI5 ARC/DAT parsers inspected in libai5 and GARbro do not describe
these volumes. KID/HuneX PS2 parsers do not transfer. Confirmed reuse is the disc
reader, safe output writing, external parser/image tools and shared browser
features; it is not a shared PS2 script VM.

## Runnable recovery

Linux developer setup: Python 3.11+, Git, CMake and a C++17 compiler. Node 22+
and the project's optional Playwright setup are needed for browser checks.
The existing Windows installer does not include this experimental toolchain.

```sh
git clone https://github.com/FuzionCD/lime-juice.git private/tooling/lime-juice
git -C private/tooling/lime-juice checkout dc00362a0d7e9f52931040119080b1435d26724a
python3 scripts/build-lime-juice.py private/tooling/lime-juice \
  --out private/tooling/lime-tools

python3 scripts/yuno-pc98-media.py '/path/to/unpacked-cue-folder' \
  --work private/yuno/recovery
python3 scripts/audit-yuno-pc98.py private/yuno/recovery \
  --tools private/tooling/lime-tools --out private/yuno/audit
python3 scripts/inspect-dos-exepack.py private/yuno/recovery/disc/AI5X.EXE \
  --out private/yuno/native-ai5x
```

Recovery also accepts the complete CUE/BIN ZIP or its CUE file. It checks sibling
paths, track sizes, ZIP entries and archive extents. Original input is unchanged.
Matching outputs can be rerun; differing output requires a new work directory.
Media manifest v2 adds whole-track fingerprints including pregaps. Do not rerun
it into an older v1 manifest directory; choose a fresh directory. `--no-audio`
omits WAV preparation explicitly but still fingerprints the source tracks.

These operations recover source programs and assets. They do not determine story
order by sorting filenames. The Racket-style decompiler output is a research
artifact, not the reader content contract.

## Original-runtime comparison

`scripts/yuno-pc98-reference.py` prepares a separate private folder containing
the user's original runtime/resources, an independently written browser wrapper,
a locally supplied NP2kai WASM core and a copied FreeDOS boot disk. Only the boot
disk copy is configured. HOSTDRV exposes an in-memory game directory to DOS;
the guest has no general host-filesystem access. The proprietary installer is
never run. Do not serve the project root.

The first bounded Chromium checks reached the original colour/monochrome selector,
publisher logo, animated opening and original framed menu via its intro-skip mouse
action. Private evidence is under `private/yuno/reference-v1`. This is original
code execution in emulation, not physical PC-98 comparison or reader integration.

An emulator state is about 8.7 MB raw / 315 KB gzip at the tested opening point.
Writing returned success; a fresh-context restore returned warning bit 0x80 and
continued animation. The warning has not been explained, and restoration across
story branches, file writes and A.D.M.S. has not been validated. It must not be
treated as a proven save system yet.

Text is drawn into graphics memory, so copying TVRAM does not recover dialogue.
AI5X's fullwidth glyph routine is at unrelocated module offset 0x4f7b; the caller
at 0x3ac holds the expanded Shift-JIS code. Native system fields at DS:E654/E656
hold the eight-pixel X and pixel Y cursor. The private diagnostic TSR in
`scripts/pc98-text-probe.s` reserves its own DOS memory for observations and does
not contain game instructions. `tests/yuno-native-probe.mjs` checks the measured
routine before installing an in-memory observation trampoline. The original
disc and executable stay unchanged. This is diagnostic work, not an enabled
reader hook. Never publish raw glyph traces, memory or emulator saves.

The corrected diagnostic recorded 65 fullwidth glyph calls through the colour
selector and native start menu, with no ring overflow or native crash. This
includes offscreen menu construction: its glyph coordinates are later moved by
blits and are **not** final screen positions. Dialogue/clear boundaries, halfwidth
text, stable MES identities and text-blit tracking still need work. The first
probe had a trampoline-padding bug and is retained as failed evidence; only the
second probe is a successful glyph observation. Neither is route coverage.

A subsequent glyph-only probe reached the original opening dialogue and recorded
43 glyphs (`private/yuno/trace-story-v4`). The expanded experimental observer in
`web/adapters/yuno-pc98-observer.mjs` also records file loads, clears, wait commands,
halfwidth glyphs and blits. Its automated menu navigation still needs correction:
the latest run selected Exit rather than name entry. Capturing these operations
does not yet provide logical segments or synchronized selectable dialogue.

## Remaining acceptance work

- Select a production runtime boundary after proving native text, stable source
  identities and deterministic saves. Running AI5X inside an isolated WASM core
  is a candidate; the source-script interpreter remains another option.
- Document and test A.D.M.S. jewels, world divergence, branch returns, persistent
  memory and source save interaction. No route/ending claim is established.
- Align selectable DOM text to source rectangles without an added generic textbox;
  group logical segments and distinguish menus/hotspot labels from narrative.
- Connect the shared activity, copy, stream, backlog, pause and save facilities;
  test reload and rereading without duplicate publication/counts.
- Verify source hotspots, native controls, touch and keyboard alternatives.
- Verify FM playback, effects, volume and save resumption. CDDA extraction alone
  says nothing about correct in-game sound.
- Audit the exact distributable WASM/OS/font dependencies and corresponding source
  requirements before building an installer. No WebNP2 frontend code is copied.
- Complete GUI media admission and clean import, then real scenes/branches and
  A.D.M.S. restore tests. Keep unsupported PC-98 input visibly unavailable until
  those work; the public synthetic platform test is separate evidence.
