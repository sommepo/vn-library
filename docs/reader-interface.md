# Classic reader and next-choice navigation

The reader uses original CSS inspired by the user's CLANNAD screenshot:
translucent slate/lavender dialogue, pale gold inset borders, white Japanese text,
a separate speaker nameplate. The surrounding player now matches the fixed blue
console-library style (`web/console-player.css`), with restrained cyan highlights.
The screenshot's English dialogue is not copied into game content. Date badges now come directly from the supplied ISO; see [CLANNAD menus](clannad-menu.md).
Source artwork retains its original proportions. Dialogue is a compact overlay
**inside the artwork in every orientation**, including portrait phones. The
reader fits the complete frame in the available viewport without page scrolling;
long dialogue scrolls inside the textbox. `web/layout.mjs` measures the space left
by the controls and sizes the frame; `web/layout.css` owns this responsive layout.
The earlier summer stylesheet remains an unused historical file;
`web/classic.css` provides the reader and companion page's colours and trim.

**Fullscreen** hides the surrounding bars and fits the complete source frame to
the screen, with letterboxing instead of stretching/cropping. The **☰** button
opens reading controls, including Saves, Backlog, Reading settings and Exit
fullscreen. Orientation and dynamic browser-bar height changes trigger a refit;
pinch zoom does not reflow the game. The operating system/browser controls whether
its own status/navigation bars disappear. The fullscreen request asks to hide
browser navigation but cannot force the phone's OS to do so.

Textbox height is capped at 38% of the artwork. Fonts scale with smaller frames,
with a 12px minimum; the font-size and line-spacing sliders remain adjustable.
Touch selection and scrolling stay within the dialogue without advancing it.

**Aa → UI colour / UI colour strength / UI opacity** changes the lavender
in-game surfaces: dialogue, nameplate, choices and fullscreen panels. The
non-fullscreen player bars, surroundings and panels keep their console colours.
Gold trim and source artwork retain their colours. UI opacity controls surface
fills, not the opacity of the Japanese text. The separate Textbox opacity setting
multiplies it for the dialogue/nameplate. Textbox opacity spans 0–100%; its
numeric combined alpha is applied directly for consistent Firefox rendering.
At zero the source artwork shows through while text and borders remain visible.
Reset UI colours restores lavender.
Preferences stay on this browser/device; the Live text companion follows changes
in the same browser. The blue console-library decoration stays blue.

Scene loads use a small blue orbit after 200 ms, with no visible artwork-loading
text. Reduced-motion preferences disable the rotation. The old complete scene
remains visible until every new image decodes; failures remain explicit errors.
Registered images use private HTTP caching with mandatory revalidation: unchanged
images return 304 without another PNG payload. First visits still transfer the
image, and revalidation still takes a network round trip. Scripts, saves and API
responses remain `no-store`; this is not an offline game cache.

Portrait body/face layers are joined in original source coordinates before the
result is scaled, with CRT both on and off. Fractional browser layout must not
round a face patch independently. See [compositor details](crt-display.md).

**Dim** in the top bar darkens the surrounding area and controls without dimming
game artwork or dialogue. It persists in this browser. The same setting appears
under **Aa → Darken the area surrounding the game**. Textbox opacity, Japanese
font size and line spacing remain adjustable. Existing personal settings remain
intact; new profiles default to 68% textbox opacity.

## Library and previous-line controls (2026-09-21)

Title actions are collapsed by default; click/tap a title or focus it and press
Enter to expand. The lower-left controller legend is removed. Sound test and
route progress/debug are accessible for CLANNAD and Remember11 even when another
game is active. Inactive-title menus load metadata and persistent progress, not
story execution, and do not create an autosave or study activity.

**‹ Previous line**, **Alt+Left**, or **Fullscreen ☰ → Previous line** restores
an actual earlier execution/media snapshot. It is session-local, bounded to the
most recent 60 checkpoints and 12 MiB of serialized text memory (large saves may
retain fewer). Reload, game changes and ordinary save loads clear this navigation
history. A choice jump retains its visible starting line, never skipped dialogue.
Rewinding across a choice restores the earlier story state so it can be chosen
again. Persistent route progress, read flags and study history are preserved;
the restored line is neither counted nor emitted again. Forward rereading remains
a new presentation. Rewind is disabled during global pause, loading, a choice
jump or a failed shared-save session. `web/rewind.mjs` owns the bounded history;
`web/app.mjs` uses the existing validated save/restore path.

Q.Save/Q.Load buttons and their shortcuts are removed. Existing quicksave records
remain accessible in Saves; the 15 regular slots and autosave are unchanged.
The fullscreen menu icon has no border or solid background and remains keyboard
focusable with a full touch target.

## Next choice

Use **Next choice »** or **Alt+N** to skip dialogue, including unread dialogue,
until the next actual choice on the current route. It does not select an option.
The separate **Skip read** mode still stops at unread text.

- The VM executes conditions, variables, calls, scene changes and native wait
  completion normally. Presentation delays are fast-forwarded. No filename/text
  search or guessed destination is used.
- Skipped dialogue is not displayed, copied, streamed, backlogged or marked read.
  Only the aggregate skipped-segment total changes; narrative characters and active
  reading time do not increase during navigation. The destination choice is
  presented once and emitted with `flags.navigation = "next-choice"`.
- Music resumes at the destination from its beginning. Persistent ambient loops
  follow source start/stop/channel instructions; passed one-shot effects and
  voices do not play. Fast-forward does not claim time-exact audio continuity.
- **Cancel jump** or **Esc** restores the starting execution/media state. Moving
  the browser into the background also cancels; reloading mid-jump resumes the
  starting position. A selected text passage blocks starting navigation.
- **Saves → before next choice → Load** returns to the pre-jump position, while
  preserving study history. That one automatic slot is replaced by the next jump;
  export it or use a manual slot to retain an older position.
- Movies, sound-only scenes, setup/input screens and script ends stop navigation
  for normal interaction. An unknown instruction, failed resource request or
  traversal limit cancels the jump and reports the original failure. No source
  instruction is bypassed to force a choice to appear.

CLANNAD now passes the former event-30/41 boundaries. The first-option path reaches a source ending, and Next choice opens the main menu there.
Its non-choice native animation input is acknowledged during explicit fast-forward.
Full routes remain unverified.

## Validation and maintenance

`web/navigation.mjs` owns traversal and persistent-effect reduction. The shared
reader owns cancellation, its automatic backup, media and presentation. Game
adapters retain every opcode and scene rule. `Activity.skipUnpresented` stores
only an aggregate and never accepts hidden script text.

```sh
node tests/reader-navigation.test.mjs
VNKIT_REPORT_DIR=private/browser-tests/clannad-navigation-new sh scripts/browser-env.sh node tests/browser-clannad-navigation.mjs
```

The original synthetic tests cover branch/call/state parity, save restoration,
cancellation, unknown controls, traversal bounds, audio-loop replacement and
statistics. The private Chromium test compares actual CLANNAD VM state with
ordinary advancement for both first-choice branches, checks external WebSocket
output and activity, cancellation/reload/backup behavior and responsive screenshots,
and historically verified the former source failure after nineteen choices (that stop is now supported). Fast-forwarded pages
are **not** added to consecutive reading coverage. Screenshots and source saves
stay under `private/`; device/Yomitan/original-console checks remain unverified.


## Save slots

Occupied slots include **Delete**, with a confirmation for the selected local or
shared save bank. Deleting a position keeps current story state, route progress
and activity. Autosave remains empty until story presentation resumes; see
[deletion and recovery details](shared-saves.md#delete-a-save-slot).

Saves has **15 manual slots**, plus separate autosave, quicksave and before-next-choice
slots. **Saves → Save location** chooses this device or the private home server;
see [shared saves](shared-saves.md) for opt-in migration and backups. Existing slots 1–6 keep their keys and contents. Slots default to this browser. Shared mode stores them on your own server,
with a separate local bank preserved. Use each slot's Export and Import save
for transfers/backups; export activity JSON separately under Reading activity.

Older saves halted inside a newly supported instruction can resume on reload.
If the reader encounters a still-unsupported instruction, it now keeps the last
visible page and execution state usable for saving/loading. No failed instruction
is bypassed; the error still identifies the exact source boundary.


## Route progress and subsequent playthroughs

CLANNAD now retains earned global progress across **Start again** and loading
older slots. F/Z local state and the route PC/stack still come from the selected
save; G uses current persistent progress. **Saves → Export global progress** backs
this up independently. Keep that file with exported game saves and Activity JSON.
Importing a progress backup explicitly replaces this game's globals after a
compatibility check and confirmation. AFTER STORY appears in Library only after
the original title conditions unlock it. Actual earned unlocking is not yet
verified by a completed route campaign; its rules and transfer prompt have unit tests.

See [current menu/progress/date/sound-test controls](clannad-menu.md). Read/resume and Start again now report loading and visible menu errors. Manual route marks remain distinct from earned completions.


## Console library and optional CRT

Library now uses an original blue console-era menu. Pia is hidden via reversible
local markers; imports and saves are retained. **CRT** in the toolbar opens six
GPU-rendered presets and detailed beam/mask/glow/colour/geometry controls.
Japanese text stays selectable above filtered artwork. See
[CRT controls, supported effects and limitations](crt-display.md).
The imported package is standalone: the ISO need not stay in the reader folder.

Shared mode also stores global route progress on the home server; study history,
seen/read markers and display preferences stay device-local. Loading old saves
still retains the active bank’s current persistent progress.

September 20: dialogue advancement shows only ▸ (accessible name “Advance dialogue”)
on all devices. Touch/phone fullscreen removes the outer stage border and margins,
retaining safe-area insets, source proportions and the original dialogue/speaker
frames. Read text is red by default, configurable in Reading settings; see
`text-and-statistics.md` for completed-route assumptions and supported paths.

Global pause (September 20): **⏸ Pause / ▶ Resume** is on the bottom control bar;
fullscreen exposes **Pause playback / Resume playback** in ☰. It suspends music,
voice, effects, movies, source scene timers/animations, typewriter reveal and
Auto/Skip advancement, and excludes paused time from reading activity. Normal
advancement and starting/loading a game are blocked until Resume. Copy, backlog,
settings and saving remain available. Pausing is disabled during an in-flight
load or Next choice jump; cancel the jump first.

Resume retains the Auto/Skip selection and restores only media that was playing,
without restarting clips or counting paused time. A separately paused activity
timer stays paused. Save snapshots retain playback intent, so a temporary global
pause does not store permanently muted music. The pause toggle itself belongs to
the current tab and is not restored after a page reload.


## Empty reader and light surroundings (2026-09-21)

Before a game loads, the player shows only the library's orbiting lights, with
no placeholder Japanese logo, textbox or reading controls. A failed load keeps
its visible error and library recovery controls. Settings omit repeated
explanations of selection behavior; interaction protections are unchanged.

**Dim** now switches the outer player from a pale blue/silver light mode to dark
blue. **Light** restores it. Source graphics and dialogue keep their independent
settings; the main library retains its dark BIOS styling. Colours remain fixed
per mode rather than following UI hue/opacity sliders. The library includes
[Add game / Import ISO](import-gui.md).

## Compact library menu (2026-09-24)

The library uses compact grey titles, cyan focus and quiet orbiting lights on
a near-black background. Disc numbers sit beside titles; actions stay collapsed
until opened. Arrow keys ignore actions inside collapsed titles. Mobile rows
retain a 44-pixel minimum target. Menu music controls remain at the lower left.

PC-98 tabs, theme loading and import hints are removed from the active UI for
now. A stored PC-98 preference falls back to PS2. The parked research, platform
metadata and dormant compositor support are preserved; this is not new support
for PC-98 games. Script waits display 「まってください」.

Library titles form one accordion: opening another title closes the previous
one first. `web/library-accordion.mjs` retains native details/summary keyboard
semantics while animating measured height and a small content fade/slide. Rapid
taps retarget from the painted position; closing actions are inert. Resize
retargets the measurement, leaving the panel cancels its animation work, and
reduced-motion settings use immediate transitions. Nested progress and disc
information disclosures remain independent inside the one open title.
