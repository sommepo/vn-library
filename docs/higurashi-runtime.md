# Higurashi Matsuri: Kakera Asobi — PS2 reader

The Japanese standalone disc **SLPM-66913 v1.01** now has a source-driven reader.
All ten main chapter endings and five bad-ending variants have completed in
script replays. This is basic story support, not a claim of matching every PS2
animation, optional branch or timing detail. The Append disc is not supported.

The installed private copy is `private/library/higurashi-live`. Open:

<https://your-server.your-tailnet.ts.net:8891/?game=higurashi-slpm66913-1.01>

The ISO is needed for importing, not reading. The other five installed games and
their saves were preserved. Higurashi is included in the source and Windows installer from v0.1.0-beta.3.
A full Windows device conversion remains untested.

## Import from your own disc

Use Python 3.11+, Node 22+, FFmpeg/ffprobe and the existing pinned vgmstream r2117.
[CLANNAD's tool setup](clannad-import.md) supplies these dependencies. This game
does not need VGMTrans or FluidSynth. Keep tools available on PATH; set
`VNKIT_VGMSTREAM` to the vgmstream executable if needed.

```sh
python3 -m vnkit inspect 'Higurashi no Naku Koro ni - Matsuri - Kakera Asobi (Japan).iso'
python3 -m vnkit import 'Higurashi no Naku Koro ni - Matsuri - Kakera Asobi (Japan).iso' \
  --adapter higurashi-matsuri-ps2 --work private/higurashi \
  --out private/library/higurashi-live
python3 -m vnkit validate private/library/higurashi-live
```

On the maintainer's Linux host, prefix the import command with
`bash scripts/audio-tools-env.sh` to use the already installed private tools.
The work directory retains checked recovery and media caches. Repeating the
command resumes matching output; changed output is rejected. Use a new output
directory after changing conversion settings. Allow at least 24 GiB free space.

Import and validation return **3** for the documented presentation limitations.
The static report must still show zero unsupported instructions and zero
unexplained unresolved resources. Add game admits only this exact executable
and applies the same gate. A resource recovery directory alone is not a reader.
The normal CLI was run from the actual ISO through checked existing conversion
caches to a fresh output, then validated and installed atomically. This is
separate from a Windows clean-cache or browser-upload conversion test.

## What runs

- Original instruction order, signed registers, shared call/argument stack,
  conditions, indexed jumps, choices and persistent system flags.
- Original Japanese decoded from CP932 plus the disc's compact character table;
  source speaker names, 605 ruby groups, page parts and reliable voice links.
- Backgrounds, expression-composited portraits, native placement/depth/opacity
  and colour tint, BGM/SE/voices, music loops and converted original movies.
- The native masked character selectors, unlock notices and special final
  choice. The latter has no branch result in the source; its moving animation
  is omitted, while both source labels are retained.
- TIPS access at source boundaries and an encountered-only TIPS menu. Returning
  from a TIPS restores the suspended story. Six after-parties become available
  using the original system-word 21 gates and entry selectors 235–240.
- Shared reader controls: selectable DOM text, backlog, copies/text output,
  activity, pause, auto, skip read, next choice, previous line, 15 saves,
  export/import, local/shared save storage, fullscreen and sound test.
- Endings return to the library. Earned global progress survives slot loads and
  new runs. Manual route completion sets only documented ending cells, with
  separate provenance; it does not pretend to have earned common-story unlocks.

The ten private fixed read paths were rebuilt by replaying the sequential
campaign from empty system progress. Completed routes can supply read colour
and Skip read without study counts. These paths are optional, signature-bound
and never bundled with the code. Rebuild with:

```sh
node scripts/build-higurashi-read-paths.mjs private/library/higurashi-live \
  private/higurashi/campaign-v2/campaign.json private/higurashi/new-read-paths.json
```

Copy that checked output to the import's `read-paths.json` when absent. A missing
sidecar leaves normal encountered-text tracking intact.

## Measured coverage

| Check | Result |
| --- | --- |
| Original resource recovery | 72,323 members, fingerprints and bounds checked |
| Static SNR validation | 309,298 instructions; zero unsupported sites |
| Logical source text | 125,391 segments; 65,419 voice-bearing segment references |
| Installed assets | 73,144 entries; all referenced files present |
| Core campaign | 1,500 sequential runs, 15 endings, 129 choice edges, no stops |
| Core sites reached | 278,080 instructions; 114,783 distinct text segments |
| Full reader route suite | 15 endings, 181,045 text presentations, 366 choice save/restore checks |
| Separate reader smoke | 5,500 segments and 220 restoration comparisons |
| TIPS | All 154 entry records execute to end; 8,178 text presentations |
| After-parties | All six entry paths finish; 1,639 text presentations |
| Audio | All 71,395 recovered audio resources decoded; 162 grouped voice cues mixed |
| Movies | All 29 converted with matching decoded video/audio hashes |
| Browser | 150 consecutive segments in both Chromium and Firefox; source choice restoration and movie playback checked in Chromium |

Headless tests simulate timing and media completion. They do not establish
original-console fidelity or exhaustive coverage of every choice combination.
Browser checks cover Japanese DOM/speakers/ruby, music/voice, selection protection,
backlog, external WebSocket occurrences, reload without recounting, 15 slots,
previous line, global pause, next-choice navigation and landscape fullscreen.
Chromium clipboard content was checked; Firefox copy was requested, but clipboard
content still needs a device check. Phone hardware, Yomitan and native Windows
execution were not retested for this game. Shared saves use the existing tested
storage layer; no live user save bank was used in these tests.

Private evidence is under `private/higurashi`: `campaign-v2`, `reader-routes-v2`,
`engine-smoke-v4`, `tips-v1.json`, `extras-v2.json`, `browser-v2`,
`browser-firefox-v3`, `browser-boundaries-v1`, and `cli-validation-v1.json`.
The earlier browser and engine failures are retained as historical diagnostics.

```sh
python3 -m unittest tests.test_higurashi tests.test_adapter_registry tests.test_import_jobs -v
node --test tests/higurashi-vm.test.mjs tests/reader*.mjs
node scripts/validate-higurashi.mjs private/library/higurashi-live
node tests/higurashi-real-smoke.mjs private/library/higurashi-live private/higurashi/new-smoke 5500
node tests/higurashi-campaign.mjs private/library/higurashi-live/program.json private/higurashi/new-campaign 1500
node tests/higurashi-route-suite.mjs private/library/higurashi-live private/higurashi/campaign-v2 private/higurashi/new-route-suite
node tests/higurashi-tips-smoke.mjs private/library/higurashi-live private/higurashi/new-tips.json
node tests/higurashi-extras-smoke.mjs private/library/higurashi-live private/higurashi/campaign-v2/report.json private/higurashi/new-extras.json
node tests/higurashi-progress-smoke.mjs private/library/higurashi-live private/higurashi/reader-routes-v2/choice.json
bash scripts/browser-env.sh node tests/browser-higurashi.mjs private/library private/higurashi/new-browser
```

Firefox requires the private test environment documented in [testing.md](testing.md)
on this minimal host. Tests use fresh browser profiles and temporary servers.

## Remaining limits

Animations, mouth movement, transitions, camera motion curves, exact rotation,
inline speed/timing effects, audio fades and the native scenario-chart/gallery
interface are incomplete. Scene changes settle at their final state. TIPS and
after-party entries use reader menus rather than a recreated native chart.
Portrait masks/resting expressions follow the compatible PS2 unpacker; no
frame-by-frame comparison to original hardware has been made. Grouped voices
are mixed at original gain with PCM16 saturation; exact SPU2 mixer comparison
is unverified. Some native SE volume/envelope behaviour is approximated by
reader volume controls. Those are presentation limits, not ignored branches.

Three **source voice references have no matching file in this disc's directory**:

| Source offset | Missing path | Handling |
| --- | --- | --- |
| `0x12d963` | `v22/443100012` | Other voices in the group play; malformed-looking path is not guessed |
| `0x147b12` | `00/440500030` | Text remains, voice absent |
| `0x263680` | `05/130400016` | Other voices in the group play |

The unused picture-table entry `macro.log.pic` is absent too. No script directly
loads it; an attempted dynamic load still fails with its source location. No
missing resources were downloaded. Unknown state/control instructions fail
closed. Never label the intentional validation exit 3 as full native fidelity.

## Adapter and fingerprint

[The original investigation](higurashi-investigation.md) records disc/container,
text, native handler and upstream evidence. `higurashi_program.py` and
`higurashi_text.py` compile source-located instructions, not a linear text dump.
`higurashi-core.mjs` implements this exact SNR VM; `higurashi-engine.mjs` adapts it
to the reader. `higurashi-progress.mjs` contains edition-specific ending cells.
`shin_ps2_texture.py` decodes native GS texture pages for selectors/TIPS/notices.
The family match is confirmed for these structures, not all future Shin titles.
Compare a new disc against these parsers before claiming compatibility.
