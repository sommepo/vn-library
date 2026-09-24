# Local or shared saves

Each browser chooses a save location **per game**. Existing users remain in local
mode until they opt in. No local records are moved, erased or silently uploaded.
Shared mode uses this same reader's home server, not a cloud service or account.
Joining a shared bank now caches its acknowledged snapshot immediately, even
when resuming creates no new write. This separate recovery cache never replaces
the device-local bank. The Remember11 adapter has also been tested with two
profiles and a complete late-game 15-slot bank; see its runtime report.

## Enable sharing

1. On the browser with the saves you want to keep, refresh the reader and open
   **Saves → Save location** (also available under Library).
2. Choose **Copy local saves to server & use shared** if the server bank is empty.
   This copies the existing manual slots, autosave, quicksave, pre-choice position,
   route progress and pre-debug progress backup. The browser reloads into shared
   mode and resumes that bank's autosave. Local originals remain intact.
3. On another device, open the same private home-server reader and choose
   **Saves → Save location → Use shared saves**. Existing server data is used;
   the second device's local bank is retained separately.
4. Close the previous device's reader before continuing elsewhere. Wait for
   **Shared saves · saved** before closing, especially after a choice.

**Use local saves** switches back and resumes that browser's local autosave.
It does not overwrite local slots with the shared bank or remove server data.
The location preference belongs to this browser/origin, not a game save. For
consistent access use `https://your-server.your-tailnet.ts.net:8891/` with Tailscale enabled.
No new port or change to the existing private route is required.

## Copy between local and shared saves

Open **Saves → Save location → Copy saves** (or **Library → [game] → Save location**).
Choose **Replace local saves with shared** or **Replace shared saves with local**.
The confirmation shows the game, direction and number of saved positions.

This replaces the destination's complete save bank, including route progress.
Empty source slots clear the corresponding destination slots. The source bank
stays intact. After copying, the reader switches to the destination and resumes
its autosave. Reading activity, read-text history and preferences stay on this
device and are not overwritten.

A backup of the previous destination is kept in this browser. Reopen Save
location to export it. The latest backup for each direction is retained; export
it before another copy if you want to keep older versions. The server also keeps
its existing bounded revision history. Backups contain private game state.

Copying refuses a stale destination or an unresolved failed shared save. Retry
that save or explicitly select the server position first. Close other reader
tabs before copying. A dropped connection preserves the replacement operation
for retry without turning it into a merge. Both client and server must be updated.

To move just one slot, export it, switch location, import it, then save it into
the desired slot. Loading an individual slot retains current route progress.

## What is shared

- All 15 manual slots, quicksave, autosave and before-next-choice restore slot.
- Persistent route-unlock progress and the progress-before-debug backup.
- Complete interpreter/save state and recorded media positions, using the same
  game/signature checks as local saves.

Reading activity, sessions, seen/read markers, backlog, bookmarks, clipboard
settings and CRT/display preferences **remain device-local**. Thus Skip read uses
what that device has encountered. Switching/loading a save never imports another
device's study totals or counts the restored text as new reading. Shared progress
is still independent of individual execution slots and reading history.

This is one shared bank per installed game on this private server; it is not a
multi-user account system. Anyone authorized to use this reader can use that bank.
Local mode remains useful for independent device playthroughs.

## Conflicts, connection loss and recovery

### Delete a save slot

Each occupied row in **Saves** has **Delete**, with a confirmation naming the
active save location. It removes only that position from the selected bank:
local deletion affects this browser; shared deletion affects the server bank
used by your devices. The separate local bank, other slots, current running
story, route progress and reading history are retained. Empty slots remain
available to save into again.

Autosave can also be deleted. Background snapshots will not recreate it for the
unchanged current presentation; continuing/restoring the story resumes autosaving.
Quicksave and before-next-choice are recreated when their corresponding actions
are used. Deleting a slot does not erase exported copies or bounded server backup
history. It is not a secure-erasure function.

Shared deletion uses a `null` change for a fixed save-slot name. The stored bank
omits that key, rather than storing a null save. Route-progress keys cannot be
deleted through this operation. Normal revision checks, retry receipts and
recovery also cover deletion: stale devices cannot erase a newer slot, and a
lost acknowledgement does not commit a deletion twice. Failed deletion preserves
its exact operation for explicit retry; it never silently deletes a local copy.

### Revision and recovery rules

The server commits updates atomically in SQLite using a monotonically increasing
bank revision. Each device writes against the revision it last acknowledged.
An older tab cannot silently overwrite a newer device's bank: HTTP 409 pauses its
shared saving/advancement. Autosave includes route progress in the same update.
Queued writes within one device are serialized. The previous 20 bank revisions
are retained in a bounded server history for recovery, not exposed as normal slots.

A transient network error, incomplete success response or HTTP 408/502/503/504
gets at most two retries (600 ms and 1.6 s backoff, 15-second request timeout).
Every retry sends the same operation ID, data and base revision. The server
stores a receipt in the same transaction as the save, bounded to 64 receipts per
game. If a reply is lost after commit, retry acknowledges it without another
revision. A newer intervening bank revision still returns 409; conflicts are
never automatically retried. Token refresh also keeps the same operation.

An exhausted network/commit failure pauses shared saving. The attempted bank is retained
under a separate browser `shared-recovery` record when storage is available.
Before sending, `shared-pending` also stores the exact operation and candidate,
so an interrupted tab can offer recovery after reload.
Saves → Save location offers **Export unsynced recovery** and an ordinary
**Export recovery position** file that can be loaded with Import save. The last
acknowledged bank is cached separately as `shared-cache` and can be exported.
Neither record replaces the user's original local save bank. Export these files
before clearing browser data. A full browser quota can prevent the recovery copy;
the reader reports that and retains explicit current-state export.

After reconnecting, refresh and open **Library → Save location → Retry unsynced
save**. If an unresolved pending/recovery record exists, opening shared play stops
there before resuming an older server position or writing over the pending record.
Retry uses the original revision. It refuses a newer bank; legacy recovery copies
without operation IDs are also protected by their original revision. An exact
candidate already present on the server can be acknowledged without another write.

**Reload shared saves** explicitly chooses the server's acknowledged position and
archives the recovery for export. **Use local saves** returns to the separate local
bank. Retry success reloads directly into shared play without flushing the old
engine first. Recovery copies are never silently merged with another device's
progress. There is no offline merge or guarantee that tab-close networking finishes.
Normal presented positions are saved before advancement finishes; media-clock
updates also use the existing periodic/visibility snapshots.

## Backups

Individual slot, global-progress and activity exports continue to work. Shared
Save location additionally exports a versioned JSON bank containing all stored
positions and progress. Its `records` values are ordinary save/progress objects;
individual exports are easiest for restoring through the current UI.

The authoritative server file is `private/state/shared-saves.sqlite3`, or
`shared-saves.sqlite3` under your custom `serve --state` directory. Docker's
existing writable `/state` mount covers it; images still exclude private data.
Use the consistent SQLite backup helper while the service runs:

```sh
python3 scripts/backup-shared-saves.py --out private/backups/shared-saves-2026-09-19.sqlite3
```

Use a new filename each time; existing backups are refused. The helper uses the
SQLite backup API, checks integrity and publishes the backup without clobbering
an existing file. To restore a database backup, close reader tabs, stop only
`vnkit-reader.service`, preserve the current database first, replace it with the
chosen backup, then start the service and reload readers. Do not copy a live
SQLite file as a substitute for a consistent backup. Back up local browser
activity separately; it is not in the shared database.

## Implementation and access

- `web/save-storage.mjs` routes only an explicit allowlist of save/progress keys.
  Local keys retain their existing IndexedDB layout; separate shared cache and
  recovery keys never collide. A tab captures its selected mode so another tab
  changing preferences cannot silently redirect its writes.
- `vnkit/shared_saves.py` provides atomic compare-and-swap, bounded records,
  persisted revisions, retry receipts and history. Game/format/signature envelopes are checked;
  detailed execution-state validation remains in the adapter at restore time.
- `GET /api/saves/<game>` reads the bank. `POST` accepts versioned changes with
  `baseRevision`, optional `operationId` and a separate same-origin save-session token. Writes are limited
  to installed games and fixed slot names, 512 KiB per record / 4 MiB per bank.
  A null change deletes only a fixed save position, never route-progress keys.
  Explicit `replace: true` accepts a complete bank (including an empty bank)
  and replaces route progress as part of the confirmed copy. It uses the same
  revision checks, limits, receipts and history; null records are not accepted.
  The session response advertises `bankReplacement: 1` so an older server cannot
  silently treat a replacement as a merge.
  No activity records, arbitrary paths or public diagnostic dumps.
- Existing Host/Origin checks, Tailscale HTTPS/device authentication or configured
  HTTP Basic authentication protect both reads and writes. Additional WebSocket
  consumer origins such as Renji are **not** granted save access. POST requires
  JSON and a custom token header; CORS is not enabled. Tokens refresh after an
  ordinary server restart, but bank revisions survive it.

## Test evidence

`private/browser-tests/shared-saves-v1/results.json` records ten passed groups on
an isolated server and two fresh Chromium profiles, using the private reached
CLANNAD portrait checkpoint. It covers local isolation, migration including slot
15 and manual-progress provenance, cross-device exact-position resume without
recounting, slot load/progress preservation, stale-writer protection, local switch,
network failure/recovery, acknowledged-position reload, export and mobile layout.
It never writes the live server's save bank. Manual flags in this test are not
natural route-completion evidence.

Six shared-store unit tests and five Python storage/API tests cover queueing,
atomic progress, immutable recovery, identity/signature errors, malformed records,
bounded revision history, persistence across reopen, origin/token/basic-auth rules.
Existing reader/server regression tests and a private 100-page local-mode browser
run cover unchanged local behavior. Physical Windows/Android/Tailscale handoff
still needs the user's own device check.

```sh
python3 -m unittest discover -s tests -p 'test_shared_saves.py' -v
node --test tests/reader-shared-saves.test.mjs
VNKIT_REPORT_DIR=private/browser-tests/new-shared-saves sh scripts/browser-env.sh node tests/browser-shared-saves.mjs
```


## Connection fix verification (2026-09-19)

The reported “Cannot reach shared saves” was a failed browser fetch; the precise
Z13 network failure could not be observed from the server. Read-only diagnostics
found a healthy database and successful local/private HTTPS reads and a rejected,
non-mutating HTTPS POST. One HTTP/1.1 defect was corrected: save POST deliberately
closed its socket but omitted `Connection: close`, allowing clients/proxies to
attempt reuse during closure. Other applications and Tailscale routes were untouched.

`private/browser-tests/shared-save-retry-final/results.json` passes 12 groups on
an ephemeral server/database and two fresh browser profiles. In addition to the
original sharing checks, it commits an actual CLANNAD save and deliberately loses
the reply: the identical retry increments the bank once. Persistent network loss,
reload, explicit Retry and exact source-occurrence restoration pass without local
bank or reading-count changes. Eleven shared-store Node tests, seven Python shared
storage/API tests and eighteen server tests pass. Backend token rotation, legacy
recovery, conflicting recovery and persisted/bounded receipts are covered in the
unit tests. Physical Z13 networking remains a user-device check.

Before rollout, the live database was backed up consistently to
`private/backups/shared-saves-before-retry-fix-20260919.sqlite3`. The service alone
was restarted; its live bank was not used for test writes.

## Whole-bank copy checks (2026-09-24)

`tests/browser-save-copy.mjs` passes in Chromium and Firefox with separate
profiles and a temporary database, using a real CLANNAD checkpoint. It covers
cancel, both copy directions, replacing a nonempty bank, removing absent slots,
backups, resume without recounting, activity preservation, and IndexedDB conflict
and failed-backup rollback. No live save bank was written by these tests.

Reader unit tests also cover stale shared revisions, replacement retries after
a lost reply, preserved replacement mode after interruption, empty banks and
refusal against an older server. Nine Python storage/HTTP tests pass. Physical
Windows and Android copying remains a device check.
