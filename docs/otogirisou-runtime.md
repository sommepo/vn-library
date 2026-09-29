# Otogirisou: Sosei-hen — PS1

**SLPS-01645, Japanese single-track MODE2/2352 CUE/BIN.** This experimental
reader appears under **one**. Exact executable and SYSTEM.CNF hashes identify
the edition; no version number absent from the disc is invented.

## Import

Follow the [shared sound-novel import guide](chunsoft-ps1-runtime.md#local-import)
and [PS1 media tool setup](ps1-media-tools.md). Browser Add game does not accept
CUE/BIN media. Import and validation intentionally exit **3** for incomplete
native support; dependency/format failures exit **2**.

Beta.5 includes the reviewed 1,745-glyph Unicode correspondence in
`vnkit/adapters/otogirisou_charset.py`. It contains only glyph IDs, Unicode
codepoints, review methods and source texture hashes. Original font images are
recovered from your disc and all eight texture hashes must match. No private
review file is needed. `VNKIT_OTOGIRISOU_FONT_REVIEW` can explicitly override
the bundled map for local review work, with the same source checks.

The correspondence consists of 1,557 unique cropped bitmap identities against
Kamaitachi's native CP932 font and 188 source-bitmap visual reviews. It is not
an official encoding table or an independent human proofread. The original
font textures and annotated review material remain private.

## Implementation

The reader uses the game's CDIMG resources and bounded original integer MIPS
routines with explicit host media calls. The bundled Machi demo has a different
format and is not its story engine. Source control flow drives retained pages,
choices and earned progress. There is no general native execution or BIOS.

Original glyph masks and selectable Unicode sit directly over the 320×240 scene,
including inline choices. The page scales as a whole. Dictionary scanning sees
connected text runs while glyph positions retain their native layout. Shared
reader controls provide saves, backlog, activity and navigation.

## Tested coverage and limits

Twenty sequential source-earned cycles cover 38,001 text boundaries, 1,038
choices and 565 save restores, reaching 20 ends at seven distinct source
positions without runtime errors. Media and timing are simulated in that
campaign; these counts do not prove every route. Chromium and Firefox each
cover 100 actual text segments, audio, choices, selection, saves without
recounting and phone layouts. Word-scanner regressions pass in both browsers.

The import converts ordinary scenes, 27 music banks, 131 logical sound cues and
47 movies. Auxiliary bank 45 loading through scenes 205–209 and remaining
special scenes are incomplete. Movie selectors 43–49 have no verified source
association and remain unavailable. Two paired scenes show their first image.
Transitions, reveal timing, visual effects and SPU synthesis are approximate.
Unknown control operations stop explicitly. No original-console audiovisual
comparison or exhaustive optional-route coverage is claimed.

See the [full implementation and evidence](chunsoft-ps1-runtime.md) and
[format investigation](chunsoft-ps1-investigation.md). Game assets, annotated font reviews,
route recipes and saves are excluded from every release.
