# 428 PSP: recovery and runtime boundary

The supplied **428 ～封鎖された渋谷で～**, Japanese PSP **ULJS-00219 v1.01**,
is readable. The `428-psp` adapter recovers its archives and structurally parses
its scenario data. **It is not a playable VN Library import.** No 428 tile,
browser import eligibility, new Windows installer or public release is enabled.
The existing games and save banks remain unchanged.

## Reproduce locally

```sh
python3 -m vnkit inspect '/path/to/428.iso' --fingerprint
python3 -m vnkit import '/path/to/428.iso' --adapter 428-psp --out private/428/new-recovery
python3 -m vnkit extract '/path/to/428.iso' --level archives --out private/428/new-resources
python3 -m unittest discover -s tests -p test_428_psp.py -v
```

`import` writes the original/deobfuscated SNS, original flow data, individually
located binary scripts, structural JSON and a recovery report. It exits **3**,
explicitly blocked on runtime implementation, and creates no `content.json`.
`extract --level archives` additionally recovers archive members, with the dummy
archive exception below. Successful extraction exits 0; its report still says
`playable: false`. Output must stay private. Exact files can resume; different
bytes are never overwritten. Use a fresh destination for changed reports/builds.

This is Python standard-library recovery. The executable inspection tool used
privately during research is not required by these commands.

## Exact-edition identity

Detection requires hashes of PARAM.SFO, the encrypted EBOOT, the scenario
archive and the exceptional dummy archive; a title/filename or disc ID alone
never matches an untested edition.
PARAM.SFO records `DISC_ID=ULJS00219`, `DISC_VERSION=1.01`, PSP system 5.55.
UMD_DATA agrees with the serial. BOOT.BIN contains zero bytes rather than a
usable alternate executable.

| Input | SHA-256 |
| --- | --- |
| ISO, 1,659,011,072 bytes | `94731b7ddd7214e07645e5dcfc05fae1c4560ee2249432be6438169f504b5c2a` |
| PARAM.SFO | `a267123777e23637dab460e1ea1412d3364ae09bda2969aeb1bd1560e4d0bd3c` |
| EBOOT.BIN, encrypted | `cf0fd29ef30406da247d6c368424124584cb9e39f3b7b4801417e059543a160b` |
| EBOOT, privately decoded ELF | `194a2dcb010c86f40302fd7f83e6be1f0cd446294716b0fbd05d7f2acafc3dce` |
| scriptdatafilechunk.cpk | `d3782bdd6b23971348cc399e46387da9c654829a7e3b45254d6f76f0ad3f1ba1` |
| decoded SNS | `1a467441c56f57337c499541a781da9323551db542069c44d8f146f19e1d5968` |

The decoded program is a stripped little-endian MIPS ELF32, entry 0x08804000.
The initial recovery used static analysis. The subsequent bounded integer probe
interprets selected original routines in mapped memory; it does not boot the
PSP program, firmware or an installer. Its limits are described below.

## Measured format fingerprint

| Layer | Confirmed evidence | Reuse conclusion |
| --- | --- | --- |
| Disc | 2048-byte ISO9660, PSP_GAME metadata and USRDIR | Existing bounded ISO/Source access reused |
| Archive | 47 CPKs, UTF metadata, numeric member IDs, 10,111 entries | New bounded `vnkit/cri_cpk.py`; unrelated to CLANNAD HED/NAM/MRG or Remember11 DAT/LNK |
| Compression | CRILAYLA reverse bitstream with 256-byte plain prefix | Distinct from MZX, KID CPS and PS1 Memories Off LZSS |
| Scenario | SNS converter/engine version 01.82; repeating 16-byte additive obfuscation | Independent SNS parser, not HuneX command text, KID MAC/oscr/SC3 or Shin SNR |
| Script framing | 34 named binary `.xml` members; source-order offset/size pairs at SNS 0x104 | Names do not imply textual XML |
| Labels | Each member has 256 linked hash buckets at 0x30, content offset at 0x430 | 12,743 label targets checked against token boundaries |
| Commands/text | Length-prefixed tokens; text 0x01…0x02; ruby delimiters 0x1c/0x1d have no length byte; strict CP932 | 257,720 structural tokens, 132 used kinds, 44,809 text fragments, zero private-use characters |
| Direct labels | 0x52/0x56/0x59/0x5a carry script-byte + ASCII label | 12,697 operands resolve, including 10,939 label definitions; the later control audit also checks branches, options, links and threads |
| Cross-character flow | Separate `to.flo`, source label references and native progress/selection consumers | Not interchangeable with any existing adapter's progress/route model |
| Images | 6,015 `.gim` entries and one `.dds` | 5,928 decodable GIM members yield 6,123 pictures; 87 GIM members remain opaque; reader composition is not integrated |
| Audio/video | 973 `.at3`, 2,855 `.csb`, 237 `.pmf` entries | Potential external decoder reuse only; suffixes and extraction do not prove playback/fidelity |

Counts include system, debug, bonus and duplicate archive resources. Text
fragments include ruby readings/bases and are **not** logical pages, study
counts, story coverage or execution evidence. No original-console comparison,
browser reading, earned route campaign or reader save/restore evidence exists
for 428. Individual native routine comparisons below are separate checks.

The 468-byte SNS tail is preserved without interpreting it. The flow file and
all raw opcode operands remain available for further investigation. This parser
does not skip unknown instructions in order to expose a linear transcript.

## Archive details that must not be flattened

`c01.cpk` contains two duplicated basenames with distinct IDs. Preserve numeric
identity instead of overwriting by filename. Two archives contain original
`../` directory metadata. Recovery stores this metadata only in JSON and writes
members to generated `members/<archive>/<numeric-id>.bin` paths; it never follows
original directory strings on the host. Unsafe member basenames, duplicate IDs,
overlapping/out-of-bounds extents, bad UTF fields and malformed compressed
references are rejected.

`dummyforlayer.cpk` has a trailing TOC and ContentSize=0. Of its 191 entries,
129 compressed members start with eight zero bytes instead of CRILAYLA magic.
Those 129 are retained **as stored**, marked opaque in the report. The other
62 entries have intact uncompressed headers. No signatures are repaired and
the opaque entries are not counted as decoded media.
The archive hash is
`ad6860749da418e74ffed2e901d3dd01ed7433f3ab3635031c301b44640c7941`.
An initial strict decoder stop on that archive led to this explicit distinction,
not a general relaxation of compressed-member checks.

## Static native anchors for continuing the work

These addresses refer only to the decoded ELF hash above:

- 0x0887bc08 checks SNS engine version 01.82.
- 0x0887bc7c relocates the script directory, 256 label buckets and content pointers.
- 0x0887bb20 reads the SNS entry label at header 0xe0; startup is not filename order.
- 0x0887c510 consumes big-endian operand bytes; 0x0887c670 reads a terminated label.
- 0x08898398 dispatches through 8-byte entries at 0x089c090c.
- 0x088982d8 distinguishes text/ruby framing from ordinary length-prefixed tokens.
- 0x088962ec / 0x08898748 lead into conditional evaluation; 0x088965f8 handles
  a direct transfer, and 0x088967e0 processes source labels alongside progress.
- 0x08882978 compares native values, with adjacent flag/register helpers.

Private disassembly, decoded executable, opcode census and original flow data
are under `private/428/initial`; preserve them. Do not copy native tables into
public fixtures or infer flag semantics from their names alone.

The next runtime work must integrate the verified control operands with
cross-character replay, concurrent tasks, timeline/restart and KEEP OUT gates,
persistent earned progress, TIPS returns, exact media IDs and save restoration.
These govern story behaviour; they cannot be treated as optional visual effects.
Only then can a `portable` library import be admitted.

## Runtime foundations (2026-09-29)

The user requested continuing the runtime work. These components now exist,
but none registers 428 with the shared reader:

- `web/adapters/shibuya428-control.mjs` parses native comparisons, compound
  conditions, ordered choices, TIPS/JUMP operands and thread targets. The bank
  contains 2,048 unsigned bytes. Compound negative prefixes count predicates,
  not join tokens; AND/OR accumulate left to right. Branches transfer when the
  predicate is false. Choice 0x54's trailing label is a replay fallback, not a
  descriptive hint. Choice text uses the native restricted dispatcher; it
  must not execute every option's writes or collect unselected story text.
- `shibuya428-vm.mjs` is an unregistered control VM draft with atomic error
  rollback, an eight-frame source call stack, ruby-aware text boundaries and
  explicit stops for unsupported instructions. Its entered-label trace is
  **not earned read progress**. Writes to flags 31–90, 287 or 290 stop unless an
  explicit verified progress kernel and source context resolve the event (see
  the continuation below). Native call entry preserves the caller label.
- `vnkit/adapters/shibuya428_flow.py` parses FLO v4's 34-byte names, 256 hash
  buckets and 460-byte records, with duplicate/extent/link/label checks. All
  1,199 nodes and 1,979 primary/related label references resolve. Related names
  can refer to other scripts; 45 source script fields differ from resolved
  identities. Those fields remain preserved, not silently rewritten. Fields
  without established semantics remain numeric data. Parsing never unlocks
  or exposes an unvisited node.
- `vnkit/psp_gim.py` independently decodes direct/indexed/swizzled PSP pixels
  and PSP-order DXT1/3/5 blocks. It retains every picture in a container, checks
  extents/palettes/decoded-size limits and crops block padding to logical image
  height. `shibuya428_media.py` verifies recovered source digests and writes
  PNGs and a private manifest without clobbering different outputs.

The complete artwork pass converted **5,928 members / 6,123 pictures with zero
decoder errors**, under `private/428/artwork-v2`. This excludes 87 opaque GIM
members from the exceptional dummy archive; its other 42 opaque members are
CSB. It does not establish native composition, audio or movie playback. The
earlier artwork-v1 output remains preserved, with five logical-height errors.
Private visual inspection checked a scene photo, a DXT5 image and palette text;
it is not an exhaustive pixel comparison with a PSP.

The expanded static control audit checks 789 branches, 167 choice instructions,
610 link instructions, 358 thread instructions and 14,945 target references.
It composes 398 of 400 option labels; two previews contain native 0xc0 tutorials
and remain explicit stops. This is not an unsupported-story-site census or an
execution-completeness claim.

Reproduce these stages locally, keeping output private:

```sh
python3 -m vnkit.adapters.shibuya428_flow private/428/recovery-v2/original/to.flo \
  --scripts private/428/recovery-v2/scripts --out private/428/new-flow
python3 -m vnkit.adapters.shibuya428_media private/428/resources-v1 --out private/428/new-artwork
node scripts/audit-428-control.mjs private/428/recovery-v2
node tests/428-control.test.mjs
node tests/428-vm.test.mjs
node tests/428-native.test.mjs
python3 -m unittest discover -s tests -p 'test_428*.py' -v
python3 -m unittest discover -s tests -p test_psp_gim.py -v
```

The control audit intentionally exits 3 because runtime support is incomplete.
The initial tests contained original synthetic data: 18 JavaScript cases and nine
Python cases in addition to the original 12 recovery tests. The VM tests cover
rollback, stack capacity, conditional direction, choice isolation and avoiding
duplicate text/ruby reading in logical segments.

### Bounded native reference, not a PSP emulator

`shibuya428-native.mjs` evaluates selected integer Allegrex instructions against
explicitly mapped memory and code ranges. It rejects unknown instructions,
unmapped/readonly writes, unaligned accesses, system calls and exhausted budgets.
Failed calls restore writable memory. The native code itself, source tables,
test histories and harnesses remain under `private/428`; no game words are
embedded in the public probe or tests. It has no OS or firmware interface.

The native loader independently assigns 10,939 non-underscore label IDs in
script/hash-chain order. Six controlled flag states at every source branch
produce **4,734 native-versus-JavaScript comparisons with zero mismatches**.
Native FLO hash lookup agrees with all 1,199 parsed node IDs. Full recalculation
at 0x0887483c runs in 158 controlled initial states, preserving the calling
script/label/PC/character/hour and stabilizing flags on a second invocation.
Those states use an **unvisited graph and hypothetical flag banks**, not earned
paths, later-choice invalidation coverage or reader-save restoration.

Relevant native consumers: 0x088983f0 restricts choice previews; 0x08886d78
selects replay-triggering flag writes; 0x08886cec protects persistent flag
ranges during replay; 0x088857a4 follows source controls and saved selections;
0x08882cd8 resets hour-specific flags; 0x088cbd7c advances FLO records by 460
bytes. The native call-stack helper is 0x0887a210. The private disassembler was
corrected for Allegrex sign extension/bitfield instructions; do not interpret
SPECIAL3 as the shared PS2 disassembler's `sq` instruction.

Reports are `private/428/initial/control-audit-v2.json`,
`control-native-compare-v1.json`, `flow-native-compare-v1.json` and
`native-progress-suite-v1.json`; parsed flow is `private/428/flow-v1/flow.json`.
The next substantial step is a validated bridge between this native progress
state and story execution, followed by character switching/KEEP OUT, tutorials,
TIPS return, thread scheduling, media composition and persistent save tests.
Do not replace those operations with no-ops to make a linear demo advance.

## Upstream investigation and provenance

The primary author's [SNS investigation](https://zenhax.com/viewtopic.php%40t%3D13137.html)
provided a lead for 01.82 obfuscation and label sections in another platform's
release. The PSP data and native consumers above were checked separately.
No posted game files or translation archives were downloaded. No forum parser
code was copied; PC/PS3 compatibility is not established.

[vgmstream's UTF implementation](https://github.com/vgmstream/vgmstream/blob/master/src/util/cri_utf.c)
was consulted for UTF field/storage layout; the existing ISC notice remains in
`third_party/LICENSE-vgmstream.txt`. The independent Python implementation adds
bounded schema/row reads and archive-specific safe output identities.

[pspdecrypt](https://github.com/John-K/pspdecrypt), GPL-3.0, revision
`c156627db7634d395c380c0a9589130f603307fc`, was built as a private external PRX
decoder. A small private harness calls its PRX function without launching input
code. The original GPL source/licence and harness remain private; none is linked
into the MIT importer or bundled. Its upstream build emitted warnings in unused
ECDSA signing routines; signing was not called. The public recovery commands do
not depend on this executable.

CriPakTools and PyCriCodecs/CriCodecs were checked as leads; no clear reuse
licence was established in the inspected trees, so their implementations were
not adopted. Existing CLANNAD/Remember11 parser fingerprints were compared
directly and do not match the observed SNS structures.

For GIM, the independent decoder used the file-layout documentation in
[gimconv_v](https://github.com/jeffangelion/gimconv_v) (GPL-3.0-or-later),
[PPSSPP's PSP image-format documentation](https://dev.ppsspp.org/docs/psp-hardware/gpu/image-formats/)
and the packed PSP DXT structure layout in
[PPSSPP TextureDecoder.h](https://github.com/hrydgard/ppsspp/blob/master/GPU/Common/TextureDecoder.h)
(GPL-2.0-or-later). Their licences were inspected; no implementation code was
copied or linked. The Python decoder and original synthetic pixel tests are new
code. No Sony SDK/header or upstream game content is used.

## Verification

Twelve original synthetic tests cover UTF bounds, CPK variants, duplicate names,
unsafe paths/IDs/extents, CRILAYLA literals/overlapping references, malformed
compression, SNS text/ruby framing, source labels, bad encoding, corrupt
directories, explicit missing targets, edition/GUI exclusion and no-clobber
output. Registry, existing disc and import-job tests also pass (30 Python tests
in these focused suites); the original synthetic reader fixture validates.
These are parser/import tests, not evidence that 428 plays in the reader.

The final local run recovered all 10,111 entries: 9,982 decoded or uncompressed
files and 129 opaque stored members. The script-only import and full extraction
contain identical original SNS/FLO and decoded SNS bytes. An automatic-detection
rerun resumes the same script-only output and still returns blocked/exit 3.
The original ISO hash remains unchanged. Private reports are
`private/428/recovery-v2/recovery.json` and
`private/428/resources-v1/recovery.json`. Earlier partial probes are retained.
The final digest/container-signature audit covers all 10,111 recovered files
with zero errors (`private/428/initial/resource-audit-v1.json`). This verifies
stored outputs and format signatures, not audiovisual decoding or execution.

## Progress records and recalculation bridge (2026-09-29 continuation)

`shibuya428-progress.mjs` implements the 12-byte native label records separately
from reading activity. IDs follow script/hash-bucket/chain order, replacing the
on-disc placeholder. Linked transfers, no-link transfers, completion, selected
options and furthest relative read position match the audited original helpers.
A no-link jump still completes its previous label. Internal labels leave the
current label unchanged. Sparse snapshots bind source identity and validate
edges, byte/word bounds, choices and source positions before any mutation.

The draft VM now updates these records on transfers and choices, and rolls them
back with the source state on failure. Reader acknowledgement of displayed text
and persistence of the complete native state remain future integration work;
a progress-record snapshot by itself is not a complete game save.

`shibuya428-progress-kernel.mjs` is an explicit, experimental recalculation bridge.
It verifies the exact decrypted ELF, decoded SNS and FLO SHA-256 identities,
relocates the native label table, checks every recovered label against native
lookup, then makes scripts read-only and forbids further allocation. Bounded
native replay computes flags, graph changes and per-character restart labels.
It preserves the caller's source checkpoint and has atomic opaque in-memory
transactions. Invalid input, unknown native code and exhausted budgets fail.
There are no PSP OS/firmware interfaces or bundled original executable bytes.
The external private decryption step is still not an ordinary import dependency.

`Shibuya428VM.resolveRecompute(kernel, context)` permits explicit research use and
rolls back both VM and native memory if subsequent execution stops. Ordinary
`advance()` still refuses a pending recomputation. The context must eventually
come from source chapter/checkpoint execution; the reader does not yet derive it.
Recomputation inside a non-empty source call stack is deliberately rejected.
Opaque memory transactions are not serializable browser/shared saves.

Measured private evidence:

- `native-progress-records.mjs`: all **10,939** assigned label IDs agree;
  **3,001** record comparisons and **60** sparse snapshot round-trips pass.
- `native-kernel-compare.mjs`: **158** hypothetical empty-progress cases and
  **24** hypothetical visited-prefix/choice cases agree with direct calls to
  the original wrapper for flags, records and restart strings. Flags stabilize
  on a repeated calculation. Six controlled A → B → A choice reversals restore
  the earlier flag bank; three affect source flags and three leave it unchanged.
  A deliberately invalid cyclic history hits the existing instruction cap;
  a valid calculation afterward matches a clean baseline, proving rollback
  after a native failure as well as after input rejection.
- These are **controlled hypotheses, not source-earned reader routes**. The
  prefix builder asks original progress replay for successive stops and seeds
  completion for testing; it does not display or count story text. The bridge
  comparison uses the same bounded native interpreter on both sides, not an
  independently reimplemented replay algorithm or an original PSP comparison.
- Earlier whole-script file-order seeds produced a cyclic native graph and hit
  the instruction budget. They remain failed diagnostics; no cap was raised and
  none of those seeds is installed. Keep user progress source-earned.
- The public suite now has **27 original synthetic JavaScript cases** across
  control, VM, native, progress records and kernel admission. All 20 relevant
  Node test files (including Memories Off and shared reader regressions) pass;
  the synthetic fixture validates. This is not new commercial route coverage.

Reports are `private/428/initial/native-progress-records-v1.json` and
`native-kernel-compare-v7.json`; earlier reports retain failed diagnostic seeds
and a corrected test assumption about which seed produces a cycle.
Reproduce using new private output files:

```sh
node private/428/native-progress-records.mjs private/428/new-records.json
node private/428/native-kernel-compare.mjs private/428/new-kernel.json
node --test tests/428-*.test.mjs
```

428 remains **unregistered and not playable**. Next: implement source checkpoint
0x22 and tutorial/KEEP OUT events, obtain source-derived switching context,
connect JUMP/TIPS returns and threads, then presentation and complete saves.
The two tutorial-bearing choice previews still stop. There is no content.json,
portable tile, GUI admission, updated installer or public release.
