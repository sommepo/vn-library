# Platform environments

Each new import declares `platform: {id, name}` in `content.json`. The catalogue
passes this metadata to the browser. `vnkit/platforms.py` labels only a small
exact-ID list of older PS2 imports; adapter names and filenames are not evidence
for platform identity. Unknown imports are not assigned to PS2 by default.
Metadata is outside the existing execution/save signature; do not rewrite saves
to change a menu's appearance.

The browser carries the same exact-edition bridge. Static files can update while
a running Python service still returns a catalogue without `platform`; known
existing imports must remain visible in that case. Restart the reader service
after backend changes. Do not label arbitrary unknown titles as PS2.

## Active library environments

`web/platforms.mjs` owns platform identities and filtering. The library header
switches between **one** (PS1), **two** (PS2), **portable** (PSP) and **advance** (GBA); left/right keys on that selector
switch platforms. Selection persists in `vnkit.platform.v1`. Direct game links
use the game's platform. Closing the library returns to an active game's platform
without changing its execution or saves. PC-98 presentation and research remain
parked; a saved PC-98 preference falls back to PS2.

PS2 retains its compact BIOS-inspired orbit and collapsing title list.
`web/psp-library.mjs` and `web/psp.css` add an original XMB-inspired PSP library:
soft plum/lavender colour, slow SVG waves, white line icons and a local clock.
Settings, Games and Add game form the horizontal row; games and their actions
sit below it. Labels stay short, game actions collapse, and an empty collection
shows no sample or invented titles. The header uses the user-supplied logo; the shell contains no firmware assets.

The PSP view supports mouse, touch, Tab, left/right category navigation and
up/down item navigation. Enter opens a title's actions. Reduced motion disables
the waves and category transitions. Phone portrait and short landscape layouts
keep the category row visible with a separately scrolling item list. Settings
reuse the reader's display, reading and menu-music controls. Existing per-platform
CRT preference storage stays separate from saves and learning history.

**This is a frontend, not playable PSP game support.** The local `428-psp`
registration is [static recovery only](428-psp-investigation.md); no PSP edition
is admitted to browser import. Add game states that PSP imports are not supported yet and does
not upload a PSP ISO to the PS2 importer. A later adapter must establish exact
edition recovery, execution and validation before admitting a playable import.
The shared reader can display original synthetic PSP-tagged content in tests;
those checks do not establish commercial PSP compatibility.

## one: PSone-inspired frontend

`web/psone-library.mjs` / `web/psone.css` provide a minimal grey-grid menu with
original CSS disc/card shapes, ochre/red labels and a purple selection pointer.
The two categories are Games and Settings. Game actions collapse; the empty
library shows only “No games yet” and Add game. Keyboard category/item navigation,
touch, phone portrait/landscape and independent platform preference storage use
the same shared reader contracts as portable. No animation is required.

The visual reference is the grey-grid menu shown in this
[PSone photograph](https://ameblo.jp/sasaplus1/entry-12857299244.html).
The shell uses no firmware artwork. Its header includes the separately supplied
logo, shared by one, two and portable; see provenance.md.

Exact PS1 CUE/BIN readers are available for [Memories Off](memoriesoff-runtime.md),
[Otogirisou](otogirisou-runtime.md) and [Kamaitachi](kamaitachi-runtime.md).
Their guides explain local conversion dependencies and support limits. Add game explains the local
import route and performs no upload. `ps1` metadata only selects the
frontend; it does not admit an edition or choose an emulator. The default remains
two, and existing saves/activity are unchanged. Synthetic PS1-tagged reader tests
establish UI behavior only.

The top-right selector uses translucent glass surfaces and a sliding selection
indicator. Platform changes crossfade the environments; reduced-motion settings
disable those transitions. The transparent logo is shared across all three.

## advance: GBA-resolution frontend

`web/gba-library.mjs` / `web/gba.css` draw the library as a native 240×160 frame
on a canvas: Games / Settings / Add game tabs, a bordered list window, a cursor
and a control hint. Text is rasterised 1:1 and thresholded to on/off pixels, and
every colour is 15-bit (channels in steps of 8), as on GBA hardware. The frame is
magnified by whole-number factors when 2× or more fits; smaller phone screens
fit exactly (fractional, so pixel widths vary slightly). No console body, bezel,
firmware art or platform logo is drawn; the header keeps only the platform
selector and Close. Transparent real buttons lie over each drawn row, so
keyboard, pointer and assistive technology use DOM controls while the canvas
draws focus. Settings holds Display, Reading, menu music on/off, volume (steps of
10%) and the music credit.

GBA content is 240×160. `layout.mjs` scales it by whole-number factors (as for
PC-98) and `gba.css` samples stage images nearest-neighbour. The per-platform
display preference `vnkit.crt.gba.v1` defaults to CRT off; switched on, a live
game screen gets one scanline per line of its picture, a light mask and flat
geometry (see `docs/crt-display.md`).

[Gyakuten Saiban](gs1-gba-runtime.md), [Gyakuten Saiban 2](gs2-gba-runtime.md) and
[Gyakuten Saiban 3](gs3-gba-runtime.md) run natively under advance (local
import): the game screen is the touch controller and its text is DOM. Add game says
cartridge imports use the local importer and uploads nothing. Synthetic
GBA-tagged reader tests establish UI behaviour only.

## Checks

`tests/browser-platforms.mjs` uses original synthetic content in a temporary
library, a separate save bank and a clean browser profile. It covers PS2 legacy
metadata, the parked PC-98 preference, PSP filtering and persistence, keyboard
navigation, synthetic reading continuity after switching platforms, settings,
the unavailable PSP import boundary, reduced motion and mobile panel bounds. The
advance section covers GBA filtering, persistence, keyboard categories, whole-number
240×160 scaling, synthetic resume, the import notice and phone/landscape bounds.
Set `VNKIT_BROWSER=firefox` for Firefox and `VNKIT_REPORT_DIR` for private output.
`tests/reader-platforms.test.mjs` and `tests/test_platforms.py` cover metadata and
invalid/missing platform input. Actual-game reader regressions are separate.

## Parked PC-98 work

`web/platforms.mjs` retains the original PC-9800 menu helper, and `web/pc98.css`
retains the separate desktop styling. Neither is enabled in the active UI.
PC-98 metadata and the 640×400 reader layout remain available for future work,
with independent `vnkit.crt.pc98.v1` preferences and integer scaling where it fits.
See [YU-NO findings](yuno-pc98-investigation.md). Do not equate the parked synthetic
UI checks with a playable YU-NO adapter.
