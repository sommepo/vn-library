# Adapter development and another-game workflow

| Adapter | Tested source | Status |
| --- | --- | --- |
| clannad-ps2 | SLPM-66302 v1.01 / HuneX | Incomplete playable runtime; see CLANNAD reports |
| remember11-ps2 | SLPM-65550 v1.02 / KID | Incomplete playable script runtime with original media; import/validation exit 3 |
| pia-ps2 | SLPS-25222 v1.04 | Paused incomplete runtime |
| synthetic | Original bundled fixture | Public tests only |

[Remember11 runtime](remember11-runtime.md) and [import guide](remember11-import.md)
describe the new adapter. The [initial trial](remember11-investigation.md) records
why the unmodified CLANNAD toolkit could not run this different engine.

CLANNAD SLPM-66302 v1.01 remains supported: see [its import guide](clannad-import.md),
[format notes](formats-clannad-ps2.md) and [runtime limits](clannad-runtime.md).
`clannad-ps2` supports only this tested executable; other HuneX games are untested.
The shared `vnkit/source.py` provides bounded ISO/directory reads for new adapters.

The reader's [Next choice traversal](reader-interface.md) repeatedly calls the
normal `advance` contract; it does not inspect future script text. Adapters must
apply final native-wait state in `advance` and reject every unresolved control
instruction. It stops at choices, movie/sound/input boundaries or the end. The
reader restores the pre-jump snapshot on failure/cancellation. Compare both
branches against ordinary execution before claiming a new adapter supports this.

The paused first commercial target is SLPS-25222 v1.04. Its adapter supports static
recovery and a separate incomplete SCRP runtime. See [runtime coverage](pia-runtime.md)
and [next-session handoff](next-session.md). Do not infer NOBORI engine-wide support from it.

## Shared-engine investigation

Start with the [CLANNAD technical fingerprint](clannad-engine-fingerprint.md),
including its parser/VM/ELF comparison checklist and animation research gate.
AIR, planetarian and Tomoyo After are user-prioritized comparison candidates,
not confirmed compatible releases. Record equivalent fingerprints as subsequent
games become supported; retain edition-specific evidence and limitations.

Treat shared engines as a hypothesis to test before writing a new parser. A new
title is not automatically a new technical format; a shared publisher, developer
or database engine label is not sufficient proof of compatibility either.

1. Fingerprint the exact platform, edition and executable. Record archive magic,
   table layouts, script headers, codecs and characteristic paths from bounded,
   read-only inspection. Retain offsets and samples privately.
2. Compare those structures with the existing Remember11 and CLANNAD format and
   runtime notes linked above. Strong similarities warrant testing a common
   implementation before treating differences as game-specific. Consult existing
   Pia notes if relevant, but do not resume its paused ISO/runtime work.
3. Search existing documentation and implementations for the observed signatures,
   including other engine families when evidence points there. Check platform and
   version: a PC or PSP parser is a lead, not proof of PS2 compatibility.
4. Check upstream licences before reuse. Run suitable parsers on private samples
   with bounded reads and isolated output. Record parser revision, exact command,
   results, failures and the extent of the tested corpus. Do not upload samples.
5. Choose reuse at the demonstrated layer: archive helper, compression codec,
   image/audio decoder, script parser or interpreter. Extend an existing adapter
   with explicit edition differences when supported by evidence; retain a new
   adapter when semantics differ. Avoid both duplicate implementations and a
   speculative generic engine framework.

### Research leads

The user supplied the following **leads to investigate**, not a compatibility
claim for every edition: the KID → MAGES lineage, including research grouping
Ever17, Never7 and Memories Off; DAT/LNK archives, SCR/SC3 scripts, CPS/PRT images
and WAF audio. When such signatures appear, consult Committee of Zero's MAGES
Engine Compendium, `CommitteeOfZero/impacto`, GARbro, MagesTools and historical
AnimED/KID tools before independently reconstructing the format. Verify each
project's actual target formats, platform coverage and licence at investigation
time; naming a project here does not authorize copying its code.

These are search leads, not mandatory expected filenames for Remember11 PS2.
Its current AFS/BIP/MAC evidence and CLANNAD's HuneX evidence remain the starting
points for those editions. Also investigate other shared families: do not force
an unfamiliar disc into KID/MAGES merely because that family is documented.

### Evidence and confidence

| Evidence | What to establish before claiming reuse |
| --- | --- |
| Archive headers and tables | Field widths, offsets, bounds, alignment and extraction results agree |
| Compression/encryption | The same implementation decodes representative entries with validated output |
| Script magic and headers | Version, section layout, offsets and text encoding agree |
| Bytecode | Operand widths, control flow, state and opcode semantics agree, not just opcode numbers |
| Image/audio containers | One decoder successfully handles both sources; this alone is not VM evidence |
| Paths, filenames or ELF strings/code | Corroboration tied to source offsets; labels alone are weak evidence |
| Existing parser succeeds | Record its revision and corpus; successful extraction is not successful execution |

Report **confirmed** compatibility only for the layer actually demonstrated.
Use **probable** for corroborated structural similarities whose semantics or
coverage remain untested, and **unknown** where evidence is insufficient. Common
middleware such as an archive/audio container does not establish a common story
engine. Conversely, an unmodified adapter failing does not prove that the games
share no reusable technology.

Each investigation should include the candidate family, exact compared editions,
evidence locations, parser/tool provenance and licence, test commands/results,
contradictory evidence, confidence and proposed reuse scope. Keep disc opening,
asset decoding, script recovery and faithful execution as separate outcomes.
Update `docs/provenance.md` when adopting upstream tooling. Do not reorganize or
restart working adapters solely to fit a proposed lineage.

## Small interface

An adapter provides `detect(source) -> identification`, `inspect(source,
fingerprint=False) -> report`, `extract(source, destination) -> manifest`, and
`import_game(source, out) -> compatibility_report`. Source is an ISO path or an
extracted **disc** directory retaining the original archive files. The generic
CLI dispatches to the target adapter; the generic reader knows no ISO filenames.

`disc.IsoImage` supplies ISO extents and `vnkit.source.Source` supplies bounded
archive reads from either an ISO or directory. Reuse `disc.write_stream`,
`write_bytes` and `write_json` for atomic no-clobber output. Do not bypass those
helpers for extracted filenames. Exact identical output resumes; changed
versions require a new output directory, preserving the previous import.

`manifest.json` must identify input SHA-256, byte size, adapter/tool versions,
conversion settings, warnings and source-to-output mappings. `compatibility.json`
must distinguish disc access, archive extraction, static scripts, graphics/audio
conversion, and actual story/presentation execution. A blocked import emits a
blocked `content.json` library record and returns CLI exit 3. That is an
intentional unsuccessful validation, not a playable game.

## Adding support

1. Run `python3 -m vnkit inspect /absolute/path/to/game.iso --fingerprint`.
   Detection must use internal evidence. An ISO extension or commercial title
   alone says nothing about engine compatibility; inspect console editions.
2. Follow [shared-engine investigation](#shared-engine-investigation), compare
   existing adapters and check `docs/provenance.md` and upstream licences.
   Prefer a proven extractor/interpreter. Do not download absent game
   assets, execute installers for identification or upload input data.
3. Add one bounded module under `vnkit/adapters/`; register its exact edition in
   `vnkit/adapters/registry.py`. Reuse disc and media helpers when signatures,
   versions and tests support reuse. Avoid optimistic catch-all detection. A
   recovery-only adapter must not receive browser-import eligibility.
4. Establish true startup/order from script or executable references. Implement
   native gameplay as well as presentation. Preserve signed arithmetic, variable
   scope, interrupts and asynchronous control if the engine uses them. An unknown
   state-changing instruction is a source-located stop, never a no-op.
5. Translate to `web/engine.mjs`'s versioned contract only when semantically
   appropriate. A dedicated interpreter can instead present the same complete
   text events/DOM layer; do not force a VM into a linear text sequence.
6. Add original synthetic corruption/control-flow tests, plus a private audit
   command operating on the user's own source. Verify every discoverable script,
   media reference and opcode; explicitly report dynamic unresolved references.
7. Test 100 real sequential segments and branches, saves before/after choices,
   media changes and original-engine comparisons for a playable adapter. Mark
   gaps unverified. Update the investigation/format notes, support matrix and
   provenance. See [adapter contributions](adapter-contributions.md) for the
   public PR/evidence contract; maintainers handle local handoffs and operational
   agent instructions separately.

## Import another tested CLANNAD copy

```sh
python3 -m vnkit inspect /path/to/other-copy.iso --fingerprint
python3 -m vnkit import /path/to/other-copy.iso --adapter auto --work private/other-clannad --out private/library/other-copy
python3 -m vnkit validate private/library/other-copy
```

Install the optional media dependencies first, as described in the CLANNAD guide.
Support is edition-specific and incomplete; import/validation exit 3 honestly.
Supply a fresh workspace and output; do not serve duplicate IDs concurrently.
No other CLANNAD edition or other HuneX game is claimed supported.

## Paused Pia import procedure

Another lawful copy of the **same standard PS2 edition/version** may be recovered:

```sh
python3 -m vnkit inspect /path/to/other-copy.iso --fingerprint
python3 -m vnkit import /path/to/other-copy.iso --adapter pia-ps2 --out private/library/other-copy
python3 -m vnkit validate private/library/other-copy
```

The last two commands intentionally exit 3 until execution is implemented.
Other releases, including SLPS-25221 limited edition, PC and Dreamcast versions,
are not tested or claimed supported. The original test game can be imported with
`python3 -m vnkit import fixtures/synthetic --adapter synthetic --out private/library/fixture-copy`.
It demonstrates the reader contract, not support for another commercial engine.

## Current content contract

`format: "vnkit.content"`, `version: 1`, stable `id`, `title`,
`adapter: {id, version}`, `entry`, `instructions` array, and `assets` dictionary.
Asset records contain `type` and a local relative `url`. Each instruction has a
stable `id`, `op`, optional `source` (archive/script/offset) and optional `next`.
Without `next`, fall-through means the **adapter-authored instruction order**;
it must not be derived from sorted filenames.

`web/engine.mjs` is the authoritative validator and VM; `fixtures/synthetic/content.json`
is an executable example. Supported operations: text, choice, jump, if, set, add,
call, return, background, sprite, music, sound, wait, end. Conditions name a
variable and eq/ne/lt/lte/gt/gte operator. Text is a string or runs of strings and
`{base, reading}` ruby objects. No HTML is accepted as script text.

Saves use `vnkit.save` v1 and bind game ID plus content signature. They capture
the program counter, variable map, stack, scene layers, pending presentation and
media positions. This v1 VM is proven only against the original fixture; it is
not an implementation of the PS2 SCRP register VM.

Adapters may expose `presentationViewport` for a source animation whose native
frame differs from the ordinary artwork plane. The shared reader applies this
width/height only while that presentation is active. A pending presentation may
set `hideText: true` for a full-screen interlude; the next text restores the box.
These are display hints, not text events or changes to activity counting.

A text presentation may set `voiceUntilMs` to an absolute position within its
associated voice. Playback reaching that cue advances the interpreter after text
display; manual advancement still works, and blocked audio retains that alternative.
`continueVoice: true` preserves the current clip instead of restarting it when
text appends. The adapter supplies `displayText` for the full page and `text` for
the newly presented segment only. Saves must validate these hints against source
instructions. Audio effects may carry a `channel`; stop/play actions execute in
their original order, and media snapshots retain channel, position and loop state.


CLANNAD native boundaries can include `presentation` (a normal complete text
segment) inside `wait`/`pause`; this preserves concurrent original dialogue instead
of deferring it to the next key wait. An optional `dialogue` array separates multiple
speakers for counting/export while the original combined text remains selectable.
These additions are presentation fields, not a new raw-script/save version. The
import manifest records `adapter.importRevision` and `implementation_sha256` for
the importer and reader at conversion; the independent disc-extraction version
continues to identify the packed-sector cache. Reader improvements that retain
raw script/native identity intentionally remain compatible with earlier saves.

A legacy save may have no pending presentation because an earlier adapter stopped
at an unsupported source instruction. Restore its verified VM state, run that PC,
and count/emit only newly reached presentation. Normal advancement now keeps a
visible checkpoint and rolls back interpreter failures before saving. Do not
republish a restored text boundary or silently jump over the failing instruction.


## Optional persistent progress interface

The reader recognizes `progressSnapshot()`, `applyProgress(record)`,
`newGameEntries()` and `startNew(record, entryId)` on an adapter. CLANNAD implements
these for its source G bank and native title gate. Data has its own format/version,
game ID and runtime signature. The generic reader stores it outside slots and
activity, preserves it during ordinary restores and offers explicit backup/import.
Entry IDs and unlock rules belong to the adapter; hidden future entries must not
be exposed by generic UI. The pure VM `restore` still restores a standalone save;
the browser then applies its persistent progress before further execution.

Generic scene layers accept optional `opacity` in [0,1]. A choice may carry an
original `promptAsset` image alongside selectable DOM options. A wait can use
`voiceWait` to wait for the actual immediate-voice audio object. These additions
were proven first with this edition; they are not a claim of all-HuneX support.

Optional menu interfaces: `routeProgress()` returns named completion rows;
`markRouteComplete(id)` explicitly updates user-requested debug progress;
`finishEnding()` records a source-verified end; `soundtrack()` returns
`{asset,label}` music rows. `sceneOverlays()` returns original asset geometry
`{asset,x,y,width,height,role}` in viewport percentages. Keep mappings in adapters.
All normal layers and overlays decode in a detached tree before one visible commit.
Optional progress `completions` preserves manual/source provenance and must be
validated on import; it is independent of execution saves and activity history.
