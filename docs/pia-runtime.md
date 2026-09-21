# Pia Carrot 3 Round Summer: actual-game runtime coverage

This is an edition-specific, incomplete interpreter for Japanese PS2
**SLPS-25222, executable version 1.04**. The original supplied scripts execute;
dialogue is never sorted into a substitute story. It is not yet a faithful
full-game port. Extraction, static reference checking, VM execution, rendered
presentation and original-console comparison are separate coverage dimensions.

## Evidence recorded on 2026-09-08

| Check personally run | Result and limits |
| --- | --- |
| Actual-game 150-page smoke from the executable-evidenced OPEN01 entry | Passed. Original bytecode reaches OPEN02, one main-path choice is exercised, and all three alternatives of the first choice receive separate eight-boundary checks. |
| Save before/after the first actual choice | Eight subsequent presentation and execution-state digests match after restoration. Restoring and rerendering the current choice invokes no native again. Foreign game/source saves are rejected. |
| Longer actual-game control run | 933 distinct main-path text pages, five choices, OPEN01 through OPEN10, then 7M30DN and the beginning of 7M30DNR. It stops at `7M30DNR.SPC:code:0000013e`, the native RoomMenu. |
| Media scope of that longer run | Movie completion is explicitly simulated once after page 167. Twelve wait boundaries, including the CG129 presentation task, advance without wall-clock or rendering verification. This is control-flow evidence, not 933 pages of verified graphics/audio. |
| Entire script inventory | 1,118 scripts, 1,039,001 instructions, 117,781 string records; all static instruction boundaries, variable/native relocations and source fingerprints pass. The census uses 29 bytecode operation kinds and names 119 native functions. |
| Registered resources in the audited import | All 5,903 registered resource paths exist and stay inside the private import. Later media imports change this count. Existing registered files do not prove every script reference is present. |
| Original VM/state probes | Six VM probes and six schedule/parent-state probes pass. These original test programs contain no commercial content and do not count as actual-game route coverage. |

Private evidence is retained in `private/evidence/pia-static-reference-audit-20260908.json`
and `private/evidence/pia-schedule-933-smoke-20260908.json`. The former records a
150-page run plus the complete static census. The latter intentionally exits 3
at the unsupported room menu. Reports contain counts, source locations and
digests; they do not copy dialogue into public fixtures.

Reproduce from a private runtime import, choosing unused report paths:

```sh
node tests/pia-real-smoke.mjs private/library/pia-runtime --max-segments 150 --all-scripts --report private/evidence/my-pia-150.json
node tests/pia-real-smoke.mjs private/library/pia-runtime --max-segments 10000 --diagnostic-skip-movie --report private/evidence/my-pia-control.json
node tests/pia-real-smoke.mjs private/library/pia-runtime --max-segments 150 --strict-references --report private/evidence/my-pia-references.json
node --test tests/pia-vm.test.mjs tests/pia-schedule.test.mjs
```

`--all-scripts` reports reference completeness separately from parse validity.
`--strict-references` also exits 3 when essential script/image candidates remain
unresolved. Successful bounded execution does not suppress later static problems.
The harness simulates ordinary media completion and stops at a movie by default;
the diagnostic flag explicitly substitutes a movie completion, never unknown
story state. It emits no future story text. Reports refuse existing output files.

## What comes after the opening

The native `_NopeningCtrl` selects OPEN01. The scripts themselves chain onward.
OPEN10's final `chain` at CODE+`0xa67d` references the string `7m30dn` at
CODE+`0xa669`; there is no inferred OPEN11 transition.

7M30DN calls MenuTopScenarioNameCmp at `+0x3b`, SetMenuTopScenarioName at `+0x65`,
ActionClear at `+0x77`, and SetFirstMessage at `+0x88`. These now preserve the
native prior-visit/state distinction. Its real choice can set a fixed schedule
using `[8,1,2,6]` at `+0x147c`, add five tenderness at `+0x1493`, and continue
to 7M30DNR through `chain` at `+0x14d4`.

7M30DNR initializes the native room at `+0x4c`, configures enabled room actions,
then calls RoomMenu at `+0x13e`. This is a genuine interactive room/menu loop.
Depending on the chosen action, it calls other scripts, reads and writes
room-action flags, advances time and later changes day. The reader must implement
those decisions; it cannot select a convenient next filename and continue.

The next implementation target is the original RoomMenu/submenu controller and
its source labels/result values. Later day transitions include
DayChangeDisposePre/Post and SetDateTime, followed by ParameterCheck, Job/JobTime,
schedule selection and work gameplay. These affect route state. Work, statistics
and minigames cannot be silently removed while claiming a faithful reader.

## Native/state implementation

At this snapshot, 59 of the 119 discovered native names have handlers that can
execute supported argument variants. That is not 59 completely verified native
implementations. Remaining variants/effects can still stop. RoomMenu is explicitly
stopped, despite having a named diagnostic case.

Supported groups include source text/name/Hitret and choices; image preparation
and composition; source-associated media calls; basic date/time, money,
condition, flags, affection/reputation/tenderness; menu-top/action state;
fixed schedule records; nested scenario return; and the source CG129 task.
See [native evidence](pia-natives.md), [VM semantics](pia-vm.md) and
[audio evidence](pia-audio.md) for their separate limits.

`web/adapters/pia-schedule.mjs` implements state and parent-sensitive controls.
All state lives inside `vm.state.native.pia`, separate from learning history.

| Native/source evidence | Exact behavior implemented |
| --- | --- |
| `_MenuTopScenarioNameCmp` `0x1479d0` | Uppercase requested name, then return `strcmp` against the stored menu-top name. Equal means zero; it is not a true/false equality predicate. |
| `_SetMenuTopScenarioName` `0x147a40`; `_NgrbSetMenuTopScenarioName` `0x139940` | Store the uppercase source scenario name. |
| `_ActionClear` `0x146240` | Reset roomRest, firstMessage, actionWho, roomAction, roomActionWhere, roomActionCall and roomActionMove to zero. |
| `_SetFirstMessage` `0x1462c0`; setter `0x1397e0` | Store a signed byte, preserving native truncation. |
| `_Tenderness` `0x147330`, `_AddTenderness` `0x147390`, setter `0x138f10` | Read/assign/add, clamped to 0..120. The fresh cleared game record starts at zero. |
| `_NgrbIsTimeAfter` `0x1386d0` | Current signed-byte hour/minute converted to minutes is greater than or equal to the supplied hour/minute total. The boundary is inclusive. |
| `_NgrbSetConstSchedule` `0x17d670`; `_NgrbSetSchedule` `0x17d5a0` | Store three signed bytes at dayIndex times three: constant flag 1/0, the third argument and the fourth argument. |
| `fPiaCalDayCount` `0x18cba0` | Game-specific calendar: July 9/26/30/31 map to 1/2/3/4; August day 0..31 maps to day+4. Other dates are invalid. It is not Gregorian day subtraction. |
| `_CALL` `0x147900`; `__scr_exec` `0x1293a0` | Write zero into the caller's count/result word and nest the named scenario, including lazy loading. |
| `_ChangeMessage` `0x145690` | Clear message text. With a parent, delete the current frame and replace the parent's top result word with zero. Without a parent, reset the current scenario. |
| `_ScReturn` `0x147dc0` | Clear message text. With a parent, delete the current frame, clamp the argument to its sign, optionally delete one more parent for a nonzero sign, and replace the remaining caller's result word. Without a parent, reset the current scenario. |

The VM exposes `replaceNativeResult`, `returnToScenario` and `restartScenario`
for these explicit frame transitions. The native FUNC handler avoids writing its
old return slot after the frame changes. Saves retain parent frames, their
stacks, registers and locals; probe coverage includes two-level returns with
positive, negative and zero results, lazy CALL, snapshot restoration and balanced
stack pointers. Source reset does not clear persistent native/global game state.

## Complete reference audit

The harness performs conservative constant propagation within individual basic
blocks. Values crossing branches, variable loads or unsupported arithmetic stay
unknown. It applies the adapter's exact case, uniform and time mappings. In this
disc all audited resource/scenario arguments resolve to literals; this does not
mean all resulting branches are reachable.

The 2026-09-08 census finds:

| Reference kind | Source callsites | Result before later media import |
| --- | ---: | --- |
| Background, including RoomInit | 2,554 | All candidate names resolve across the known time variants. |
| Character image | 4,572 | All candidate names resolve across all three uniforms. |
| CG | 543 | 441 resolve directly; 102 calls reference absent original image names, including H-prefixed names, E016 and E060. |
| CALL/chain | 2,105 | 2,087 resolve; 17 reference RECTOCGMODE and one references an empty name. |
| Voice association | 16,531 | 476 were converted in this opening-focused package; remaining calls are tracked as unavailable conversion, not guessed or downloaded. |
| Music/effects/ambient/movie | 1,784 / 1,014 / 38 / 1 | Their individual availability depends on the subsequently installed private media manifest. Source filenames remain preserved. |

Absent CG names are **not** permission to reconstruct artwork or substitute a
similar picture. The original `_NplaneLoad` at `0x1365b4` appends `.MLH` and asks
the NFP for its size. A zero size branches at `0x1365e8` to the literal FILEERR
at `0x1f7420`, and loads `FILEERR.MLH` in the same archive. This supplied disc
has original FILEERR containers in NBG, NEV and NCHR. The runtime reproduces that
source error image with a located warning only when the importer has supplied
the complete original archive inventory. If the original member exists but its
conversion is missing, execution still stops. Neither case invents content.

No special RECTOCGMODE alias was found: `__scr_chain` calls ScrLoadScript,
which reaches `_SetNscrFileLoad` at `0x145240`. That uppercases the requested
name, appends `.SPC`, checks the archive extent, and fails on an absent member.
The string does not occur in this executable; the referenced member is absent
from NSCR. The 17 calls occur in RC-prefixed scripts. Their reachability from the
supported reading path or a native recollection menu is unverified. The empty
chain is at `8M23DN2R.SPC:code:0000056d`. These remain unresolved controls;
the adapter never reroutes them to invented endings or unrelated scenes.

## Remaining verification

Full routes, endings, room/schedule/work interactions, all special presentation
effects, sequenced NMUS music, original-controller timing, and comparison with a
running original PS2 release are unverified or unsupported. A BIOS is not needed
for further static implementation work. No original binary was executed during
this investigation.

These headless checks do not verify clipboard permissions, browser dictionary
extensions, touch selection, audio audibility or mobile rendering. Browser tests
and device checks must be reported separately. Removing technical status text
from the reading UI does not change this compatibility report or hide native
execution failures.
