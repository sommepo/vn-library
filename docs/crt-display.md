# CRT display and console library

Open **CRT** in the toolbar, or **Library → Display / CRT**. Enable the filter,
choose a preset, then close the panel to see the artwork at full size. CRT is off
by default. Preferences stay in this device/browser's `vnkit.crt.v1` localStorage,
independent of save slots, route progress and activity. The Dim control still
changes the surrounding reader chrome independently.

Presets: Soft living-room CRT, RGB studio monitor, Warm slot-mask television,
Fine shadow mask (4K), 240-line arcade, and Clean tube (no mask). Any individual
change selects Custom tuning. Reset this preset restores its values; turning CRT
off removes the shader immediately. Layered scenes still use an unfiltered
native-resolution composition, so body/face joins survive fractional scaling. A scaled live preview shows
only the currently loaded scene, never future text or route images. Use the actual
full-size game window to judge phosphor detail: scaling a preview changes masks.

## Implemented rendering

`web/crt.mjs`, `web/crt-shaders.mjs` and `web/crt-settings.mjs` are original MIT
code. The WebGL 2 pipeline uses a native-resolution graphics capture, horizontal
and vertical Gaussian glow passes, then a final CRT pass:

- Gamma-decoded light calculations, brightness-dependent Gaussian beam width,
  adjustable virtual scanline count and intensity. Footprint-based smoothing
  reduces scanline aliasing when the window has insufficient output pixels.
- RGB aperture grille, staggered slot and shadow masks, adjustable strength and
  complete RGB triad pitch in physical framebuffer pixels.
- Separate bloom and halation amounts, glow radius, red/blue convergence offsets,
  sharpening, input/output gamma, brightness, saturation and warm/cool balance.
- Screen curvature, optional overscan (which crops edges), rounded corners,
  vignette and optional static fine grain. No animated flicker/noise by default.
- RGBA16F glow buffers when `EXT_color_buffer_float` is available; RGBA8 fallback
  otherwise. The final output is ordinary SDR, not HDR or an ICC calibration.
- Device-pixel-density output, capped at 1080p, 1440p or native display pixels up
  to 4096 pixels wide / 2160 high and the GPU's texture-size limit. It never changes
  extracted image files. A 4K preset cannot create a 4K display on a small screen.

The source capture preserves positioned image layers, clipped atlas frames,
2D transforms, parent opacity, image fit, stacking and the PS2 source-alpha
correction. Percentage positions and sizes resolve directly into source pixels;
never use integer `offsetLeft` / `clientWidth` for the capture. Those introduced
portrait seams at fractional browser sizes. `native-screen` joins layered artwork
before scaling even when CRT is off; `crt-screen` adds the shader when enabled.
The source DOM remains for animation updates and fallback. The capture excludes
both output canvases, and observers ignore their own output mutations.
PS2 alpha-adjusted bitmaps have an LRU capped at 32 MiB / 64 entries (when that
source filter is required). This does not preload unseen scenes or alter files.
The existing detached-scene decoding/atomic portrait update remains
in charge of asset readiness. Dirty scene mutations and resizes request redraws;
static pages do not run a continuous render loop. Hidden tabs pause drawing.

Japanese dialogue, choices, speaker labels and the reader chrome remain DOM text
above the filtered graphics. They are **not rasterized or curved**: normal copying,
selection, dictionary interaction and text output retain their existing behavior.
Native calendar and other artwork overlays are part of the filtered plane.
Movies retain their original player and controls without CRT, then filtering
resumes. The library menu uses its own subtle CSS texture and original blue
orb/tower decoration; the game-art WebGL renderer does not capture dialog UI.

## Live game screens (2026-10-01)

Games that run original cartridge code (the GBA Gyakuten Saiban readers) draw their
own picture on a canvas instead of placing images in the art plane, so the capture
above found nothing to filter and the CRT never switched on for them. The display
now takes that canvas as its source:

- `CRTDisplay.refreshLive` engages when the art plane holds a `canvas.live-screen`;
  the live host calls `frameReady()` after each frame it draws, and the three passes
  run on that frame. The GPU is asked for errors only on the first frame of a run.
- The live canvas stays in place under the CRT picture, unseen (`opacity:0`), and
  keeps taking taps; the CRT canvas never takes pointer input.
- The raster has one scanline per line of the game's picture (160 for GBA), whatever
  the Rows setting says, and the geometry stays flat whatever curvature and overscan
  say: the game's text is DOM laid over the picture and has to stay in its box.
- A handheld picture is magnified many times, so plain linear sampling would smear
  each of its pixels. The screen shader's `pixelEdge` keeps the inside of a source
  pixel flat and narrows the blend between neighbours to about 1.5 output pixels.
  For every other source it is 1 (plain linear, as before).
- Platform defaults live in `crt-settings.mjs` (`platformCRT`). The GBA ones are off
  until enabled, then scanlines 0.75 with a tight beam, a light aperture grille and
  glow, no convergence error. The first GBA defaults (flat, no mask, no glow) only
  blurred once the filter ran; settings still equal to them are replaced, tuned ones
  are kept. All six presets work on a live screen with the same two overrides.

Checked in Chromium with software WebGL 2 (`tests/browser-gyakuten-native.mjs`): the
filter switches on, the game keeps drawing and taking taps under it, and switching it
off shows the plain screen again. GPU cost on a phone is not measured; if a device
struggles, the Quality setting lowers the output resolution, and the live host drops
drawn frames before sound.

## Limits and troubleshooting

This is an original three-pass CRT treatment, **not a port of CRT-Royale or a
MiSTer display core**, and no quality-equivalence claim has been established.
No composite/RF signal decoder, true interlaced-field reconstruction, rolling
scanout, persistence simulation, external RetroArch shader-preset loader, HDR or
physical-display calibration is implemented. Curvature affects artwork only.
Exact integer source scaling is not forced; the adaptive beam remains useful in
responsive layouts. Individual native animation fidelity is still governed by
the existing game adapter's limitations.

If WebGL 2 fails, the reader shows an explicit status and the original artwork.
GPU context loss also falls back to unfiltered native composition; restoration rebuilds GPU resources. Check browser
hardware acceleration, or leave CRT off. If motion is slow, choose 1080p and a
lighter preset. Masks should be judged at full size on the actual screen, not a
resized screenshot. CRT does not start network requests beyond existing local
asset loading, modify VM state, publish dialogue or change reading totals.

If native composition itself fails, an explicit status appears and separate DOM
image layers remain available. DOM fallback may show fractional-scale seams.

Only Chromium software-WebGL and responsive mobile viewport tests have been run
here. Physical Windows PC GPU performance, Firefox/Android GPU behavior, actual 4K panel
appearance, Yomitan interaction on those devices and comparison with hardware
CRTs/RetroArch/MiSTer remain user-device checks.

## Library visibility and runtime files

The original console-style library uses `web/console-menu.css`. Keyboard arrows
move between menu buttons; Enter confirms; Escape returns to the reader. Reduced
motion preferences disable the orb animation. Disc compatibility details and
completed-route names sit behind expandable summaries. Endings still save
progress and open the menu; load failures remain visible inside it.

A local `.hide-from-library` file inside an import folder hides it from the menu.
Removing that marker restores visibility. Assets and existing direct content URLs
remain available: this is a reversible presentation setting, **not access control**.
Pia's three existing import folders are hidden this way; its source and adapter
were not modified.

**The ISO is not required for reading after import.** The server reads the
standalone `private/library/clannad-live` package, containing scripts, images and
converted media; this live import has no symlinks back to the ISO. Keep that
folder and the toolkit to run the reader. Keep the ISO safely backed up for a
rebuild, additional conversions or continued format research. Browser saves,
global progress and activity are separate: export all three for backups.

## Verification

```sh
node --test tests/reader-crt.test.mjs
python3 -m unittest discover -s tests -p 'test_server.py' -v
VNKIT_CHECKPOINTS=private/clannad/menu-audit/checkpoints-final VNKIT_REPORT_DIR=private/browser-tests/new-crt sh scripts/browser-env.sh node tests/browser-crt.mjs
VNKIT_CRT_PRESET=soft VNKIT_CHECKPOINTS=private/clannad/basics-audit/browser-checkpoints-v1 VNKIT_REPORT_DIR=private/browser-tests/new-crt-basics sh scripts/browser-env.sh node tests/browser-clannad-basics.mjs
```

The private CRT harness exercises all six presets on a source-reached CLANNAD
portrait/date scene, checks nonblack and distinct output, preserved story/history,
selection, reload, off, context loss/recovery, no-WebGL fallback and mobile layout.
Its separate original synthetic compositor fixture checks atlas clipping, alpha,
stacking and rotation; it is not additional game coverage. Screenshots and actual
checkpoints remain under `private/`, outside distributable packages.
