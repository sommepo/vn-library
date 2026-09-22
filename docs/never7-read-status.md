# Never7 completed-route read status

The installed Never7 import includes a verified reading path for each of the ten
main good-ending outcomes. Finishing a route or marking it complete in **Route
progress / debug** makes text on its fixed path eligible for red text and **Skip
read**. This is an assumption about prior reading, not study credit.

Only actual source IDs from that path qualify. Shared scenes qualify; unchosen
branches do not. **Next choice** does not add passed dialogue to normal read
history. Removing a completion removes its assumed path while retaining actual
reading history. Append extras use normal encountered-text tracking; there are
no assumed paths for their completion flags.

The path is deterministic, not a reconstruction of choices made on a physical
PS2. Some later routes need earlier source-earned progress to replay. Those
prerequisite routes do not inherit the later route's text.

## Rebuild from private evidence

```sh
node scripts/build-never7-read-paths.mjs private/library/never7-live \
  private/never7/read-path-plan-v1.json private/never7/new-read-paths.json
node scripts/validate-never7.mjs private/library/never7-live \
  private/never7/new-read-paths-validation.json
```

The builder takes an owner-local plan with a `routes` array. Each item has a known
main-route `id`, a `recipe` filename relative to the plan, and optionally
`progressFrom`, an earlier successful replay ID. A recipe contains its native
`entry` (default `start`), exact source `ending`, and `choices` entries with
`source` IDs and zero-based `option` indices. Optional `earned` and `absent` flag
lists add assertions. No progress file or arbitrary flag assignment is used.

Each route starts a fresh VM, follows every recorded choice and must newly earn
its completion at the expected ending. Divergence, unused choices, unknown
instructions and exhausted step limits fail the build. Timing and media completion
are simulated. Only presented text IDs enter the result.

Output is a versioned `vnkit.read-paths` file bound to the import ID and runtime
signature. Installation uses an atomic no-clobber write. Repeating the same build
to identical output is allowed; changed output requires a new filename. Place the
verified result at `read-paths.json` inside the private import. Keep recipes and
generated paths out of public packages. New CLI imports do not yet create this
optional file automatically. Normal read tracking still works without it; the
progress panel explains when no verified path is available.

The whole-import validator checks every listed text ID and ending against parsed
instructions. An absent sidecar is supported; malformed or mismatched evidence
is a validation error and disables assumed status in the reader. Story loading
does not depend on it. Save signatures and state formats are unchanged. Paths
are not embedded in save slots, shared banks or activity data.

## Current evidence

`private/never7/read-paths-v1.json` came from ten complete native-entry replays.
Its **33,762 distinct text IDs** are the union of these overlapping paths:

| Outcome | Distinct text IDs on the path |
| --- | ---: |
| Yuka | 8,794 |
| Haruka | 7,085 |
| Saki | 6,620 |
| Kurumi | 8,165 |
| Izumi normal | 7,416 |
| Izumi Cure A | 11,325 |
| Izumi Cure B | 11,098 |
| Izumi finale | 11,431 |
| Yuka Cure A | 4,328 |
| Yuka Cure B | 4,033 |

`read-paths-validation-v1.json` confirms every ID refers to source text, all 227
tables parse, and no unresolved direct references or validation errors remain.
Validation still exits **3** because native presentation is incomplete. The
33,762 figure is not a full-game completion percentage.

Browser reports use disposable profiles, an ephemeral local server and source
checkpoints. No user's live save bank was used:

- `private/browser-tests/never7-read-status-v1/report.json` and
  `never7-read-status-firefox-v1/report.json`: five groups pass in each browser.
  Manual completion/reload enables red text without counting; Next choice leaves
  passed dialogue uncounted; Skip read follows the path and stops at a choice;
  alternate dialogue stays unread; missing evidence does not block reading.
- `private/browser-tests/never7-shared-v3/results.json`: twelve groups pass across
  two Chromium profiles. Covers opt-in local-to-server copy, slot 15, progress
  retention, exact-position handoff, inherited red text without activity sharing,
  stale-writer rejection, local-bank preservation, network recovery, bank export,
  mobile panel layout, a lost acknowledgement and pending-write retry after reload.
- Thirteen synthetic Never7 VM cases pass, including builder divergence/clear/
  ending checks, malformed evidence and progress/history isolation. The read-status,
  navigation, session and shared-store Node suites pass; eight Python shared-save
  checks and five usage-recorder checks pass.

The first shared-save attempt used a timed ending checkpoint, unsuitable for a
stable-position assertion. The second exposed outdated test interaction with a
modal. The final run uses source dialogue and current controls; no save transport
change was necessary. These are browser simulations, not a physical Z13/phone
handoff or additional PS2 route-comparison evidence.

```sh
sh scripts/browser-env.sh node tests/browser-never7-read-status.mjs \
  private/library private/never7 private/browser-tests/new-never7-read-status
VNKIT_GAME_ID=never7-slps25256-1.01 VNKIT_ROUTE_ID=yuka VNKIT_CLEAR_FLAG=21 \
VNKIT_CHECKPOINT=private/never7/read-status-checkpoints-v1/early-text.json \
VNKIT_REPORT_DIR=private/browser-tests/new-never7-shared \
sh scripts/browser-env.sh node tests/browser-shared-saves.mjs
```

Use a stable dialogue checkpoint, not a wait, movie or ending, for the shared-save
test. Firefox accepts `VNKIT_BROWSER=firefox`; this host's additional test-library
environment is documented in [testing](testing.md). Reports stay private.
