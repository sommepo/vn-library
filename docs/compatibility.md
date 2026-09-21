# Compatibility and evidence

**Remember11 SLPM-65550 v1.02 now has an incomplete playable adapter**, with all
167 script resources parsed and original artwork/audio/video converted. See
[its coverage report](remember11-runtime.md) for separate browser, headless and
unverified-fidelity evidence. This required a new KID VM; it does not extend
support automatically to other PS2 games. CLANNAD's import remains intact.

**Existing CLANNAD PS2 SLPM-66302 v1.01 support.** All discovered script command sites
now have basic implementations, with zero unresolved direct references. Detailed
native presentation and full-route fidelity remain incomplete; validation still
exits 3. See the [current CLANNAD coverage](clannad-runtime.md) and
[basic execution evidence](clannad-basic-execution.md).

**Pia Carrot is paused at the user’s request.** The following evidence is retained
for that earlier import and does not describe CLANNAD.

**Pia Carrot 3 Round Summer has an incomplete actual-game browser runtime.**
Its original scripts execute; it is no longer limited to static recovery.
It is not a faithful full-game port, and no route-completion percentage is known.
See [runtime/source evidence](pia-runtime.md) and [next-session handoff](next-session.md).

## Actual ISO: Japanese PS2 SLPS-25222 v1.04

| Capability | Status | Evidence / limit |
| --- | --- | --- |
| Identify platform/edition | Verified from input | SYSTEM.CNF serial/version/NTSC, MIPS/R5900 ELF; executable not run |
| Open disc | Verified | ISO9660 extents checked; UDF bridge recognized, not separately parsed |
| Archive extraction | Verified | 20,408 NFP members plus four standalone files; hashes and exact-match resume |
| Script parsing | Verified statically | 1,118 scripts, 1,039,001 instructions; no malformed boundaries/targets/native relocations |
| Japanese decoding | Source recovered | 117,781 strict CP932 strings, including non-dialogue data; 3,532 retain custom PUA glyphs |
| Custom glyphs | Original pixels recovered | F040/F057/F05E bitmaps from NFT; Unicode semantics remain unresolved |
| Entry and startup | Source-backed implementation | `_NopeningCtrl` selects OPEN01; original fresh name/system defaults, user-selected name and uniform |
| VM and native functions | Partially implemented | All 29 used VM operation kinds; 119 discovered native names, many unsupported argument/behavior variants |
| Art conversion | Verified with limits | All 1,058 MLH containers/5,434 members unpacked; 4,307 original-dimension PNGs |
| Unsupported image conversion | Explicitly retained | 96 FCHIP tile-direction-3 images and one NETC indexed-4 image |
| Original scene composition | Bounded browser checks | Background/sprite layers and source positions implemented; exact effects/lip/eye timing and all scenes unverified |
| Original voice/effects | Partial conversion | Source VAS pitch/interleave and associations recovered; final import has 475 voice assets and three effects; full voice corpus not converted |
| Sequenced music/ambient | Approximate derivative registered | 37 FLAC tracks: 28 BGM and nine ambient, rendered from original SQ and HD/BD instrument banks through VGMTrans/FluidSynth |
| Music fidelity | Unverified against original | SPU2 ADSR, reverb, interpolation and loop carryover are approximate; source loop markers use HTMLMedia seeking and are not guaranteed gapless |
| Movie | Original derivative registered | Both movie codecs imported; decoded video/PCM roundtrip checks and standalone Chromium playback passed |
| Final live package | Built and validated | `private/library/pia-live`; toolkit validation exits 0; this checks the package, not full routes |
| Choices/conditions/variables | Bounded real execution | Actual source choice and conditional paths execute; no all-route claim |
| Real browser coverage | **100-plus actual pages; latest run 103** | Chromium, first BGM24 playback/voice/background, one choice, quicksave/load, selection/copy, 412px viewport; no uncaught errors |
| Story-triggered opening movie | Passed bounded browser check | Continued to the movie after page 167; 640px video/audio decoded, seeking to end resumed the original script |
| Real headless control coverage | **933 distinct pages, five choices** | Movie completion and timing simulated; stops at RoomMenu, `7M30DNR.SPC:code:0000013e` |
| Real save before/after choice | Passed bounded check | Eight subsequent presentation and execution-state digests match; restore/rerender does not reinvoke the current native |
| Room/schedule/day/work/minigames | Incomplete | Menu-top/action state, fixed schedules and nested return implemented; interactive room handling and later gameplay remain next work |
| Original-console comparison | **Not performed** | No original executable/emulator reference run; this does not block further static implementation |

Commercial-game browser evidence is `private/browser-tests/pia/report.json`.
Standalone audio/movie evidence is `private/browser-tests/pia-audio-report.json`
and `pia-media-report.json`. The older 933-page control report is
`private/evidence/pia-schedule-933-smoke-20260908.json`; the final live rebuild has
a newer `private/evidence/pia-live-933-20260908.json` report. Do not combine these counts or promote
headless execution into media fidelity. The final browser run also checked
story-triggered music and movie integration; full media timing remains unverified.

## Complete reference audit

Static validity does **not** mean every referenced resource exists. The
source-constant audit checks all 2,105 CALL/chain arguments, 2,554 background
requests including RoomInit, 4,572 sprites, 543 CGs and audio associations across
case, uniform and time mappings.

Every background and sprite candidate resolves. Seventeen RC-prefixed scripts
reference absent `RECTOCGMODE.SPC`; one chain in 8M23DN2R references an empty name.
No native loader alias was found. Their full reachability is unknown and they
remain explicit execution errors.

102 CG calls name images absent from the supplied NEV archive. Native
`_NplaneLoad` substitutes the same archive's original `FILEERR.MLH` on an absent
member. The adapter reproduces this with a located warning only when original
archive inventory confirms absence. A present member with failed conversion
still stops. No missing artwork is reconstructed or downloaded.

`node tests/pia-real-smoke.mjs CONTENT --strict-references` exits 3 for unresolved
essential references; regular `--all-scripts` reports them separately from parse
and bounded-execution checks. [Detailed evidence](pia-runtime.md) gives counts,
native addresses, commands and limitations.

## Recovery, reusable tests and UI

`private/library/pia/` retains static recovery, source analysis and its historical
blocked content. Its creation and validation still exit 3 because that recovery
package does not embed the runtime. `vnkit.adapters.pia_runtime` builds the
distinct executable package; the older report is not the current reader status.
Extraction and identical reruns return 0; different output is never overwritten.

Public unit/reader fixtures are original synthetic content. Their extraction,
VM/state, browser, statistics and relay tests never count as commercial-game
coverage. Final checks passed 45 Python tests and four Node test-file suites.
`docs/testing.md` preserves earlier 2026-09-07 history; this page and
`docs/pia-runtime.md` supersede its then-current static-only status.

The shared UI now follows the newer CLANNAD lavender/gold reference, with a
Dim surroundings toggle and VM-driven Next choice navigation; see
[reader interface](reader-interface.md). The encountered
segment/selection hint and experimental-execution label are removed from normal
reading; technical failures and compatibility remain available. Yomitan use,
Android native selection handles, Windows permission behavior, human audio
comparison and complete routes still require separate checks.
