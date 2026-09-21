> Update 2026-09-21: the user authorized and now has the initial
> [Add game / Import ISO UI and background job layer](import-gui.md), including
> resumable device uploads. The original plan below is retained as the roadmap;
> its clean-install/full-import acceptance, direct-ISO playback and release audit
> are not all complete. Nothing is publicly published.

# Plan: distribute the reader with a bring-your-own-ISO workflow

Written 2026-09-19. **Status: future implementation plan, not implemented by this
document.** The existing CLI importer and code-only packaging are already real;
the onboarding interface, import jobs and direct-ISO runtime described below are
proposals. This request authorizes recording the plan, not starting its execution
or publishing the project.

## Intended outcome and scope

Someone downloads the toolkit without any commercial game content, supplies their
own supported ISO, imports it entirely on their own machine/home server, and reads
it through the existing browser reader. Artwork, Japanese text, music, voices and
recoverable animation data come from that person's disc. The toolkit supplies
decoders, the interpreter and reading features.

The first supported target remains **Japanese PS2 CLANNAD SLPM-66302 v1.01**.
Pia Carrot stays paused. Another CLANNAD edition or another PS2 VN requires separate
format identification and validation; recognizing an ISO does not establish engine
support. Preserve the current reader, source-driven story execution, local/shared
save selection, learning output, mobile overlay layout and CRT compositor.

Implement the convenient **local import workflow first**. Reading resources from
the ISO during play is a separate, optional second phase. It is not necessary for
distributing a toolkit without game content. Full native-animation fidelity is
also a separate workstream; neither packaging nor direct ISO access proves it.

Initial deployment target: a Linux local/home-server application, accessed from
Windows and Android Firefox/Chromium. Native Windows installers and a browser-only
ISO importer are later portability work, not prerequisites for the first release.

## Existing foundation to reuse

| Responsibility | Existing code / documentation |
| --- | --- |
| Read-only ISO9660 access and safe extraction | `vnkit/disc.py`, `vnkit/source.py` |
| Edition detection and HuneX archives | `vnkit/adapters/clannad_ps2.py`, `hunex.py` |
| Scripts and executable-derived data | `clannad_script.py`, `clannad_native.py`, `clannad_expression.py` under `vnkit/adapters/` |
| Graphics/audio/movie conversion and import | `vnkit/adapters/clannad_{media,audio,effects,movie,import}.py` |
| Engine behaviour and presentation | `web/adapters/clannad-*.mjs`; generic reader under `web/` |
| CLI, serving and packaging | `vnkit/__main__.py`, `vnkit/server.py`, `vnkit/package.py` |
| Repeatable dependency setup | `scripts/bootstrap-clannad-media.py`, `scripts/audio-tools.lock.json` |
| Contracts and limits | [Adapters](adapters.md), [import guide](clannad-import.md), [formats](formats-clannad-ps2.md), [runtime](clannad-runtime.md), [basic execution](clannad-basic-execution.md) |
| Deployment, saves and tests | [Remote access](remote-access.md), [shared saves](shared-saves.md), [testing](testing.md), [provenance](provenance.md) |

Current pipeline:

```text
Owner's ISO, read-only
    → verified edition + archive/script/native-data recovery
    → local private conversion workspace
    → private imported game package
    → existing interpreter and browser reader

Distributable: toolkit code + documentation + original synthetic fixture
Excluded: ISO, extracted/converted game content, saves, activity, private tools
```

The current release builder uses an explicit allowlist. A code-only archive is
already produced, but a clean, independent installation/import must still be
demonstrated before calling the distribution turnkey.

Assets are not embedded in the generic reader. Some motion/placement tables are
already recovered from the supplied executable/resources into private metadata.
Other effects are procedural PS2 routines: the adapter implements their behaviour,
with documented simplifications. Reading bytes from the ISO cannot replace those
implementations automatically. A future executable/emulator integration would
need its own compatibility, selectable-text and state-restoration investigation.

## Milestone 1 — prove the distribution boundary and a clean import

- Audit the release allowlist and public adapter/test files for commercial text,
  embedded image/audio bytes, copied tables and generated private metadata.
  Trace imported native-data fields back to their disc locations. Keep format
  definitions and original interpreter behaviour in code; recover content tables
  from the owner's source instead of pasting them into the repository.
- Unpack a code-only release into a fresh private test directory. Supply only the
  owner's ISO and documented software dependencies. Do not reuse the existing
  extracted resources, converted assets, imported library or machine-specific
  absolute paths. The separate running reader must remain untouched.
- Run the existing pipeline from that ISO with a fresh workspace/output. Record
  dependencies, hashes, disk usage, elapsed stages and any undocumented assumption.
- Compare the rebuilt content's source instruction IDs, native tables, asset
  mappings and decoding results with the current verified import. Account for
  documented tool-version and ISO-versus-directory manifest differences explicitly;
  do not weaken source checks just to make the comparison pass.
- Review third-party dependency licences and notices before deciding whether to
  download tools during setup or redistribute them. Original toolkit MIT licensing
  does not license commercial game content or settle third-party redistribution.

**Exit evidence:** a fresh-directory import report and release-content audit,
with no dependency on the development machine's old game cache. A built usable
partial import must retain its incomplete-runtime status. Current exit code 3 is
not a generic I/O error and must not be silently converted into full compatibility.

## Milestone 2 — reliable installation and background import jobs

Keep the working CLI as the underlying implementation. Add a small job layer
rather than maintaining a second importer in the web application. Suggested
module names such as `vnkit/import_jobs.py` are proposals, not existing commands.

- Preflight Python, Node validation support, FFmpeg/ffprobe and pinned vgmstream;
  detect missing/wrong versions before a long conversion. Downloads fetch software
  only, verify hashes, stay local and produce clear offline/missing-tool errors.
- Preflight writable destinations and estimated free space. Existing media copies
  are roughly 6.5 GiB each, with additional ISO/extraction/staging space; measure
  the actual peak instead of presenting that figure as a universal requirement.
- Give each import a persistent job ID, source fingerprint, adapter/tool versions,
  settings, stage and completed/failed resource counts. Stages cover inspection,
  extraction, script/native recovery, media conversion, validation and installation.
- Report meaningful stage progress, warnings and recoverable errors. Avoid a fake
  single completion percentage or invented time estimates.
- Cancel at safe boundaries; write artifacts atomically; resume exact verified
  outputs after interruption/restart. Changed inputs/settings require a distinct
  workspace. Preserve originals and reject traversal, unsafe extents and clobbers.
- Limit simultaneous conversions and resource use so importing does not starve an
  active reading session. Use structured subprocess arguments, never shell-built
  commands from paths supplied by a browser.
- Stage outside the served library. Install only after classification/validation;
  invalid content never becomes a playable entry. A usable partial import gets
  clear limitations. Preserve previous builds, reject competing identical game
  IDs and never switch a running session's content underneath it.

**Exit evidence:** successful resume after interrupted conversion; safe failures
for corrupt input, wrong edition, missing dependency, disk exhaustion and changed
source; a running reader retains its game and saves during import failure.

## Milestone 3 — “Add game” interface on top of the jobs

Keep the ordinary reading/library interface compact. Provide a dedicated import
panel with this sequence:

1. Choose a source available to the local server.
2. Show detected title, platform, exact edition, support limits and required space.
3. Resolve dependency/preflight failures, then start the import.
4. Show stage/resource progress, cancellation and resume after page/server restart.
5. Show the validation result and install/open the import with its honest status.

For the first home-server version, sources come from an explicitly configured
import directory or a source registered through the CLI. The browser receives
opaque source IDs, not unrestricted server filesystem access. A file picker on
the Z13 selects a file on the Z13, not one on the development host; make that distinction explicit.
If device-to-own-server transfer is added later, show the destination/transfer
clearly, bound its size and support interruption. Do not imply that this transfer
is needed when the ISO is already on the server. No third-party upload is involved.

Use existing authentication and origin protection for any new mutating endpoints;
do not expose arbitrary paths, commands or a public upload service. Diagnostic
exports should omit raw script text, assets, save contents, tokens and private
paths. Preserve detailed source evidence privately for debugging.

Keep one-time imported games readable after the ISO is disconnected. Keep local
saves, shared saves, global progress and activity independent of import/cache
cleanup. Preserve stable source IDs and save compatibility; do not silently
invalidate saves because only packaging or resource delivery changed.

**Exit evidence:** a new user can complete the documented Add game flow without
editing source code. Reloading the browser does not lose the job; blocked and
partially compatible imports are distinguished; existing reading features remain.

## Milestone 4 — release and handover acceptance

- Re-run clean installation/import from the proposed release, not the development
  checkout. Use isolated library/state directories, ports and browser profiles.
- Validate all discovered scripts/resources; report unsupported presentation and
  unverified routes separately from extraction success. Current CLANNAD issues
  include 81 atlas/format entries, credits/MZD/montages and timing/audio gaps;
  earned After Story and original-PS2 comparisons remain incomplete.
- Exercise at least 100 consecutive actual segments, choices/conditions, scene
  changes, body/face atomic loading, available audio/movie and source endings.
  Verify saves before/after choices, route progress and returning to the menu.
- Recheck selectable Japanese/ruby export, backlog, clipboard failure/success,
  actual external WebSocket reception, auto/skip/Next choice and activity
  deduplication across restoration/reload. Use synthetic data for public tests.
- Recheck both mobile orientations/fullscreen, opacity, CRT and font preferences.
  Distinguish automated desktop-browser emulation from physical Android/Z13 and
  Yomitan checks. Never use the user's live shared-save bank for test writes.
- Audit tarball/container contents: no commercial assets/scripts/tables, ISOs,
  local study data, tool caches or secrets. Verify manifest checksums and notices.
- Update setup, support matrix, troubleshooting, provenance, AGENTS.md and the
  repository import skill. Document local/shared backups and code-version rollback.
  Prepare the release locally; public publishing still needs the user's instruction.

**Definition of done:** the code-only release reproducibly imports the supported
owner-supplied ISO on a clean Linux installation and launches the existing reader,
without preinstalled private game data. Compatibility claims match actual evidence.
This milestone does not claim full animation fidelity or universal PS2 support.

## Optional phase 5 — resources read from the ISO during play

Start only after the local-import release works. Benchmark first-load delay,
storage duplication and repeat-scene performance to decide whether this is worth
the extra complexity. Prototype one real image and one voice from the existing
ISO before changing the whole asset pipeline.

Proposed design:

- Keep a verified, read-only ISO source registered on the server. Index disc and
  archive extents once; identify members by source/archive index, not filename
  alone (this disc contains duplicate member names).
- Recover scripts and executable-native metadata at setup so complete static
  validation and stable VM/source IDs still work. The media resolver can be lazy
  without changing story execution or revealing future text to learning feeds.
- Add a small resource-provider boundary accepting registered asset IDs. Retain
  the existing converted-file provider; add an ISO-backed provider using the same
  decoders and converters. The generic reader continues requesting asset URLs.
- Key cached derivatives by source/member fingerprint, decoder version and output
  settings. Preserve dimensions, colour/alpha and lossless output policy. Avoid
  unconstrained in-memory decoding; bound workers and prevent duplicate jobs for
  simultaneous requests for the same resource.
- Decode a complete scene before swapping portraits. Prefetch the assets needed
  for the next presentation where source execution permits it, without publishing
  or counting unpresented dialogue. Do not speculate route choices to preload text.
- Convert audio/video into seekable cached derivatives before serving range
  requests; never serve half-written files or promise zero loading stalls. Preserve
  voice completion, movie resumes and save/media restoration.
- If the ISO moves/disconnects or changes, report it and offer a verified reattach.
  Never substitute resources from another edition or advance past a failed load.
  Unlike a complete import, uncached resources require the ISO to remain available.
- Bound caches and offer cleanup of rebuildable derivatives only. Do not evict
  in-use resources, required indexes or user saves/activity; clearing a cache must
  not become a hidden game-content deletion operation.

**Acceptance:** representative execution/text/state traces match the converted-file
provider; source images and decoded audio match; save compatibility is retained;
cold/warm loading, cancellation, concurrent clients, missing ISO and cache eviction
are tested. Publish measured storage/latency tradeoffs, not assumed improvements.
Only then consider making ISO-backed media the default or tackling browser-only
decoding/WASM and its separate file-access, storage and codec requirements.

## Separate workstream — improve original animation fidelity

Maintain a per-event list of what is source data, what is interpreter behaviour
and what is still simplified. Recover more motion/sequence tables into private
imports when the disc provides them. Implement missing native procedural behaviour
with source evidence and original-engine comparison where available. Keep unknown
control/state instructions fail-closed and update compatibility reports honestly.

Do not promise that direct ISO reading will restore omitted native effects. If
executing original PS2 routines is pursued, first prove a bounded emulator/runtime
experiment with synchronized selectable Japanese text, choices, full-state saves,
audio and the reading-event interface. That is a separate architectural decision,
not a prerequisite for distributing the current importer.

## First action when this plan is resumed

Read AGENTS.md, this plan, [the handoff](next-session.md) and the linked import/
runtime documents. Check current CLI flags and dependencies, then start milestone
1 in an isolated directory. These are existing commands to adapt to that fresh
test setup, not new commands introduced by the plan:

```sh
python3 -m vnkit inspect /path/to/owners-copy.iso --fingerprint
python3 -m vnkit import /path/to/owners-copy.iso --adapter clannad-ps2 \
  --work private/byo-iso-audit/work --out private/byo-iso-audit/library/clannad
python3 -m vnkit validate private/byo-iso-audit/library/clannad
```

Record command outcomes individually: incomplete-runtime exit 3 is expected
today; do not chain past it as if import failed to create anything, or suppress
it as if full compatibility passed. Do not reuse these example destinations if
already occupied by different inputs/settings. Keep the live `clannad-live`
installation and `vnkit-reader.service` untouched throughout the audit.
