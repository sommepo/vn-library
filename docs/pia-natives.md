# Pia Carrot 3 PS2 native bridge

This is SLPS-25222 version 1.04 support, not general NOBORI support. The native
bridge is `web/adapters/pia-natives.mjs`; bytecode execution is in `pia-vm.mjs`.
Source-derived names and resource tables are imported with
`vnkit/adapters/pia_native_data.py`. The private input executable is never launched.

## Interface and state

`new PiaNatives(content)` expects `content.nativeData` from
`extract_native_data(Elf32(...))`, including `startup` with the original or
user-selected family name, first name, uniform type and system-clear record.
`invoke(name, args, vm, instruction)` receives arguments in original push order.
Its optional `result` overwrites the script stack argument-count word. Omission
preserves that word, matching native functions that do not write their third C
argument. The native C return is a scheduler flag, not this script result.

Pending events use `kind: text | choice | chain | movie | wait | task`. Movies require an imported original media asset. Waits preserve their source frame count; browser timing uses nominal NTSC 60 Hz. `Hitret` yields complete logical
pages composed of the encountered `Mess` fragments, with source IDs for both
fragments and the presenting instruction. `choose(vm, value)` validates a visible
one-based original option, writes `SELECT_REG`, and returns the value for
`vm.resume(value)`. All game state, prepared image planes, speaker/voice state,
choices and warnings live under `vm.state.native.pia` and survive VM snapshots.

Resource lookups use original uppercase names through
`content.resources[kind][name]`, whose value is an asset ID or `{asset, ...layout}`.
The accepted kinds are background, cg, sprite, voice, sound, ambient, movie and music. Image IDs
from the earlier static import are also accepted. Unresolved essential images
stop at the requesting source instruction. Unconverted audio produces a located
warning and retains the original association in state.

## Source evidence

Addresses below refer to virtual addresses in this edition's ELF. The following
can be inspected with `python3 -m vnkit.elf private/pia-extracted/SLPS_252.22 SYMBOL`.

| Behavior | Original implementation |
| --- | --- |
| Native argument order and return slot | `__scrCmdFUNC`, 0x127790: copies arguments from descending stack positions into their original push order; a2 points at the count/result word. |
| Scenario marker | `_EnterScenario`, 0x145ad0: only gets the minimum scheduler cycle. |
| Cleared-game record | `_GetSysGameClear`, 0x1481e0 and `_NgrbGetSysGameClear`, 0x139bb0: byte at 0x20f508 bit zero. Fresh main clears the containing Grb block before memory-card loading. |
| Dates, time, money | `_SetDate` 0x145b70, `_SetTime` 0x145bd0, `_Money` 0x1471b0. Two arguments set month/day or hour/minute; Money(0 args) reads and Money(1 arg) assigns. |
| Condition | `_Condition` 0x147290, `_NgrbSetCondition` 0x138ea0: read/assign with inclusive clamp 0..120. |
| Appearance flags | `_SysAppearF` 0x145e20, `_NgrbSetAppearFlag` 0x1392f0: per-character boolean bit. |
| Speaker names | `_Name` 0x145ee0 calls `_NgrbChgName` 0x132310. The latter contains 144 exact source-name comparisons. These produce original display strings, character IDs, and invisible narration. Three-argument Name updates voice metadata while preserving the displayed group speaker. |
| Text accumulation | `_Mess` 0x1461a0, `_NscrAddMess` 0x14d6f0: clears/pads the presentation buffer, removes `##`, substitutes family/first-name tokens, and appends each fixed-width source line. The reader omits artificial padding and joins original line fragments with newlines. |
| Presentation boundary | `_Hitret` 0x145af0, `_SetNscrHitret` 0x14d940, `_NscrHitret` 0x14d9e0: input/voice/presentation wait and read-flag association. |
| Voice association | `_NxaClsSpeakFileName` 0x1787e0 and `_NxaSetSpeakFileName` 0x178770 write one global filename. The last Name wins, including grouped dialogue. `_NxaSetSpeakChrId` 0x1786c0 accumulates lip-animation IDs, not additional simultaneous audio files. |
| Choices | `_AddSelectMess` 0x146c30, `_NgrbAddSelect` 0x13a630, `_SelectStart` 0x145c30, `_NscrMessSelectCtrl` 0x14f640: visible alternatives, one-based selection, assignment to SELECT_REG at 0x14f908. |
| Image preparation | `_PicBg` 0x146d20, `_PicEv` 0x145c70, `_PicUp` 0x145cd0 call `_SetNscrPlaneLoad` 0x148510. Plane types are background 0, CG 1, character 2. |
| Uniform resources | `_NgrbChgEvFileNameOfUniformType` 0x130d90 and `_NgrbChgChrFileNameOfUniformType` 0x130f40. Imported tables at 0x1ec1c0, 0x1ec220, 0x1ec260; suffixes A/B/C. `StrReplace` 0x130cd0 swaps the last two filename bytes for the listed CGs. |
| Time-specific backgrounds | `_NgrbChgBgFileNameOfTime` 0x131090: designated names map to A/B/C at 18:00 and 19:00; designated two-variant names map to A/C at 19:00. Explicit variant names remain unchanged. |
| Character occupancy | `_NbustChgName2ChrId` 0x157a90 derives ID from filename bytes 1..2. `_NbustHuntOccupancyPlane` 0x157b10 reuses that character's slot or the first empty of three slots. |
| Affection and reputation | `_AddLove` 0x147770 / `_NgrbSetLove` 0x1391b0 clamp 0..300. `_AddNotoriety` 0x1476b0 / `_NgrbSetNotoriety` 0x139140 clamp 0..120. |
| Number flags | `_FLAG` 0x1463b0, `_NgrbGetNumFlag` 0x138e70 and `_NgrbSetNumFlag` 0x138e40: signed byte values in the cleared 512-byte array at 0x20fb25, not booleans. |
| Measurement records | `_SysThreeSizeF` 0x146350 and `_NgrbSetThreeSizeFlag` 0x139380 write the corresponding system-record bit. |
| Sound filenames and timing | `_PlaySE` 0x145dc0 formats numeric IDs as `PIASE%03d` (literal at 0x1f7a20). Hitret starts this queued stream and waits before text/voice; the pending text therefore carries `leadSound`. `_NscrPlayEnvSE` 0x179530 formats IDs as `S%02d` (0x1fdfe0), loads NMUS.NFP, and replaces the one ambient channel. StopEnvSE interprets empty string/FADEOUT as fade and other strings as immediate stop. |
| Movie and frame hiding | `_PlayMovie` 0x1477c0 passes the source filename to `_SetNscrMovie`. `_HideFadeFrame` 0x1461e0 and `_NscrHideFadeFrame` 0x14c590 hide the date and message frames. |
| Explicit waits | `_Wait` 0x146430 multiplies its argument by five; `_NscrWait` 0x149c70 decrements that count per native scheduler frame. |
| Character clearing | `_PicUpClear` 0x146820 queues a flag for one character or all three; effect 0x105 uses `_SetNbustAppearance`. That function also swaps a prepared BG/CG at 0x156408..0x156438, including during Hitret. |
| Image commits | `_DrawCG` 0x145700, `_DrawEffect` 0x145960, `_NscrDrawCG` 0x148bc0 and `_MaskDrawCG` 0x145e80. Known visual transitions may render their final composition with a located degradation warning. Unknown effect IDs stop. |
| Script chains | `__scr_chain` 0x129310 deletes all preceding script frames and loads its named script, retaining native game state. |
| CG129 task handle | `_TaskWakeUp` 0x148360 recognizes type0, stores the task pointer and writes script result0. `_SetNtakako129Ctrl` 0x1e07d0 marks CG records430/431 and increments the script busy count. |
| CG129 actions | `_TaskActionSet` 0x1483c0 writes the action to task+0x10 and increments the busy count; `_Ntakako129Ctrl` 0x1e0860 dispatches action1..5 through the table at0x208710 to states0x200..0x600. State0x1000 decrements busy only after each action completes. |
| CG129 assets and rendering | `_NtakFileLoad` 0x1e23a0 loads NETC.NFP/TAKA129.MLH, using six names from0x1f3c40: 129BGH,129MT,129MN,129BGV,129OT,129ON. `_NtakSprBgH` 0x1e1cd0 draws15 horizontal strips; `_NtakSprBgV` 0x1e1f00 draws6 vertical strips; `_NtakNob02Put` 0x1e2140 applies the far character's16.12 scale. |
| CG129 teardown | `_TaskKill` 0x148440 and `_NscrTaskKill` 0x14bb90 request action-1 and wait for completion. Task state0x2000 fades to black;0x2020 frees its six images and loads NEV.NFP/BLACK;0x2030 restores the date window;0x2040 releases the controller. |
| Room preparation | `_RoomInit` 0x147c00 resets main/data/town/dormitory/call/item/system/submenu availability bitsets with lengths8/9/5/8/6/5/8/8. It passes only the first string to `_SetNscrRoomInit`, even when the script supplies two. `_NscrRoomInit` 0x14a640 selects the time-specific background, clears characters/message and starts BGM12 during07:00–18:59 inclusive or BGM13 otherwise (literals0x1f8210/0x1f8218). |
| Room state accessors | `_NgrbSetRoomSaMain` 0x139410 writes a boolean bit. `_NgrbSetRoomAction` 0x139840, Where0x139880, Call0x1398c0 and Move0x139900 write signed bytes. Getter calls preserve those values. Daily `ActionClear` resets these same fields; RoomInit itself preserves them. |

## CG129 presentation interface

`web/adapters/pia-task.mjs` owns this edition's bespoke animation. The native
bridge stores an entirely serializable `scene.task`, including type/version,
source instruction, action, initial pose, elapsed frame, scrolling phase and
the six original asset IDs. `mountScene(task, art, mediaURL)` mounts a graphics
canvas and returns a cleanup function with a `ready` promise. The reader must
await asset decoding before starting the timed task, preserve the actual task
object so frame updates enter saves, and stop on load errors. No Japanese text
is drawn or emitted by this module.

Task pending events carry `sourceFrames`, `ms`, optional `sound` and `kill`.
After the animation and its optional sound have completed, the reader calls
`PiaNatives.completeTask(vm)` before advancing the VM. A task cannot accept its
next action while the prior action is busy. This prevents consecutive actions4,
5 and teardown from collapsing into an invisible immediate state change.

At ordinary reading speed the source movements use48,16,48,48 and128-frame
intervals. Action1 brings the near male image from x640 to-117, then the female
image from x640 to11, followed by a decaying alternating32-pixel shake and
PIASE051. Action2 adds8 to the male y position. Action3 fades out both near
images. Action4 changes to the vertical background, moves the far male from
(256,652) to(320,64), scales from2 to1.5, brings the female to(154,64), and plays
PIASE054. Action5 moves the male to(480,652) and scales to1. Teardown fades over64
frames. The source positions, order and endpoints are retained. Native movement
easing, incidental scheduler overhead and exact raster scaling are approximated;
these are recorded as presentation warnings. Original emulator comparison remains
unperformed.

## Next step: original room menu (investigated, not activated)

Execution currently stops at `7M30DNR.SPC:code:0000013e`, the original `RoomMenu`
call after room preparation. Do not bypass this call or append later script text.
No `pia-room.mjs` interpreter has been activated. The following source evidence
is ready for the next session; it is not a support claim.

The main controller is `_RMenuTop`0x17de60; its eight-entry function-pointer table
at0x1ecf40 resolves as follows:

| Original zero-based index | Original button label | Controller | Decision action |
| --- | --- | --- | --- |
| 0 | Data | `setRoomDataMenu`0x183080 | Submenu; not yet implemented |
| 1 | Recreation, or Rest when `roomRest` is set | `setRoomRestMenu`0x1881c0 | 2 |
| 2 | Study | `setRoomStudyMenu`0x188200 | 3 |
| 3 | Jogging | `setRoomJoggingMenu`0x188240 | 4 |
| 4 | Call | `setRoomCallMenu`0x185c00 | 5 after destination selection |
| 5 | Move | `setRoomMoveTownMenu`0x17fcb0 | 6 after destination selection |
| 6 | Item | `setRoomItemMenu`0x184580 | Requires item-specific execution |
| 7 | System | `setRoomSysMenu`0x186e10 | Requires system-submenu execution |

The three immediate controllers call `frmenuSetMenuDecision(0,0,action)` and
complete. They do not themselves change condition, time or attributes; the
original scenario examines the selected action and performs those changes.
`frmenuSetMenuDecision`0x188bc0 stores `where=a0`, `who=a1`, `action=a2`.
`_FscrRoomMenuBaseCtrl`0x1498b0 later writes them through the original room/action
setters. Normal RoomMenu completion leaves its script result at0; its native
return1 is reserved for the load-game branch. This must not be implemented by
the story choice handler's one-based `SELECT_REG` assignment.

`frmenuSetTopMenuEnableFlag`0x188d80 checks all eight `RoomSaMain` bits.
`_RMenuTop` also checks `RoomSubMenu` bits: indices1..3 always use their immediate
controllers; another index whose submenu bit is false can directly select
action=index+1 with where/who0. Keep this condition distinct from visibility.

The original top button artwork is already imported as
`NETC.NFP:FRAME.MLH:FRAME02.NBP`, a512×512 atlas. `_RMenuTopPut`0x17e7e0 takes
normal/highlighted/disabled crops at x0/116/232, y=index×20, width116, height20.
The alternate Rest label uses y160. `_NstaFrameTexInit`0x1a05e0 selects this
FRAME02 texture via the literal at0x1ff5e0; the mapping is not based on an assumed
filename. These English labels were verified against the original atlas.

Additional verified submenu evidence:

- `_RMenuCall`0x185ca0 uses `FRMenuCallReturn` at0x1ed6a8:
  source indices0..5 return1,2,3,5,4,6. It passes the same value as both where and
  who, with action5. The visual name-board indices at0x1ed6c0 are8,9,0,2,5,7.
  `frmenuSetCallMenuEnableFlag`0x188f60 enables the first three destinations;
  enables indices3/4 from month×100+day >=802; enables index5 when numeric flag104
  is nonzero. This controller builds its displayed list from those computed
  flags; do not substitute encounter/affection guesses.
- `_RMenuMoveTown`0x17fd50 uses selection indices0..4 whose texture order is
 1,3,4,2,0 (`FRMenuTownOrder`0x1ecf68), and whose destination codes are5,2,4,1,3
  (`FRMenuTownID`0x1ecf78). Selection0 opens the dormitory submenu. Other
  selections return action6, the mapped where code and who0.
  `frmenuSetTownMenuEnableFlag`0x188e30 maps RoomSaMoveTown bit indices0..4 to
  displayed indices4,1,3,0,2 (`FRMenuTownSaID`0x1ecf88). Displayed index4 further
  requires numeric flag102. The atlas rectangle table is `FRMenuTownTex`
  at0x1ed040: five entries, each four states of five signed16-bit fields
  (texture selector,x,y,width,height), using RMENU02/FRAME03 and FRAME04.
- `_RMenuMoveDem`0x181330 enables nine selectable positions and disables index2
  when `_NgrbGetFLAG(105)` returns zero. Confirm this getter's relationship to
  the numeric FLAG storage before implementing that condition. Its selectable mapping at0x1ed110 begins
  0,6,2,5,7,3,4,1,8; the final mapped8 is Back. Other selections return action6,
  where=mapped+6 and who0. This yields source positions for the roof, characters'
  rooms and bath without deriving routes from filenames. Its full16-entry
  sprite table `FRMenuDemTex`0x1ed220 uses the same five-field/four-state layout
  with RMENU03/FRAME05, FRAME06 and FRAME07. Implement the source Back action
  without resuming the suspended RoomMenu FUNC.

Suggested integration contract, still to implement: adapter-owned room menus
yield `kind:'choice', ui:true, nativeMenu:'pia-room'`, with source-stable option
IDs, exact original availability, DOM labels and optional original atlas crops.
Keep submenu state serializable under native state. The facade must let a native
choice replace the pending menu without resuming the bytecode; only a final
original decision updates room state and resumes with the correct result. These
menus are interface operations, so exclude them from dialogue export, backlog
and reading-character statistics. Unimplemented Data/Item/System behavior must
remain an explicit stop at the selected source operation, with state preserved;
do not silently choose another action.

Private static evidence is retained in `private/probe/room-menu.txt`,
`room-menu-data.txt`, `room-top-put.txt` and `room-init.txt`. Reproduce individual
function dumps with the documented ELF CLI; the executable is only inspected,
not launched. Next verification should exercise both Recreation and Study from
the actual first room menu, save/load before and after each decision, check the
subsequent original script/state, and test the actual Back/destination mappings.

## Limitations

The opening's recognized calls do not establish full-route support. OPEN10's
CG129 task now has source-derived presentation and busy-state behavior. This is
distinct from the later work minigames, whose support must be established
separately. A private headless continuation reached911 text pages across
OPEN01–OPEN10 and the chain to7M30DN, with movie and task completion simulated
for control-flow investigation; this is not audiovisual verification. Unsupported
native state/control calls stop. Room initialization and source availability
conditions execute; `RoomMenu` currently stops at7M30DNR.SPC CODE+0x13e until the
original main and submenu selections are implemented. Its eight actions must not
be replaced with an invented linear continuation. Native mask/fade/flash transitions currently degrade to the known
final composition. Lip movement and exact fade scheduling remain unverified.
Audio availability is determined by the import, and unconverted sequenced music
is explicitly reported. Reports from the private real-game smoke harness are
commercial-game evidence; public synthetic tests remain separate.

The name-table extractor contains a deliberately restricted evaluator for just
`_NgrbChgName`. It uses bounded scratch memory and an allowlist of original
register/load/store/branch instructions plus strcmp, strcpy, name getters and the
visibility setter. Any other operation fails. It has no operating-system or
network interface and cannot launch or call the executable. Its output is private
game data and must never enter a public package.
