# Text output, clipboard and activity

Japanese is normal selectable light-DOM text, with semantic ruby elements. Text
selection and dictionary lookup do not need Textractor or a browser-process hook.
The textbox never advances on pointer clicks; artwork/Next or unmodified
Space/Enter/Right advance when no selection, dialog or editable control is active.

**Next choice** / **Alt+N** follows the VM through unread dialogue without presenting
it. Passed narrative gets no reading credit, backlog/seen entry, clipboard copy or
text event; only a skipped-segment aggregate is retained. Active time pauses during
the jump. The reached choice is emitted once with navigation `next-choice`.
Cancel/error restores the starting position. See [reader controls](reader-interface.md)
for its automatic backup, media behavior and the separate Skip read mode.

## Clipboard on the reading device

`Copy` and Alt+C copy the current line. Normal selected-text copying remains
available. Settings offer opt-in automatic copying, a clipboard test, speaker
inclusion and base/reading/both ruby export. Automatic copying uses the reading
browser's Clipboard API, never the server clipboard. Localhost or trusted HTTPS
is required, and browser permissions/user activation can still reject it. The UI
reports that failure and retains explicit Copy (with a legacy selection-copy
fallback), native selection, live text and WebSocket alternatives. An HTTP LAN
URL is not a reliable automatic-clipboard deployment. No clipboard bridge needed.

The browser's secure-context and permission rules are documented by
[MDN Clipboard API](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API).
See `docs/testing.md` for the actually exercised success/failure paths, and the
remaining Firefox/Android/Yomitan checks.

## Live page and external receiver

Open `/live.html` on the same reader origin. It receives newly presented complete
segments over BroadcastChannel, with a structured WebSocket alternative. Opening
or reconnecting it does not dump past/future scripts. It owns no activity timer.
Clear removes visible lines without replaying them. The companion retains at most
300 rendered entries for a lightweight live display; the reader owns the backlog.

The existing service already allows Renji’s origin; reuse it. On a fresh
installation, start the relay with an explicit allowed external browser origin:

```sh
python3 -m vnkit serve --allow-origin https://renji-xd.github.io
```

Enable **Publish newly presented text** in reader settings. Copy the WebSocket
URL shown there into Renji's WebSocket source configuration. Its token grants
read access to this local session; keep it private. Default `format=sentence`
publishes `{"sentence":"…"}`, compatible with the pinned actual receiver
implementation in `docs/provenance.md`. `format=plain` sends only Japanese text;
`format=json` sends structured events. There are no textual status/control frames.
Native clients can omit Origin but still need the token. Browser clients require
the reader's origin or a CLI `--allow-origin` exact match. No wildcard CORS exists.

For Windows, an SSH tunnel to the Linux host makes `ws://127.0.0.1:8891` refer to
that tunnel on Windows. Remote HTTPS pages may restrict insecure WebSockets or
private-network access: use trusted HTTPS/WSS when that browser blocks localhost
WS. Tokens rotate on server restart; get the new URL and reconnect. Failed text
delivery is reported, and old lines are not replayed on reconnection.

Structured schema v1:

```json
{"format":"vnkit.text-event","version":1,"gameId":"stable-game-id",
 "sessionId":"session-uuid","segmentId":"source-location-id",
 "occurrenceId":"presentation-uuid","speaker":"speaker or empty",
 "sentence":"complete logical segment","timestamp":"ISO-8601 timestamp",
 "flags":{"skip":false,"navigation":"advance","restored":false},
 "ruby":"base","speakerIncluded":false}
```

This is an example shape, not game content. Complete segments are emitted once,
independently of typewriter frames. Source IDs distinguish equal strings at
different locations; occurrence IDs distinguish actual rereading. The relay
stores only game/session/occurrence keys in SQLite for restart-safe duplicate
suppression. Reload/save restoration does not publish the restored current line.
No reconnect replay is provided, deliberately avoiding duplicate receiver text.

## CLANNAD continuation boundaries

A WTK2 continuation retains previously visible DOM text. Its `displayText` is
that full page, while `text`, the live output and activity count contain only the
newly appended source segments. Source IDs join the actual contributing ZM
locations, never their strings; the relay accepts compound IDs up to 4096
characters and preserves them intact. Empty WTKY key waits and native animation
waits preserve the visible page but emit and count no dialogue. Rerendering or
restoring any of these waits does not become a new reading occurrence.

## Activity estimates

**Activity** has two compact metric groups: overall game Characters, Chars/hour
and Time spent; current Session hours, Session chars, Started, Ended and Session
chars/hour. Overall speed is total narrative characters divided by total active
hours, not an average of session speeds. Rates are blank below one active second;
hours display to one decimal and exact counts/duration are available as tooltips.
Started uses the browser's local clock; Ended is blank for the open session.
There is no completion or time-left estimate. Today, unique text, rereading and
selected-choice counts remain in an expandable section. History/CSV/JSON and
manual pause remain available. These totals remain device-local even when saves
are shared. The counting/storage format is unchanged by the layout update.

### Clear the current session

**Activity → Clear current session** asks for confirmation, then zeros the open
session's active time, narrative/unique/reread characters, segments, selected-choice
characters and skipped-segment count. Started resets to the current time; the
session identity and manual-pause setting remain. Rates show no estimate until
new active reading time is recorded.

The cleared session's contributions are also subtracted from overall and daily
totals, including a session spanning multiple local dates. Earlier sessions are
unchanged. This is a counter reset, not a reset of reading progress: seen IDs,
occurrence deduplication, backlog and bookmarks remain, as do game saves and route
progress. Current text is neither re-emitted nor counted again. A genuine later
encounter of the same source remains rereading.

The change persists immediately on this device and is included in subsequent
activity JSON/CSV exports. Storage failure restores the in-memory counters and
reports an error. Export activity first if you want a copy of the old counters.
Sessions now resume across reloads and breaks shorter than four hours. Four hours
without reader activity closes the previous session at its last activity and starts
a new one when reading resumes; hidden/idle heartbeats do not keep it alive.
This grouping interval is separate from the five-minute active-time timeout.
**Today’s characters** is always visible in Activity. Reading days begin at
**04:01 browser-local time**; through 04:00:59 belongs to the previous day. A
session can span multiple reading days without being split.

Activity history lists every session with **Delete session** and confirmation.
Deletion subtracts that session's daily/overall counters and preserves saves,
backlog, bookmarks, seen and occurrence IDs. Deleting the current session starts
an empty one. Storage errors restore the in-memory counters.

Activity format v2 persists per-session daily contributions and last activity.
Version 1 backups remain importable: original counts and session grouping stay
intact, but historical day attribution is approximate (assigned to the reading
day of each session's start because the old format lacks an exact ledger).
The UI labels that limitation. Before upgrading, a device-local copy is kept at
`<game>:activity-before-session-upgrade`; **Export pre-upgrade activity** downloads
it. New contributions and sessions use exact day ledgers. Old fragmented sessions
are not automatically merged. Export activity JSON to back up the new ledger.


Counts mean **text presented during reading**, not measured comprehension.
Narrative character count uses Unicode code points, excludes whitespace, includes
punctuation, and excludes speaker names, interface labels, script commands and
duplicate ruby readings. Selected choices have a separate count. Unique counts
use source IDs; rereading uses a new occurrence at a previously encountered source.
Skipping contributes zero reading characters. Saved/restored current text is not
newly counted. Daily boundaries use the reading browser's local timezone.

Active time accrues only in the reader, while visible with an active narrative
page, outside panels/skip/manual pause, within the configurable inactivity window
(default five minutes). One heartbeat contributes at most five seconds. This
leaves dictionary time available without crediting a long abandoned tab. The live
page does not run a second timer. See implementation/test coverage for reader-tab
ownership restrictions. Characters per hour divides counted characters by active
time; no exact route completion percentage is claimed.

IndexedDB stores per-game history, sessions, encountered backlog and bookmarks,
separately from save slots. Loading an earlier save preserves later study history.
Activity JSON and session CSV exports are in Activity. Saves exports/imports are
in Saves. Export both for a backup: copying the server's `private/state` alone
does **not** back up browser saves/statistics. Browser profiles/origins/devices
have separate data; move exports deliberately. Activity backup restoration is an
explicit replacement operation with confirmation, never an effect of loading a save.

CLANNAD WTVT uses that same full-page/delta-text split at source voice cues. It
keeps one playing voice through the appended passages, waits for the audio cue
and emits a separate complete logical segment per source boundary. A reload
restores the same occurrence and voice position. Previous displayed characters
stay visible during typewriter continuation; they are not typed or counted again.


Native concurrent messages and simultaneous speakers: a wait or native input
boundary may carry an ordinary nested `presentation` with a stable source ID and
occurrence ID. Only that complete new segment is emitted/counted, once. A following
key wait retains the display without another occurrence. An optional `dialogue`
array carries `{speaker,text}` parts for simultaneous speakers; it changes neither
source identities nor occurrence count. Character totals exclude all these speaker
labels. Speaker-configurable copy/live/WebSocket output joins the parts with
newlines; ordinary selection copies the actual selected display.

## Read colouring and completed-route assumptions (2026-09-20)

Normal presentation records a stable source segment ID in Activity.seen; it is
eligible for Skip read on later encounters. This is exposure, not proof of
comprehension. The display checks read status before recording the new encounter,
so newly encountered text starts in the normal colour. Rereading is red by default;
Reading settings → Previously read text colour changes it. Backlog uses read colour
too. A timed appended page takes the colour of its current logical segment.

CLANNAD also consults an edition/signature-bound `read-paths.json` sidecar. Each
completed route with a verified entry-to-ending path contributes that fixed path's
source IDs to *assumed read* status. Manual completion (including existing marks)
and native completion both qualify. Shared portions qualify too; other choice
branches do not. This is deterministic, not a claim about the choices made on a
physical PS2. Assumed status does not write Activity.seen, occurrences, backlog,
characters, active time or text-output events. Removing/restoring route progress
therefore removes the assumption while retaining actual reading history.

Next choice still executes the VM without recording skipped text as seen. A passed
segment on a completed canonical path remains assumed read; passing any other
segment does not make it read. Skip read uses either normal or assumed status and
stops at unread dialogue and choices. Save restore/reset/session deletion do not
invent reading events. Local activity remains local; shared progress can enable
the same assumed paths on another device without syncing study counts.

Current verified paths: Misae (5,685 IDs), Yukine (8,043), Sunoharas (10,158),
Ryou (9,716), Kyou (13,913). These counts include common story sections; do not add
them as unique totals. Other routes explicitly show “No verified read path yet”
in Route progress/debug. Several campaign traces depend on prior global state
and diverged during fresh-start replay; those paths were rejected, not guessed.
This feature does not expand original-console fidelity or all-route coverage.

Reproduce the private sidecar with the original campaign report:

```sh
node scripts/build-clannad-read-paths.mjs private/library/clannad-live \
  private/clannad/basics-audit/campaign2/report.json \
  private/clannad/read-paths-rebuilt.json
```

The tool reconstructs parent choice traces, executes from source entry with fresh
state, checks every choice and ending, and only accepts actually earned completion
flags. It never runs the disc executable. Output includes successful paths and
rejected-run diagnostics; timing/media completion are simulated. Existing outputs
are never overwritten. The deployed sidecar is under the private import; it is
not part of the distributable code package. No user save/progress is changed by
building it. Only this fixed sidecar filename was added to the server allowlist.

Never7 now uses the same policy for all ten main good outcomes, with its own
source-entry replay builder and signature-bound private sidecar. See
[Never7 read status](never7-read-status.md) for the exact paths, browser evidence
and commands. Shared completion flags enable the same assumptions on another
device; activity remains local. Append extras have ordinary read tracking only.
