> Newer [menu, progress, date and sound-test support](clannad-menu.md) supplements this report.

# CLANNAD PS2: current execution and compatibility

Japanese **SLPM-66302 v1.01 / HuneX** is the active target. Pia work is paused.
The whole discovered script set now has basic command implementations. Detailed
presentation and full-route fidelity remain incomplete; no completion percentage
is claimed. See [basic execution and native evidence](clannad-basic-execution.md).

## Current evidence (2026-09-17)

| Layer | Working result | Remaining limit |
| --- | --- | --- |
| Disc/archive access | Read-only extraction, 4,729 ALLPAC members | UDF bridge not separately parsed |
| Scripts | 203 programs, 308,727 instructions, 3,320 verified native label offsets | Static coverage is not all-route execution |
| Command census | **0 unsupported command sites**, 97,783 direct references, none unresolved | Degraded visual effects/native internals remain |
| Japanese | Strict CP932, source names/newlines/multiple speakers, recovered native text; fixed lost timed passages | No source ruby control syntax found; custom-name UI unavailable |
| Graphics | 3,859 native-size PNGs; FADZ multi-actor placement, alpha and layering | 81 atlas/format entries; credit/MZD and native montages incomplete |
| Audio/video | 42,958 voices, 53 BGM, 54 VSE, 23 short SE effects; actual MVPL movie and immediate voice waits | Fade envelopes, some native-sequence audio/timing and exact looping degraded |
| First-option control | **5,320 segments, 28 choices, source ending**, no interpreter failure | Headless timing/media simulation |
| Broad control | **69,738 logical segments, 481 choice edges, 15 source endings, 164 scripts** in 1,000 bounded runs | Bad/alternate endings included; not 15 verified character routes; 39 scripts not dynamically reached |
| Current browser | **100 consecutive pages after the old native-41 boundary**, both later-choice branches, slot 15, movie save/resume, VCWT audio completion, progress persistence, mobile layout | Reached-checkpoint coverage, not 100 additional entry pages |
| Earlier browser | 2,450 consecutive ordinary opening pages and 19 choices in the prior build | Historical evidence; not rerun wholesale after basic-mode changes |
| Progress | G persists outside slots; new playthrough resets F/Z; gated native AFTER STORY entry; progress backup | Earned After Story unlock and complete After Story route remain dynamically unverified |

The 1,000-run campaign had two stops on one optional saved-display-hint comparison,
not an unsupported opcode. The normalization mismatch is fixed; the exact reached
checkpoint passed 200 further save/restore boundaries. No unpresented-buffer
clear/end losses were found after the timed-text correction. See the private
reports and [testing notes](testing.md); never add headless/checkpoint/entry counts.

The native active-script list contains 195 names. Eight SEEN8000–8007 programs
are also on disc and statically inspected; they are not in that active-name list.
No missing audio track has been identified. Unconverted assets are not missing
source files. Source/native strings stay private; Japanese is never translated,
paraphrased or generated to fill gaps.

## Execution and saves

The adapter interprets the original program counter, labels, four-frame call
stack, F/G/Z conditions and assignments, SEL/SEB choices and native state effects.
JUMP's optional label, empty FRET and full-depth FCAL now match native control.
Unknown future instructions/parameters still stop with their source location and
rollback. State is not reconstructed by sorted filenames or text concatenation.

Format-v1 saves retain the same game/runtime signature **498c15ab**. Existing
slots 1–6 remain valid, with slots 7–15 added. Old halted saves resume their saved
PC after validation. An absent F[500] is repaired to the verified native initial
value 1; no shipped assignment sets it to zero. Timed/native text has stable
source IDs and independent occurrence IDs; restoration does not republish or
recount it. Learning history remains independent of game slots.

G is persistent playthrough progress. Ordinary old-save loads retain the browser's
current G; a fresh browser can bootstrap from a portable save. Use **Saves → Export
global progress** for a separate backup. Start again resets local variables while
keeping earned progress. AFTER STORY is hidden until the original title rules
unlock it. Its data-transfer prompt retains the original image and DOM yes/no
choices. Those native rules have unit coverage; real earned unlocking is untested.

## Presentation limits

Basic native routines preserve traced state/branch effects and simplify their
visual sequences. Credits/MZD montages, many character motions, palettes/shakes,
calendar transitions/logo/staff overlays, gallery/title extras and exact timing remain
incomplete. Some native sequence-specific music is omitted. Fades usually commit
the final state immediately. The compatibility report deliberately remains
`incomplete-runtime`, and **full validation still exits 3** despite zero
unsupported script command sites. The detailed per-family list is in
[basic execution](clannad-basic-execution.md).

Original PS2 side-by-side comparison, every route/end, Firefox, physical Z13/
Android and Yomitan remain unverified. Do not describe these as passed or call
this a faithful complete port.

## Run and extend

Use the existing [private reader URL](https://your-server.your-tailnet.ts.net:8891/?game=clannad-slpm66302-1.01),
refreshing to load the updated interpreter. Do not start a duplicate listener.

```sh
python3 scripts/reader-service.py status
node scripts/validate-clannad.mjs private/library/clannad-live private/clannad/new-census.json
node tests/clannad-real-smoke.mjs private/library/clannad-live 20000 private/clannad/new-first-path.json
node tests/clannad-campaign.mjs private/library/clannad-live private/clannad/new-campaign 1000
```

See [import/setup](clannad-import.md), [handoff](next-session.md),
[formats](formats-clannad-ps2.md), [adapter interface](adapters.md) and
[historical opening evidence](clannad-opening-history.md). The runtime now needs
route-directed validation and presentation improvements, not another artificial
opening-only cutoff.
