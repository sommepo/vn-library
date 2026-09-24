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

`web/platforms.mjs` owns the two supported environment identities, filtering,
selector and original PC-9800 library. The selector appears in the player toolbar
and each panel header; left/right keys on it switch machines. Selection persists
in `vnkit.platform.v1`. Direct game links use the game's platform. Leaving an
active game's library returns its skin without discarding execution or saves.
There was no existing gamepad layer to preserve; controller mapping is still
unimplemented and is not covered by the keyboard tests.

PS2 uses the existing orbit/towers and collapsing title list. PC-9800 uses a
separate 640×400 two-pane composition: compact title list, details/actions panel,
bottom command strip and hard-edged opaque frames. The composition and all its
graphics are original CSS/DOM. It contains no game, NEC firmware or OS artwork.
Small screens reflow the panels rather than hiding commands outside the viewport.
`web/pc98.css` also styles shared settings, statistics and save panels. UI tint
settings do not turn those panels back into translucent PS2 chrome.

The design uses measured source dimensions and period characteristics, including
640×400 composition, restrained colour and compact framed panels. A contemporary
software developer's [PC-98 CAD history](https://afsoft.jp/cad/cad/005.html)
corroborates the display modes and transition from eight colours to sixteen out
of 4096. The owner's native YU-NO display provides the game-specific reference;
it is not copied into global menus. Public synthetic screenshots establish UI
behaviour, not YU-NO visual equivalence.

Display preferences remain per device. PS2 retains `vnkit.crt.v1`; PC98 uses
`vnkit.crt.pc98.v1`, starts unfiltered, and defaults to 400 rows with no curvature,
overscan, convergence or mask. PC98 artwork uses nearest-neighbour display and
whole source-size multiples where the available area permits. Smaller viewports
fit the whole source frame. These settings do not touch story or learning state.
More flexible PC98 scaling controls and a redistributed bitmap font remain work
to do; the current shell uses available system fonts with compact metrics.

The generic entry is **Add game / Import media**. PS2 still uses the tested ISO
workflow. The PC98 panel explains CUE/BIN input and reports that playable import
is not ready; it does not submit those files to the PS2 importer. See
[YU-NO findings](yuno-pc98-investigation.md).

## Checks

`tests/browser-platforms.mjs` creates two original synthetic games in a temporary
library, a separate save bank and clean browser profiles. It checks filtering,
selection persistence, direct links, returning from a game, resume continuity,
independent CRT settings, keyboard selection and portrait/landscape panel bounds.
It also checks all three existing PS2 cards against an older catalogue response
without platform metadata, using synthetic cards rather than private game data.
It passed in Chromium and Firefox. `tests/reader-platforms.test.mjs` and
`tests/test_platforms.py` cover metadata and invalid/missing platform input.
Commercial PS2 regression tests remain separate from these synthetic checks.
