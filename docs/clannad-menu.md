# CLANNAD menus, progress, date and sound test

September 19, 2026; SLPM-66302 v1.01 only. Import revision 0.3.1 retains
runtime/save signature `498c15ab`. Source scripts, image pixels and audio are
unchanged. No manual edits are made to the user's existing browser data.

## Reader behaviour

At an actual END_/RTMN/RTM_ boundary, including one reached with **Next choice**,
the reader persists G and opens **Ending reached · Main menu**. **Start again**
starts the original School Life entry with fresh F/Z and retained global progress.
**AFTER STORY** appears under the original title gate. Loading an ended autosave
opens this menu too. Current earned completions are listed; bad endings do not
invent a good-ending flag. The menu lists only completed routes; the explicit
**Route progress / debug…** screen reveals the full named checklist.

**Read / resume**, **Start again** and save loads have visible loading feedback.
A load error appears inside the open menu as well as the reader status area.
Failed content/script/image loading retains the previous position and manual
slots. Another open reader tab produces an actionable ownership error. Network
fetches and image decoding have 30-second bounds. The loading state serializes
story operations. Wait timers start after the current operation releases its
busy flag; otherwise a zero-duration native wait could fire too soon and stall.

The renderer builds a detached composition, decodes every image, and commits the
whole composition in one DOM replacement. The previous complete scene stays
visible while a slower body/face/background/date request completes. Native scene
mounts are prepared in the same detached tree. Loading errors never commit a
partially decoded portrait. A blue orbit replaces visible artwork-loading text.
The subsequent renderer composes body/face in exact native pixels before scaling,
including with CRT off; see [CRT/compositor maintenance](crt-display.md).
Extracted source art remains unchanged.

## Completion and manual progress

`web/adapters/clannad-progress.mjs` owns edition-specific completion meanings;
the generic reader never embeds CLANNAD globals or script IDs. Native G flags
already record most completions. Ryou has no dedicated G clear flag: reaching
`SEEN3505.MZX:00008fa9` records that specific ending separately. Shared native
credits flag G41 is not a character-specific clear flag.

| Completion | Native cells / evidence |
| --- | --- |
| Nagisa | G1, SEEN6514:4db5 |
| Fuko, School Life | G2, SEEN1518:5e86 |
| Tomoyo | G3, SEEN2514:11eda |
| Kyou | G4, SEEN3514:19fd0 |
| Kotomi | G5, SEEN4800:f67 |
| Yukine | G6 completion, G30 light, SEEN5430:29b96 / 26d44 |
| Sunoharas | G9, SEEN7400:5dec9 |
| Kappei | G12, SEEN7600:36923 |
| Misae | G13 completion, SEEN7500:30048 |
| Misae's light in Tomoyo's route | G31, SEEN2511:a7d8 |
| Koumura | G15, SEEN7300:4754 |
| After Story character lights | Sanae G8; Yoshino G11; Naoyuki G14; Kouko G10; Akio G7 |
| Fuko's returned light | G33; repays earlier G32 consumption |
| After Story first / true ending | G35 / G45 |

Title initialization at `0x144860..0x144a58` and transition `0x14568c..0x1456c8`
require G1/2/3/4/5/6/9/12/13/15 plus G30/31 for stage 2. G45 enables stage 3.
The original After Story entry is SEEN6800 (`0x129c24..0x129c4c`). This agrees
with the overall progression described by the user's [StrategyWiki walkthrough](https://strategywiki.org/wiki/CLANNAD/Walkthrough)
and [After Story guide](https://strategywiki.org/wiki/CLANNAD/After_Story), but
the PS2 executable, not a generic orb-count shortcut, controls this adapter.
The direct guide fetch returned 403; its search-indexed walkthrough and linked
pages were consulted. No guide prose, route script or upstream code was copied.

**Mark complete** explicitly changes this browser's persistent native flags and
records a `manual` provenance/timestamp. It does not execute/read that route or
change learning totals. The additional Misae light has its own checklist row;
Misae's route ending alone does not earn it. Ryou is optional for After Story.
Each newly set native light cell adds to G0 once. Manually restoring Fuko's
returned light also records the earlier consumed-light event when absent, so it
cannot manufacture an extra fourteenth light. Previously earned unrelated globals
and transferred story decisions G50..63 are preserved; debug completion does not
fabricate Nagisa's earlier choices or simulate the transfer prompt.

Manual marks and Ryou's reached ending live in the optional `completions` field
of the version-1 `vnkit.progress` record. Ordinary slot loads retain the current
progress record. Back up **Export global progress** as well as saves and Activity
JSON. A before-change progress snapshot is retained before each manual update,
and can be exported from the debug screen. **Saves → Import global progress**
restores a backup explicitly, after game/signature validation and confirmation.
A wrong-game record is rejected without mutation. Standalone older saves cannot
reconstruct historical Ryou endings they never recorded; use the manual checklist
for progress from another reader or device.

## Original date badge and sound test

The importer reads the 63-entry DDAT lookup at `0x20ce80`, used by dispatcher
`0x14b720`. All 63 SDTA/SDTB colour/mask MRG badges were already decoded without
resampling; they are now mapped in `nativeData.calendar`. The adapter draws the
actual badge upper left with the native 10-pixel offset (`0x3bf0c8`). F1112
controls visibility (`0x14f010` → `0x12d6a0`); dates outside that table, including
the shipped SDTA4999/SDTA0800 leftovers, have no badge. Original day-transition
animation, some transient native visibility and PS2 screen/overscan comparison
remain unverified; the badge itself is original ISO artwork. No screenshot
pixels, replacement calendar or system-clock date are used.

**Main menu → Sound test** lists all 53 imported BGM entries, including variants
and vocal tracks, using the native internal music names. All are deliberately
available as requested; this does not pretend to reproduce the original locked
music room. The player supports seek/pause, Stop and source-loop repeat, uses the
music volume, and suspends current game audio while open. Closing it stops the
test player and resumes prior audio. No story instructions, completion flags,
text events or reading characters are generated by sound-test listening.

## Validation and reproduction

```sh
node tests/clannad-menu-checkpoints.mjs private/library/clannad-live private/clannad/NEW-menu-checkpoints
VNKIT_CHECKPOINTS=private/clannad/NEW-menu-checkpoints VNKIT_REPORT_DIR=private/browser-tests/NEW-menu sh scripts/browser-env.sh node tests/browser-clannad-menu.mjs
VNKIT_CHECKPOINTS=private/clannad/basics-audit/browser-checkpoints-v1 VNKIT_REPORT_DIR=private/browser-tests/NEW-basics sh scripts/browser-env.sh node tests/browser-clannad-basics.mjs
node --test tests/reader*.mjs tests/clannad-vm.test.mjs
```

Checkpoint generation follows the original first-option path: **5,320 logical
segments, 28 choices, Misae completion**. Timing/media are simulated; it is not a
new full-route browser run. The browser menu harness resumes that reached last
text and verifies the ending/menu/progress flow, delays a real portrait face
request, forces a failed content request, checks tab ownership, manual After Story
unlock/entry, all 53 soundtrack entries and actual vocal playback, backups and
mobile layout. Manual After Story testing is not evidence of naturally earning
all prerequisites or completing After Story. The separate basics regression
covers 100 real consecutive pages and both later-choice alternatives, 15 saves,
movie playback/restoration/resumption, immediate voice completion and progress.

Full validation still intentionally exits 3: 81 atlas/format entries, detailed
credits/MZD/montages, timing and complete route fidelity remain incomplete.
Original PS2 comparison, physical Z13/Android, Firefox and dictionary-extension
checks were not performed in this pass.
