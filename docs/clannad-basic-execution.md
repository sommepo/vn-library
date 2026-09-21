# CLANNAD: broad basic execution, 2026-09-17

The user's priority is basic execution across the game before animation fidelity.
The new pass implements every **discovered script command site** in this exact
PS2 edition. This is a basic presentation mode, not a verified faithful port.
Unknown instructions/parameters still fail closed. No missing disc files caused
the old 19-choice limit: the missing work was interpreter behavior.

## Scope and evidence

All 203 scripts / 308,727 instructions are statically inspected. There are zero
unimplemented command sites and zero unresolved references among 97,783 direct
checks. The earlier count was 1,399 unsupported sites. Native internals are not
exhaustively covered by that reference count. 81 atlas/format entries, detailed
native animation and original-engine comparison remain outside full support.

The private 1,000-run campaign executes 208,400 distinct instruction locations,
69,738 distinct logical text segments, 481 choice edges and 15 source ending
boundaries across 164 scripts. These include bad/alternate endings, not fifteen
verified character routes. Timing, media completion and non-choice animation
input are simulated. Branches begin at entry or actual reached choice saves;
F/Z flags and script positions are never invented. Earned G progress carries
between runs. No After Story unlock was earned in this campaign; its entry and
native data-transfer prompt remain unit-tested rather than real-route verified.

Two campaign runs stopped on the same save-test mismatch: restoration normalized
an optional `hideText:false` hint. This has been corrected and the reached
checkpoint passed 200 subsequent boundaries with exact state restoration.
No unsupported opcode/resource boundary was hit. The campaign found **zero
unpresented-buffer discards at clear/end boundaries** after fixing timed text.
Do not describe this as a complete route exploration or add it to browser pages.
Private evidence: `private/clannad/basics-audit/campaign2/report.json`,
`restore-regression-resolved.json`, and `static-v12.json`.

## Control and Japanese text

- JUMP's optional second argument is a target Z label, not an ignored hint.
  FCAL has a four-frame limit; overflowing calls and empty FRET do nothing in
  the native dispatcher (0x14c14c / 0x14c0ac). In-range calls still must resolve.
- Native new-game initialization clears F/Z and sets F[500]=1 (0x147ac0..147b48).
  Earlier saves with that cell absent are repaired on load. No shipped command
  assigns this cell to zero. Existing source/save identity remains unchanged.
- SEB options use the recovered table at 0x3778b8, indexed by F[100,101,103,104].
  Result values remain the option index. These are interactive source choices;
  they are not replaced by automatic selections or a linear transcript.
- Quoted NCK inputs retain their quote bytes. Parameter parser 0x147590 extracts
  decimal digits even from F[index], so these are destination indices, not
  dereferenced values. NCK3's name filter is recovered from 0x377978. Custom name
  entry and custom CP932 truncation/comparison remain unavailable.
- The two malformed full-width symbolic conditions are **not** repaired with
  invented variable aliases. `clannad_expression.py` probes only the audited
  0x148240..148708 evaluator, for the exact ELF hash, in private bounded memory.
  It confirms constant results and no variable reads. Import records the raw
  argument, result, instruction count, bytes consumed and evaluator address.
  The browser reads those recorded results; it does not run the ELF.
- Exact known legacy leftovers follow the original scanner (0x14a96c): no
  underscore means no dispatched command; the shipped `_Xvib` and embedded
  `_CLS` forms have no matching handler. The allowlist is narrow. Controller
  vibration is omitted; arbitrary legacy text still fails.
- WTTM/WTTK and ECTW present newly buffered Japanese during their waits, with
  independent source/occurrence IDs. CLR_/CLNV flush pending text to a boundary
  before clearing the buffer; CLOS hides the window. Previously, several timed
  passages and combo exclamations were discarded. Restores never republish them.
- ECTS/ECTW use clock 4 and the native signed16 argument conversion to 60 Hz
  ticks. Large source constants wrap exactly as the argument parser does.
  Browser elapsed animation/user-reading time is approximated; cue fidelity is
  explicitly degraded. The source constants are not silently rewritten.

## Native routines

`web/adapters/clannad-basic-events.mjs` contains the edition allowlist and state
changes. Unknown native IDs or unexamined variants are rejected. Existing precise
implementations of events 9/10/23/24/30/75 remain in their separate modules.

| Family | Retained behavior | Basic presentation gap |
| --- | --- | --- |
| Events 25–44, 66–68, 73 | Source progression and proven actor-clear/signal state | Motion/oscillation/flash/timing simplified or omitted |
| 45/49/52/53/60 | F[1114..1116] combo counters, level caps, channels, DOGUSI sound, explicit EVTN/EVTS signals | Animated combo layout omitted |
| 14/62 | Recovered original result/combo notices and source sound names | Static selectable notice, no original animation or temporary music ducking |
| 63–65 | Script continuation; main composition retained | Native-owned actor montage omitted |
| 17/18 | Original effect sound/final scene targets | Dramatic movement omitted |
| 0/19/20/21 | Final scene, music-stop state where present, G[46/41/44/42] completion writes | Credit/MZD imagery, sequence-specific music and timing are not faithfully reproduced |
| 70/71/72 | Original executable-buffered text, source IDs, scene/music clears | Native visual montage omitted |
| 74 | Final white scene, original BGM 49, source continuation | Its 241-row presentation timeline is reduced to final composition; cinematic timing/CG-gallery unlocks omitted |
| 77 | Original prompt image, DOM はい/いいえ, F[1090]=1/0 result | Prompt text is raster UI; modal animation omitted |
| 78 | Source continuation after source-script transfer | Confirmation animation omitted |

Relevant native evidence: table 0x1f9060 (84-byte records); ending callbacks
0x13aa84, 0x13df58, 0x13ee08, 0x13eb10; combo 0x14121c family; signal helper
0x139730; data-transfer update 0x144340..144528, assignment at 0x1444cc;
74's timeline 0x1fca10 and presentation dispatcher 0x1387f8. That timeline changes
presentation objects/backgrounds, not script control or F/G/Z. Final-background
and sound/text tables are recovered into private content metadata. No game's
strings or assets are bundled with the public runtime or tests.

## Graphics, media and progress

FADZ now composes one/two original actors with native X placement, body/face
ordering and alpha. Source transitions are immediate. VIOL/VIO1 retain F[1130]
state while omitting screen shake. MCOL retains colour state but uses accessible
reader text colour. BXDK/BXNG/BXFL palette/flash effects remain omitted.
MPL1 plays once; MVOL retains its target gain with an immediate envelope.
SESP(015) is a proven original no-op: sound stop 0x10c4b0 rejects channels >=5.
It does not mean substitute effect channel 1.

VPL2 plays the source voice immediately, without inventing a dialogue association.
VCWT waits for real browser completion, with a sample-derived headless duration.
Panels/selection/hidden state pause it; saves retain media position. MVPL(0,0/1)
uses the disc's sole OPENING.PSS derivative (filename table 0x1c4fb8), then resumes
its source PC. Skipping to the next choice stops at the movie.

Global G progress has its own versioned browser record, separate from manual
saves and learning history. Starting again resets F/Z while keeping earned G.
Loading an older game save retains the browser's current global progress;
portable game saves still contain a G snapshot to bootstrap a fresh browser.
Global progress can be explicitly exported/imported in Saves. No account/server
upload is involved. Ordinary save restores must not erase later route progress.

The native title stage uses G[73], completion flags 1/2/3/4/5/6/9/12/13/15,
additional flags 30/31, and final flag 45. Evidence: 0x144860..144a58 and
0x14568c..1456c8. AFTER STORY appears only at native title stage >=2 (menu table
0x1ff208); its original new-game entry is SEEN6800 (0x129c24..129c4c).
No spoiler-filled route browser or arbitrary chapter selector was added.
CG-gallery unlock bits, title animation and custom-name UI are not implemented.
An unrestricted original-track sound test, completion menu, manual progress and date badges
are now available; see [menu additions](clannad-menu.md). Real earned unlocking and every ending still need targeted testing.

## Reproduce

```sh
node scripts/validate-clannad.mjs private/library/clannad-live private/clannad/new-static.json
node tests/clannad-campaign.mjs private/library/clannad-live private/clannad/new-campaign 1000
node --test tests/reader*.mjs tests/clannad-vm.test.mjs
python3 -m unittest discover -s tests -p 'test_*.py' -v
VNKIT_CHECKPOINTS=private/clannad/new-campaign VNKIT_REPORT_DIR=private/browser-tests/new-basic sh scripts/browser-env.sh node tests/browser-clannad-basics.mjs
```

Reports are private/no-clobber. The browser test expects actual reached event-41,
VCWT and MVPL checkpoints; absence is an unperformed prerequisite, not a pass.
Development probe metadata was field-order-different but deeply equal to the
final import. `tests/clannad-rebase-probes.mjs` verifies full runtime/native/asset
equality and validates every checkpoint before making a separate private copy
with the final signature. It never relaxes reader save validation.
