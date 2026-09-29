# Kamaitachi no Yoru: Tokubetsu-hen — PS1

**SLPS-01794, Japanese single-track MODE2/2352 CUE/BIN.** This experimental
reader appears under **one**. Exact executable and SYSTEM.CNF hashes identify
the edition; no other revision is admitted.

## Import

Follow the [shared sound-novel import guide](chunsoft-ps1-runtime.md#local-import)
and [PS1 media tool setup](ps1-media-tools.md). You need Node.js 22+,
FFmpeg/ffprobe, FluidSynth and the exact-VAB VGMTrans build. Browser Add game
does not accept CUE/BIN pairs. Import and validation intentionally exit **3**
for incomplete native support; dependency/format failures exit **2**.

The font mapping comes from the supplied disc's native CP932 lookup table.
No separate Otogirisou font review is needed.

## Implementation

The adapter recovers PAC/IKE data and executes 42 source SCE scripts with a
bounded native text kernel for layout and source predicates. This is distinct
from Otogirisou's engine. Branches, inline choices, retained pages and earned
progress follow source execution. Original glyph masks and selectable Unicode
are drawn directly over the 320×240 artwork, without a bottom dialogue box.
Dictionary scanning sees connected text runs while native glyph positions are
preserved. Saves, backlog, activity and navigation use the shared reader.

## Tested coverage and limits

Twenty sequential campaign runs cover 93,932 text boundaries, 2,199 choices
and 1,763 save restores with no runtime errors: 17 runs end and three reach
the test budget. Budget stops are not endings. Media and timing are simulated;
this is not exhaustive route evidence. Chromium and Firefox each cover 100
actual segments, audio, choices, selection, saves without recounting and phone
layouts. Word-scanner regressions pass in both browsers.

The import recovers 2,441 PAC members and all 1,025 IKE members, including 1,962
original images, 968 index textures, the native font atlas, 73 music conversions
and source sound variants. Four background layers retain source painter order;
silhouettes use original indices and colour ramps with approximate half blending.

Twenty auxiliary control sites remain unsupported and stop explicitly. SPU
envelopes, live modulation, loop phase, palette animation, transitions and
several BIN effects are approximate. Four unverified sound-modulation operands
are diagnosed and omitted. Bonus/native menus, original-console audiovisual
comparison and all optional branches are not established.

See the [full implementation and evidence](chunsoft-ps1-runtime.md) and
[format investigation](chunsoft-ps1-investigation.md). Game assets, native tables,
route recipes and saves are excluded from every release.
