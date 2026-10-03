# Compatibility and evidence

**Otogirisou SLPS-01645 and Kamaitachi SLPS-01794 have experimental local readers.**
Original full-scene text, inline choices, source-driven execution, saves and
media pass actual Chromium/Firefox reading checks. Earned campaigns and
remaining native effects/audio/auxiliary control limits are recorded in
[the runtime guide](chunsoft-ps1-runtime.md). Import and validation retain exit 3;
these CUE/BIN editions are not admitted to browser ISO upload. Beta.5 includes
the reader/importer source and the source-bound Otogirisou glyph correspondence;
PS1 media converters still require separate local setup.

**Gyakuten Saiban 2 GBA AGB-A3GJ runs natively (experimental).** The cartridge
executes on an original-code GBA machine: all episodes, graphics, animation and
sound are the game's own. Its text is DOM in the native text box, driven by
touch on the game screen. Timing and sound are not compared with hardware.
Local CLI import only (exit 3). See [the runtime guide](gs2-gba-runtime.md).

**Gyakuten Saiban GBA AGB-ASBJ and Gyakuten Saiban 3 GBA AGB-A3JJ run natively
(experimental)** on the same machine and the same series reader, one profile per
cartridge. Every episode of all three games has been played through to its ending
by an automated player using native input only. Touch on the game's own screens is
checked with real touch events in a browser; the court record has had one informal
phone check. Text reviews are ROM-bound and not proofread. Local CLI import only (exit
3). See the guides for [the first game](gs1-gba-runtime.md) and
[the third](gs3-gba-runtime.md).

**428 PSP ULJS-00219 v1.01 has recovery and a private reader experiment.** Its 34 SNS scripts parse
structurally. A control VM draft, bounded native probes, flow parser and GIM
decoder are under development. Progress records and an exact-source native
recalculation bridge, checkpoint context and system decisions have controlled
native comparisons. A private Chromium campaign passes 900 reading stops with
earned timeline switching, choice reversals, original font and media. Bounded
JUMP/TIP and background-scene paths work in the experiment; full routes, KEEP OUT,
later hours, complete saves and shared-reader integration remain unfinished.
CPU comparisons do not establish native GPU/device fidelity. CLI import exits 3
and creates no playable library
entry. See [the investigation](428-psp-investigation.md).

**Memories Off PS1 SLPS-02296 has a local experimental CUE/BIN reader.**
It is installed under **one** with source-driven choices, selectable Japanese,
original media, a 16-track Sound test and shared reader saves. A 500-run campaign has zero stops and
1,740 restore checks; Chromium/Firefox each cover 150 real text segments.
Six end-of-buffer branches remain fail-closed, the sixth clear flag is untested,
and native presentation is incomplete. This is local CLI support, not browser
ISO upload. Beta.5 includes the reader; its PS1 converters require separate setup. See [coverage and setup](memoriesoff-runtime.md).

**Higurashi Matsuri Kakera Asobi SLPM-66913 v1.01 has a source-driven reader.**
All ten main chapter endings and five bad-ending variants finish in source
replays; 309,298 instructions validate without unsupported sites. Chromium and
Firefox each pass 150 real text segments and reader controls. Native animations,
timing and galleries remain incomplete; three voice references are absent from
the disc. See [runtime coverage and limits](higurashi-runtime.md). Source and Windows releases from v0.1.0-beta.3 support Add game.

**Cartagra SLPM-66231 v1.01 has an experimental reviewed-text reader.**
The reader adapter reaches all sixteen source ending flags in simulated route
replays; Chromium checks 150 segments, media, choices and saves. A source-font
visual review covers 2,446 glyphs and enables DOM Japanese/ruby, copying, text
streams, searchable backlog and study statistics. The map is not independently
proofread or recovered from an official encoding table. One macro instruction
and auxiliary menus remain unsupported. See [the measured coverage and limits](cartagra-runtime.md).
Add game and the Windows installer support this exact edition from v0.1.0-beta.3.
This is basic story support, not complete native fidelity.

**Ever17 Premium Edition SLPM-65421 v1.01 has a playable MAC variant.** All five
main routes, earned final-route gate, both final-route entries, extra epilogues
and three bad endings have source-execution evidence. All discovered story sites
and direct resources validate; native presentation remains incomplete. See
[Ever17 coverage and limits](ever17-runtime.md), including the distinction
between headless replay, actual browser tests and unverified PS2 fidelity.

**Never7 SLPS-25256 v1.01 has an experimental source-script reader.**
[Runtime and tests](never7-runtime.md) distinguish real browser coverage, seeded
headless endings and incomplete effects/extras. Its story VM differs from
Remember11, while the audio and movie pipelines reuse measured shared formats.
All 227 tables parse, including 39 separate credits tables. Credits are not run
as story scripts; full validation still exits 3 for incomplete presentation.

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
