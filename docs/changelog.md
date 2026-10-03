# Changelog

## v0.2.0

The first release without a beta label; everything since v0.1.0-beta.5. Support
remains per exact edition and several readers are experimental, as marked
below. No game files, cartridges, fonts, scripts, saves or private reports are
included.

### Home and statistics

- The reader now opens on **Home**, a small early-2000s-homepage-style page in
  front of the systems: a title, one scrolling line, a digit counter for today's
  characters, link buttons (resume, one, two, portable, advance, stats) and a
  status line. It fits one screen without page scrolling, including phone and
  handheld sizes, with a light page and a dark (Dim) page.
- **stats** on Home totals reading activity for every game: characters, active
  time, characters per hour, a 30-reading-day line and a per-game list. Clearing
  is available per game, per system or for everything; it removes sessions and
  days only and keeps seen text, backlog, bookmarks, saves and progress. A
  backup of the cleared activity is stored first. Statistics stay on the device.
- **Aa** on Home opens Reading settings. Every system library has a **Home**
  button.
- Optional **session stats box** (Reading settings, off by default): a tiny box
  in the picture's upper right with this session's time, characters and
  characters per hour. It only reads activity and scales with the picture.

### advance (GBA) and Gyakuten Saiban 1–3 (experimental)

- New **advance** library environment: a 240×160 menu drawn at native
  resolution with hard pixels and whole-number scaling.
- An original-code GBA machine (`web/adapters/gba/`): CPU, memory, timers, DMA,
  interrupts, picture and sound, with BIOS services written in JavaScript. No
  BIOS image and no third-party emulator code.
- **Gyakuten Saiban** AGB-ASBJ, **Gyakuten Saiban 2** AGB-A3GJ and **Gyakuten
  Saiban 3** AGB-A3JJ run on that machine through one series engine with a
  profile per cartridge. The game's own graphics and sound are used; its text is
  drawn as selectable Japanese at the native positions; taps on the game picture
  drive the game's own controls; saves, backlog, activity and Anki work.
- Speed work for slow devices: the machine skips busy-wait loops and batches
  timers and sound, the page paces by queued audio and saves repack only changed
  memory segments.
- CRT filters now work on live game screens (one scanline per picture line,
  flat geometry so the text stays in the game's box).

Limits, stated plainly:

- **Import is command-line only** and exits 3 (experimental). Nothing is added
  to Add game or the Windows installer.
- The text uses glyph and name-tag maps bound to each ROM, now included as
  `vnkit/adapters/gs1_charset.py`, `gs2_charset.py` and `gs3_charset.py`. They
  are visual transcriptions, **not an official table and not proofread**, so a
  wrong character is possible. Importing each cartridge with only these maps
  reproduces the developer's installed copies exactly.
- Every episode of the three games was cleared by an automated player using
  native input, and touch is checked with real touch events in Chromium. Timing
  and sound are not compared with hardware. No phone has been measured; one
  informal phone check covered the court record only.
- Guides: [first game](gs1-gba-runtime.md), [second](gs2-gba-runtime.md),
  [third](gs3-gba-runtime.md).

### 428 (PSP) research code (experimental, not playable)

- Eighteen more `shibuya428-*` reader modules (audio, channels, context,
  feedback, flow state, media, motion, music, picture, presentation, system,
  text, threads and bounded native kernels), the font adapter
  `shibuya428_font.py`, a PSP movie (PMF) parser and their synthetic tests.
- This is research source code. There is still no 428 library entry, no Add
  game support and no save format; the CLI import exits 3 and creates no
  playable content. See [the investigation](428-psp-investigation.md).

### Display and documentation

- CRT display: live-canvas source, per-platform defaults (GBA defaults to off)
  and shader changes; see [CRT display](crt-display.md).
- New and updated guides for the GBA games, platform environments, the reader
  interface, statistics, testing and provenance.

### Checks and what was not checked

- Public Python, Node and synthetic-fixture checks run without commercial game
  data; the GBA machine, series engine, session box, Home statistics and 428
  tests are part of the public test command.
- **No Windows retest**: the installer flow and Windows conversion were not
  rerun for this release, and the Windows package is untested on Windows. Browser checks with real game data are private
  evidence on Linux Chromium/Firefox, described in each guide.
- Existing imports need no rebuild; saves and reading activity are unchanged.

## Earlier releases

See [GitHub releases](https://github.com/sommepo/vn-library/releases) for
v0.1.0-beta.1 to beta.5.
