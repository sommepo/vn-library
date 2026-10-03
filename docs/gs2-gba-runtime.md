# Gyakuten Saiban 2 (GBA) native runtime

**Status: experimental; all four episodes play through natively to their endings; local CLI import only.**
The owner-supplied cartridge (AGB-A3GJ, SHA-1 `f7a156db…`) executes on an
original-code Game Boy Advance machine in the browser, so the game's own logic,
court and investigation processes, psyche-locks, minigames, graphics, animation
and m4a sound all run as on the cartridge. The reader adds selectable Japanese
text, touch control, saves, activity, backlog and Anki on top. Import exits 3;
it is not admitted to Add game or the Windows installer.

## Architecture

| Part | File | Notes |
| --- | --- | --- |
| ARM7TDMI CPU (ARM + Thumb) | `web/adapters/gba/cpu.mjs` | Original interpreter; approximate timing |
| Memory map, I/O, DMA, timers, IRQ, keypad | `web/adapters/gba/machine.mjs` | Six-instruction IRQ dispatcher written here; no BIOS image |
| BIOS services | `web/adapters/gba/bios.mjs` | High-level SWIs (division, LZ77/RL/Huffman, CpuSet, affine sets, MidiKey2Freq, IntrWait) |
| Picture | `web/adapters/gba/ppu.mjs` | Text/affine/bitmap BGs, sprites, windows, blending, mosaic |
| Sound | `web/adapters/gba/apu.mjs`, `audio-worklet.js` | Direct Sound FIFOs + four PSG channels |
| Snapshots | `web/adapters/gba/pack.mjs` | Synchronous LZ packing for saves |
| Series reader engine | `web/adapters/gyakuten-native.mjs` | Observation, text, touch, saves; shared with GS1 and GS3 |
| GS2 profile | `web/adapters/gs2-native.mjs` | This edition's RAM, sprite and script facts |
| Live host | `web/live-native.mjs` | Frame loop, audio, DOM text layer, tabs |

No third-party emulator code is used. A BSD-licensed JS emulator was considered;
running it was not permitted here, so it was deleted unused.

## Speed and sound pacing

Play in a mobile browser was laggy, with choppy music. The cause was
measured with the browser's main thread slowed down (`tests/browser-live-performance.mjs`):
from about four times slower than this host the machine fell below 60 frames a
second, and the host then ran six frames per display tick to catch up, which
dropped the picture to under ten frames a second and starved the sound. Three
things changed.

**The machine does less work per frame** (about 3.6 times faster in a court scene
with music: 4.0 ms to 1.1 ms per frame with picture and sound, 2.4 ms to 0.4 ms
without), with the same machine state on every frame:

- Busy-wait loops are skipped. These games wait for VBlank by polling a byte in
  a five-instruction loop, which was three quarters of all instructions run. A
  taken backward branch that comes round with every register and flag unchanged,
  with nothing written and no I/O read since, repeats exactly until the next
  event; whole turns are added as cycles and the turn in progress at the event
  still runs (`ARM7.backward`, `GBA.dirty`, `GBA.stopCycles`).
- Timers and sound advance in batches instead of after every instruction. A batch
  ends at the line target, when a timer overflow falls due (applied after the
  instruction that reaches it, as before), on a halt, or when a timer register
  is written. A timer read or a sound register write inside a batch first brings
  them up to the start of the instruction making it. Interrupts are still checked
  before every instruction.
- Memory is read through aligned 16/32-bit views instead of a region lookup per
  access, and opcodes are fetched directly from ROM and work RAM.
- The picture is composed from an ordered list of the backgrounds that drew the
  line, with shorter paths when no blending or no window is in use; text
  backgrounds are drawn a map entry at a time.

**The host keeps sound whole and gives up picture smoothness first**
(`web/live-native.mjs`, `web/adapters/gba/audio-worklet.js`):

- Emulation is paced by the audio the output really has queued (the output
  processor reports its level), aiming at 0.1 s. Each underrun raises that by
  0.04 s up to 0.3 s; a clean minute lowers it a step.
- When a tick has to run more than one frame, only the last is drawn
  (`GBA.skipRender`; the machine state is the same). A tick runs at most five
  frames and stops after 50 ms.
- When the output does run dry it fades out, waits for 40 ms of audio and fades
  back in, instead of crackling sample by sample. Sound is suspended as soon as
  the page is hidden.

**A save is quick.** One is made at every page and again when the page is left
(for "previous line"); it took 11 ms here with the browser's base64 path, several
times that on a phone. Memory blocks are now saved as 8 KiB segments packed on
their own, and a segment whose bytes have not changed since the previous save
keeps its packed text: 0.2 ms when nothing changed, about 2 ms after half a
second of play. Saves are about 3% larger. Earlier saves (one packed image per
block) still load.

| Main thread slowed | Before | After |
| --- | --- | --- |
| 3× | 59.5 frames/s, no underruns | — |
| 4× | 53 frames/s emulated, 9 drawn, 143 underruns in 15 s | 59.7 emulated, 57 drawn, none |
| 6× | 36 emulated, 6 drawn, 94 underruns | 59.7 emulated, 56 drawn, none |
| 8× | 27 emulated, 5 drawn, 95 underruns | 59.8 emulated, 49 drawn, 1 underrun |
| 12× | — | 56 emulated, 19 drawn, 88 underruns (too slow) |

The host keeps counters (`liveStats` on the canvas element, beside `liveEngine` for
checks from the page). Opening the reader with `?livestats` in the address shows them in
the corner of the game screen, for a report from a real device: emulated and drawn
frames a second, the cost of a drawn frame, underruns, the audio lead and the audio state.

These are Chromium runs on this host with DevTools CPU throttling and a simulated
real-time audio output (`tests/simulated-audio-output.js`; a host without a sound
device never starts a real audio worklet). They show the margin, not any
particular phone: no phone has been measured.

## Text as DOM

The game's text glyph sprites are hidden in the picture and the same characters
are drawn as DOM text in exactly their native positions (hardware OAM positions
of normal-box entries 0–31 and choice entries 32–62, on the native 14-pixel
grid, in the native ink colour). The text follows the native typing and slides.
Glyph codes come from the native text-box table and the ROM-bound reviewed map
(`private/gs2/charset-review-v1.json`). The native text box frame and name tag
are the game's own graphics; the reader's own text box is not used.

From v0.2.0 the glyph and name-tag maps ship as `vnkit/adapters/gs2_charset.py`
(glyph ID to Unicode codepoint, and the speaker name on each name-tag image),
and the importer uses them by default after checking this ROM's font hash and
SHA-1. They are visual transcriptions, **not an official table and not
proofread**; no font or name-tag image is included. `VNKIT_GS2_CHARSET` and
`VNKIT_GS2_NAMES` select other review files with the same checks. The
`private/gs2/…-review-v1.json` paths named in this guide are the local review
files the module was generated from.

Reader boundaries are read from native state (`gScriptContext`,
`gTextBoxCharacters`): a completed page waiting for A (after the native
paragraph delay, which the game counts down only in court and investigation;
the "evidence added" window's filing message is a page of its own), a timed page
the script clears by itself (the machine holds while it is read), and
two/three-way choices. These feed activity, backlog,
Live text and Anki exactly like other readers. Empty A-waits are passed with A.

## Touch control

The game screen is the controller; there are no off-screen buttons.

- Text: tap to continue. Choices: tap the line.
- Investigation: tap 調べる / 移動する / 話す / つきつける; in 調べる tap the spot;
  tap a destination or topic plate.
- Cross-examination: tap the game's ゆさぶる / つきつける prompts or side arrows;
  tap elsewhere for the next statement.
- Court record: tap the game's ◀ ▶, R 人物ファイル, A 決定 and B もどる prompts, or swipe.
  The arrows are 16 pixels wide, so the strip of the panel beside each one counts as
  the arrow, and prompt labels take a little slack above and below. Opened from a
  page of dialogue, the record keeps that page pending underneath; taps and keys
  still go to the game while it is open (`nativeScreen()`), and closing it returns
  to the same page.
- Psyche-lock: the game's stop / present prompts. Episode select: tap the episode's
  plate (GS3: the left or right third turns the carousel, the middle chooses). Save
  prompt: tap はい or いいえ; a tap beside the plates does not answer.
- The text box area is for reading and looking words up, so a tap there never
  continues the game. Controls the game draws inside it still take the tap: a
  statement's arrows at the ends of the box, the record's R prompt just above a
  page's name tag (`touch(x, y, strict)`).
- Signal detector (episode 4): tap to move the detector there, tap the detector
  itself to check that spot; the game's scroll arrow switches room halves.
- 法廷記録 and もどる tabs appear on the screen only in states where the game
  reads R/B but draws no prompt of its own. The game reads R for the court record
  on every dialogue page while its menu is enabled (court, investigation text, a
  press conversation, a psyche-lock's dialogue) and in the investigation menus, so
  the 法廷記録 tab shows in all of those: top-right over a page of text, bottom-right
  in a menu. It is absent while the game has its menu disabled and where the game
  draws its own R prompt (a statement's or a lock's つきつける).

**The game picture did not take taps at all until 2026-10-01.** The canvas sat under a
stylesheet rule copied from the CRT overlay (`pointer-events:none`), so a tap on the
picture reached only the reader's "continue" handler and counted as A; of everything
above, only the reader's own tabs and choice lines worked. The engine-level `touch()`
probes and the playthrough players call the engine directly and so never showed it; it
showed up in real use at the court record, where no tap moved the list or opened the
people page. The canvas now takes taps, and
`tests/browser-gyakuten-touch.mjs` taps each native screen with real touch events in a
real browser. Touch behaviour must be checked there, not only at engine level.

Each tap resolves against live native state (process, sub-state, visible sprite
rectangles, cursor variables) and becomes the native input the game expects.
In 調べる and script spot selection the pointing hand is placed so the game's own
hit box (4×16 at the hand, or 12 pixels right of it on the right half; 4×4 at +12
for spot selection) is centred on the tap. Wide rooms scroll with the game's own
scroll arrow on the investigation screen; examine targets include animated
objects, which the game hit-tests against the animation rather than an area.
Desktop keys: arrows, Z/Enter (A), X (B), A (L), S (R), Q (Start).

## Starting any case

The advance menu lists each episode under the game (titles decoded from the
game's own episode-title text at import). Choosing one boots the cartridge,
passes the title screen and selects that episode on the game's own episode
select, with all episodes made available there, so no case depends on another.
Entries are excluded from the save signature, so adding them kept existing saves
valid. Checked headlessly (all four reach their first scene in about 2–3 s) and
in Chromium (episode 2 from the menu).

## Saves and progress

Reader saves are machine snapshots (≈220 KB JSON after packing, ≈10–20 ms).
Restores are deterministic (identical frames and RAM afterwards). Persistent
progress is the cartridge's own save memory (episode unlocks), stored as the
reader progress record. Autosave runs at each text boundary.

## Evidence

| Check | Result |
| --- | --- |
| Synthetic machine tests | `tests/gba-machine.test.mjs`: 11 (Thumb/ARM execution, BIOS division and LZ77, IRQ dispatch, PPU BG/sprite, snapshot packing; busy-wait skipping equal to stepping, timer overflows and timer reads under batching, undrawn frames, sound output rate) |
| Core equivalence (private, `private/gs-series/core-diff/`) | The optimised machine was run beside the previous one from boot and from 16 saved states across GS1, GS2 and GS3 with scripted random input, with and without picture and sound: 76 runs, 304,000 frames, the same registers, memory, timers and DMA state after every frame, the same picture on every frame, and the same sound apart from PSG envelope steps landing a sample apart (largest difference 0.017 of full scale). Across those runs it is 3.8 times faster with picture and sound (2.2 to 4.5) and 6.1 times without (2.3 to 14), by the median. GS1 episode 1 replayed by the playthrough player gives the same 709 pages in the same 89,354 frames on both cores (35 seconds instead of 200) |
| Series engine tests | `tests/gyakuten-native.test.mjs`: 11 on a blank machine (paragraph delay by process, per-edition choice cursor, record prompts named by tile, carousel episode select, detector minigame touch only in its input phase, the record tab on every dialogue page where the game reads R, segmented saves, the court record's input ownership and arrow strips, the save prompt's plates, taps that come through the text box area) |
| Headless native read | Title → episode 1 opening and trial pages match the static script decode; choices, timed pages and empty waits handled |
| Touch (engine level) | Episode select, investigation actions, move menu, examine, court record browse/back, cross-examination press/present all driven by `touch()`. Touch-only probes from saved states (`private/gs-series/touch/`): cross-examination and court record 22 of 22 checks (statement arrows, press, present, the record's ▶ / R / A / B prompts, the 法廷記録 tab on a press conversation and the way back), psyche-lock prompts 8 of 8, the 法廷記録 tab on an investigation text page and back 6 of 6. The game takes no input until it has drawn a statement's prompts, so a tap before that does nothing, as on the cartridge |
| Touch (real browser, touch events) | `tests/browser-gyakuten-touch.mjs` resumes saved states in the reader and taps what the game draws with real touch events, reading the result from native state: 19 of 19 checks. Cross-examination 7 (the ▶ and ◀ arrows at the ends of the text box, a tap on the statement text does nothing, a tap on the picture moves on, the present prompt opens the record, the record's own back prompt returns, the press prompt starts its conversation), investigation 7 (examine button and a spot, back tab, move button and a destination plate, the new place, the record tab and back), psyche-lock 3 (present prompt, the record's back prompt, stop prompt), save prompt 2 (taps beside the plates do not answer, the second plate answers). The same test passes 16 of 16 on GS1 and 23 of 23 on GS3 |
| Browser | `tests/browser-gyakuten-native.mjs` (Chromium, any edition), 11 checks: live frames, no off-screen controls, 30 pages whose DOM text equals the native page, word selection, text-box taps, the court record opened over a page (its own R prompt and arrow strip take taps, the page stays), previous line, phone-size fullscreen, the CRT display on the live picture (it switches on, the game keeps drawing and taking taps under it, and off again), reload resume, episode 2 from the menu |
| Audio | APU capture of the court scene shows tonal music (440/880/1760 Hz peaks) |
| Speed | In Node on this host, a court scene with music: ≈900 frames/s with picture and sound, ≈2,400 without (real time needs 60) |
| Slow-device check | `tests/browser-live-performance.mjs` (table above) |
| Automated playthrough (headless, `private/gs2/native/autoplay.mjs`) | All four episodes clear start to finish through native input only: episodes 1–3 (1,470 / 5,412 / 9,916 pages, including psyche-locks, examinations, animated and wide-room targets) and episode 4 in one uninterrupted run to the true ending and credits (11,135 pages over 178 minutes: the signal detector, 82 psyche-lock actions, 95 choices, 71 presentations, one lost trial retried). Private logs: `private/gs2/playthrough-v7` to `-v10`. Re-run on 2026-10-01 with the faster core and the current engine and player (`playthrough-v11`, plus episode 1): all four clear again, in 1.4 / 11.8 / 25.1 / 23.1 minutes with 1,462 / 5,446 / 14,095 / 11,135 pages. Episode 4 is the same run page for page (82 lock actions, 95 choices, 71 presentations, one lost trial). Episode 3 retried 27 lost trials instead of 14, because the player's order of trying answers changed after the first run; the first two episodes differ by a few pages for the same reason and because the "evidence added" message is now a page of its own |

## How the automated playthroughs work

The private players (`private/gs2/native/autoplay.mjs`, and `private/gs-series/autoplay.mjs`
for GS1 and GS3) drive the reader engine headlessly with the same taps and keys a person
uses. They decide from the game's own tables and RAM (court and investigation present
tables, psyche-lock data, examination, talk and room data) and search where those do not
settle a decision:

- Investigations try each action from a machine snapshot and keep the ones that change the
  game's progress.
- The series player also keeps a snapshot at each answer, each presentation the table does
  not settle and each press; a penalty or a lost trial returns to the latest of these that
  still has an untried option. The GS2 player retries a lost trial from its start with the
  next combination of answers.

So a reported clear is a complete path of native inputs from an episode's start to its
ending, found with save-state search; it is not a blind first-try run. A clear is counted
only when the game itself moves on: the next episode's first scenario, or after the last
episode, the credits and the title with no game-over on the way.

## Limits

- Timing is approximate (instruction costs, no prefetch model); no hardware comparison.
- APU approximations: PSG wave RAM banking simplified; no measured comparison.
- Real Web Audio is not exercised on this host (no sound device: a worklet never
  starts there). The audio pacing is exercised against a simulated real-time output;
  the other browser tests run without sound.
- Phones: no phone has been measured. The court record's touch controls had one
  informal check on a phone after the 2026-10-01 fix; the speed and sound
  changes of the same day have only the slowed-browser measurements behind them.
- The CRT display works on the live picture with flat geometry only (no curvature or
  overscan), because the DOM text has to stay in the game's own text box. Its GPU cost
  on a phone is not measured.
- Only the text box and choice lists are DOM text. The court record's item names and
  descriptions, the save prompt and the other panels are the game's own pictures:
  they cannot be selected or looked up.
- Speaker names come from reviewed nametag images; the name tag itself is shown
  as the game's graphic.

## Commands

```sh
python3 -m vnkit import 'Gyakuten Saiban 2 (Japan).gba' --out private/gs2/import-vN   # exits 3
python3 -m vnkit validate private/gs2/import-vN
node --test tests/gba-machine.test.mjs tests/gyakuten-native.test.mjs
sh scripts/browser-env.sh node tests/browser-gyakuten-native.mjs private/library/gs2-live private/browser-tests/gs2-native-vN 30
```
