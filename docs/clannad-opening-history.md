# Historical opening-only evidence (superseded)

This records the earlier build-v10 state. Its event-41/19-choice limits and
unsupported-command counts are superseded by [current coverage](clannad-runtime.md).
The old F[500] default was also corrected; do not treat its old flag comparison as
current original-engine fidelity evidence. Original private reports remain intact.

# CLANNAD PS2: execution and compatibility

Active target: Japanese SLPM-66302 v1.01. Pia Carrot work is paused. This is a
usable **partial source-script reader**, not a faithful full-game port. No route
completion percentage is known.

## Evidence as of 2026-09-17

| Layer | Evidence | Limit |
| --- | --- | --- |
| Disc/archive access | Complete read-only disc extraction; 4,729 ALLPAC members | ISO9660 view; UDF bridge not separately parsed |
| Script recovery | 203 programs; 308,727 instruction boundaries; 103,826 ZM text sources | Two named-expression aliases remain unsupported; legacy commands retained |
| Source labels | All 3,320 SCR_ADR label offsets match recovered commands | Static evidence, not all-route execution |
| Japanese | Strict CP932; no PUA characters in ZM text; source player-name substitutions | No ruby control syntax found in ZM; parenthetical readings stay literal |
| Graphics | 3,859 native-size lossless PNGs, including MZP+MZU full-colour backgrounds | 81 atlas/format entries remain unsupported; ending MZD animation not converted |
| Audio | 42,958 voices, 53 BGM, 54 VSE and 23 SE.ACX clips; zero conversion failures | Source sound-name routing recovered; most effect callsites not browser exercised; UI MSB/MSH bank not rendered |
| Movie | OPENING.PSS converted; decoded video and PCM hashes roundtrip; Chromium playback | MVPL source command semantics/in-story movie trigger remain unsupported |
| Static references | 97,696 direct image/music/voice/sound/call/movie checks; zero unresolved references in that pass | Includes recovered events 9/10/75 and SEPL/SELP; other native internals are outside this pass |
| Unsupported execution | 1,399 command sites reported in all 203 scripts | Count includes inactive/debug scripts and is not a progress percentage |
| Real browser | 2,450 consecutive original text pages, nineteen choices, first choice both branches, art, music, voice | Chromium only; no full route or original-PS2 comparison |
| Headless control | 2,487 segments, nineteen choices, sixteen observed scripts; then native event 41 | Timing/media completion simulated; not browser coverage |
| Additional browser | Source motion events 9/10/23/24/30/75 from reached checkpoints; original movie decoding | Checkpoint/standalone checks are separate from consecutive opening coverage |

The 2,450 browser page count includes ordinary text boundaries only; two new
concurrent native messages are additionally presented and tested, but excluded
from that counter. The 2,487 headless count includes both kinds.

The executable's SCR.NAM has 195 active names. Eight SEEN8000–8007 files are also
present and statically inspected, but absent from that active script-name list.
No missing disc audio track has been identified; unavailable conversions and
unimplemented commands must not be described as missing files.

## Implemented interpretation

`web/adapters/clannad-engine.mjs` follows original ZM text, WTKY/WTK2/WTVT boundaries,
SEL selections, CALC assignments, IF/EIF/ELS/IFJP, GOTO, FCAL/FRET/JUMP, and source
labels. F/G/Z variables and the four-frame call stack persist in saves. Text is
strict source decoding; no translation or generated dialogue is used.

Normal fallthrough through ZY sets the condition flag; IFJP enters two bytes
inside the label and bypasses that reset. EIF is **else if**, not end-if. Native
control evidence is 0x14ab40, 0x14b7c8, 0x14b800 and 0x14c384. The second native
condition flag is the debug branch-bypass switch at 0x1298b0; normal play keeps
it off. No extra invented nesting stack replaces the source's flag behaviour.

FCAL accepts scenario numbers 400 through 8999 (0x14c12c); the shipped 9070/9077
calls are rejected by the original range guard and do nothing. They are not
missing chapters. Calls within range must resolve. Unknown state/control
instructions stop at their original source ID, with the entire failed
instruction rolled back. Signed-16 overflow remains an explicit stop.

Native tables select startup SEEN0414 and its prologue call SEEN6900/Z00, image
names, body/face layers and offsets, music indices, and default/substituted names.
VPLY uses the hex global voice ID: 0–19999 in VOICE, subsequent IDs in VOICE2.
An underscore selector leaves the queued clip unchanged; it does not name an
absent voice file. Source-backed voice association is retained in the backlog.

WTK2 keeps the visible page while publishing/counting only its newly appended
ZM sources. Empty WTKY is a key wait: it preserves the visible previous page and
does not emit/count it again. Save restoration and reload keep occurrence IDs;
genuine rereading gets a new occurrence. Native boundaries publish only explicitly buffered new source text; retained text
is never published twice. Events 30/10 use nested text presentations during motion/input.

WTVT appends original logical passages at voice-relative source cues. It preserves
the same audio clip, full visible DOM page and separate source/occurrence IDs for
newly presented passages. Source tick quantization is documented in the format
notes. Panels/hidden pages pause the voice cue; saving/restoring retains the audio
position and does not count the restored passage again. When the browser blocks
audio, explicit advancement remains available; Aa → Enable audio resumes it.
Original voice 12432 and both of its timing boundaries passed a browser test.

WCOF retains the message window's visibility target; its fade is immediate.
The next original text reopens the window. SEPL/SELP resolve names using SE_NAM's
original bank precedence, replace the selected audio channel and retain looping.
SESP stops a supported channel. SEFD and nonzero fade-ins currently act instantly.
Audio position, loop and channel remain in saves; source sound channel 15 remains
an explicit unsupported case. Converted short effects use the actual SE.ACX data,
not similarly named VSE substitutes.

Original events 23/24 use SSHREN00.BIN: native 60 Hz sampling of the 16-byte frame
table, actor X offsets, completion and actor removal. The reader pauses these
waits/animations when hidden or a panel opens. Saving preserves the remaining
duration and source event; loading rebuilds its original motion. Event 9 rotates
its source colour/mask image, clears the actor and resumes at its completion.
Event 75 runs the source interlude background/title-strip/fade sequence and
commits its final white/black background. Its prior textbox hides during the
interlude. Original GS compositing/pixel rounding remain unverified.

MNWL preserves source newlines in DOM/copy and excludes their whitespace from
character totals. GCLS/GMSA and QK0 are original dispatcher no-ops, as documented
in the format notes; no invented replacement effect is applied.

## Later opening support and choice-state audit

Event 30 now presents its buffered dialogue and associated voice while its original
actor motion runs. Its following key wait does not replay/recount that text. Event
10 lowers the actor, changes to original alternate artwork, rotates with SWING
sound, waits for player input and retires within its source angular interval.
Its input wait also presents the source's pending dialogue/voice. Phase, elapsed
animation clock and media state survive saves. See native addresses and assumptions
in [format notes](formats-clannad-ps2.md).

MSNL recovers simultaneous speech, including source name substitution and each
source ID. Native slot positions/colours are normalized on the same DOM page;
exports and statistics use separate dialogue parts to exclude optional speakers.
NCK0/NCK1/NCK2 and NSC0/NSC1 support literal checks of original default names,
writing the original F destination for subsequent conditions. Unsupported custom
names/parameter forms fail explicitly.

`tests/clannad-route-audit.mjs` follows the first-option path and independently
restores every encountered choice to probe each option until its next choice,
end, error or 800-boundary limit. In `private/clannad/route-audit-v3/report.json`:
19/19 choices have different source text traces; 14/19 have F/G differences beyond
the selection-result destination (F[1089]). This proves source branch/variable
execution in that bounded probe, **not complete character routes/endings**. One
alternative at choice 16 stops earlier at unimplemented MCOL,
`SEEN3418.MZX:00006e5a`. Both alternatives at choice 19 reach the event-41 stop.
Text counts include both ordinary and explicitly concurrent native messages.

The active import is the preserved/promoted build-v10-opening-final output (import revision 0.2.0). Its runtime
identity/raw scripts are unchanged, so previous format-v1 saves remain compatible.
The reader has 15 manual slots plus separate autosave, quicksave and pre-jump backup.
Older halted saves with no pending presentation resume from their saved PC when
it is supported. Only newly reached text is published/counted. Transient effects
discarded by the old failed advance are not reconstructible from that save; a
pre-boundary manual save permits replay of the original lead-in. New ordinary
advance failures roll back to the visible presentation before autosave.

## Explicit presentation gaps

- FADB/FADF/FADE transitions currently change the original scene immediately.
- MFAD stops music immediately; source fade envelopes are not reproduced.
- WCOF and sound fade-in/out envelopes are immediate; their state changes remain.
- SHAK and KEI character-clear transition animation/timing are omitted.
- Staff-credit events 2–7 and opening-logo event 8 are omitted, with warnings.
- Calendar animation and source window/font-speed styling are not reproduced;
  source date/window/font values are retained. User typography controls work.
- SPIA stores source palette mode 1; that colour effect is not yet drawn.
- Browser music loop seeking uses source sample markers but is not sample-exact.
- Multi-character FADZ, other native events, sound channel 15,
  conditional SEB choices, custom name entry/unsupported name-check parameter forms
  and ending/movie controls remain
  unsupported. They stop execution rather than fabricate a substitute scene.

The discovered scripts also invoke bespoke native sequences and interaction
commands (including SEB and NCK/NSC families). Their gameplay semantics and
coverage are not fully established. A linear text-only conversion would lose
these interactions, route state and staged sequences. They have not been
silently replaced with a linear story.

## Reproduce checks

```sh
python3 -m vnkit validate private/library/clannad-live
node scripts/validate-clannad.mjs private/library/clannad-live private/clannad/new-static-report.json
node tests/clannad-real-smoke.mjs private/library/clannad-live 150 private/clannad/new-150-report.json
node tests/clannad-real-smoke.mjs private/library/clannad-live 5000 private/clannad/new-boundary-report.json
node tests/clannad-route-audit.mjs private/library/clannad-live private/clannad/new-route-audit
VNKIT_SEGMENTS=2450 VNKIT_REPORT_DIR=private/browser-tests/new-clannad-2450 sh scripts/browser-env.sh node tests/browser-clannad.mjs
sh scripts/browser-env.sh node tests/browser-clannad-modes.mjs
sh scripts/browser-env.sh node tests/browser-clannad-native.mjs
sh scripts/browser-env.sh node tests/browser-clannad-voice-cues.mjs
VNKIT_CHECKPOINTS=private/clannad/new-route-audit sh scripts/browser-env.sh node tests/browser-clannad-extension.mjs
```

Full validation intentionally exits **3** for incomplete support; its structure
and asset checks still run. The 150-page control probe passes; the longer probe
exits 3 at `SEEN3419.MZX:00000c6a`, native event 41. Reports are no-clobber: use a
new report filename. Browser modes use the private checkpoint produced by:

```sh
VNKIT_MOTION_SAVE=private/clannad/motion-checkpoint.json node tests/clannad-real-smoke.mjs private/library/clannad-live 5000 private/clannad/motion-run.json
```

The native checkpoint test additionally needs `voice-checkpoint.json`,
`rotation-checkpoint.json` and `eyecatch-checkpoint.json`. In a fresh private
workspace they can be produced together by setting `VNKIT_VOICE_SAVE`,
`VNKIT_ROTATION_SAVE` and `VNKIT_EYECATCH_SAVE` to those paths on the longer
headless command. Existing saves are refused rather than overwritten; use fresh
paths for another evidence run and point the browser test at the intended files.
The voice-cue test uses `private/clannad/voice-cue-checkpoint.json`, generated by
setting `VNKIT_VOICE_CUE_SAVE` to that path on a fresh longer headless run.

Existing evidence: `private/clannad/static-validation-v8-swing.json`,
`private/clannad/route-audit-v3/report.json`, `private/browser-tests/clannad-2450-v2/results.json`
`private/browser-tests/clannad-modes-v2/results.json`,
`private/browser-tests/clannad-native-v5/results.json` and
`private/browser-tests/clannad-voice-cues-v4/results.json`,
`private/browser-tests/clannad-extension-v4/results.json` and
`private/browser-tests/clannad-navigation-v5/results.json`. These private reports and
screenshots must not enter the shared code package.

The latter runs use corrected Node-side asynchronous polling: Playwright 1.55's
`waitForFunction` treats an async predicate's Promise as truthy before its result.
Affected mode/native checks were rerun; their earlier reports remain historical.
The consecutive reading test did not use that faulty polling pattern.

Actual browser checks include selection protection, explicit/automatic clipboard
success, automatic clipboard denial, both first-choice branches, quicksave/load,
save export/import, reload/history deduplication, backlog search, plain and JSON
external WebSocket consumers, auto, skip-read stopping at unread text, manual
activity pause/resume, live companion and three viewport sizes. Physical touch
selection, Windows/Android permissions, Firefox and Yomitan remain user checks.

No original PS2/emulator reference execution was performed. Source disassembly
supports the implemented decisions but does not prove complete presentation
fidelity or all-route behaviour.
