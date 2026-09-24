# Never7 routes and endings

This applies only to Japanese PS2 **SLPS-25256 v1.01**. The local reader now
reaches all ten main good-ending outcomes, including the locked Cure routes,
and all 33 additional Append stories. This is tested story execution, not a
claim of exact PS2 animation, sound synthesis or every possible choice sequence.

## How to play

Open Never7 in the library. Finish a route, then choose **Start again** from the
ending menu. Persistent progress stays separate from save positions and reading
activity. Loading an earlier position does not undo earned unlocks.

Yuka's completion adds the original **優夏キュア** entry. Completing Yuka, Haruka,
Saki and Kurumi unlocks the main Cure branch on a new playthrough. Izumi's finale
opens **Append stories**, a collapsed list of the 33 original menu entries.
Their titles and entry addresses come from the disc. Locked entries stay hidden.

**Route progress / debug** shows the ten main outcomes and permits manual
completion for progress earned elsewhere. Manual marks are labelled and backed
up. They never count as study activity. The installed import now has
[verified read paths](never7-read-status.md) for all ten outcomes: normal and
manual completions enable red text and Skip read along one fixed path. Alternate
branches stay unread until actually encountered.

## Source evidence

- `oscrHensuuSet` uses the persistent-variable list at ELF `0x23bdc0`.
  Assignments restore those flags first and latch nonzero values. Ordinary story
  variables and the saved return frame remain part of the execution state.
- The four main source endings set flags **21, 22, 23, 24**. Their common tail
  sets **57** when all four are present. This unlock was tested by completing
  the four routes in sequence, with no debug writes.
- Izumi normal sets **77**; Cure A sets **49/69**; Cure B sets **50**; the finale
  sets **69/70**. Both Yuka Cure outcomes set **69**, plus **90** or **91**.
  Bad-ending tests confirm that the corresponding completion is not invented.
- `append_dat_t` at `0x24b390` contains 34 rows of 44 bytes. `appendStrExe`
  checks **21** for row zero and **70** for rows 1–33. After `oscrInit`, selection
  passes row offsets `0x24/0x28` to `oscrSetScript`. The importer recovers titles,
  authors and these script references into private `predicate.json` metadata.
- `oscrEos` calls `mendInit` for credits, optionally offers a system-save prompt,
  then returns to the title menu. Completion assignments occur in the story
  before this boundary. `oscrOmakeBitRoot` is an empty function in this ELF.
- The formerly unparsed 39 tables are selected by **mendInit**, a separate
  credits interpreter. Its command widths differ from the story interpreter:
  for example `0x42` takes two words here, three in oscr. All 3,442 credits
  instructions now parse under that format. Their animation, text roll and
  accompanying presentation are omitted; they are never executed as story code.

The bounded predicate evaluator continues to read the original comparisons.
Route conditions have not been replaced with walkthrough-based guesses.

## Reproducible tests

Private choice recipes contain source IDs and actual displayed option indices.
They are test inputs, not public game content or route logic in the reader.
`tests/never7-find-route.mjs` can discover a bounded path by choosing real options;
it never assigns route variables. Independent replay is required afterward.

```sh
node tests/never7-route-suite.mjs private/library/never7-live \
  private/never7/routes-plan-v1.json private/never7/new-route-suite
node tests/never7-append-smoke.mjs private/library/never7-live \
  private/never7/new-append-test private/never7/routes-suite-v1/izumi-finale/progress.json
node scripts/validate-never7.mjs private/library/never7-live private/never7/new-validation.json
```

The suite follows earned-progress dependencies. It checks save/restore at every
choice and every hundred text segments, then compares the next state. The Append
test explores visible choices with a per-entry bound and reports any unexplored
states. Timers and media completion are simulated in these headless tests.

Current evidence under `private/never7/`:

| Test | Result |
| --- | --- |
| `routes-suite-v1/report.json` | 18 complete replays; ten main good outcomes, five bad-ending cases, and three alternate first-route runs |
| Same suite | 136,632 text presentations, 1,053 choices, 2,410 save/restore comparisons; zero errors |
| `earned-izumi-cure-bad-v1/report.json` | Additional Cure bad ending; 11,038 texts, 72 choices, 182 restores; no Cure completion awarded |
| `append-campaign-v2/report.json` | All 34 native Append entries, including Yuka Cure; 168 explored states, no remaining states, 36 ending locations / 37 flag outcomes, no errors |
| Same Append test | 110,643 presentations including branch rereading, 27,338 distinct source text sites, 1,315 restores |
| Combined route and Append tests | 152 distinct story scripts reached; these counts are not an exact completion percentage |
| `routes-validation-v2.json` | All 227 tables parse: 188 story + 39 credits; 102,383 story instructions, 59,457 text sites, zero unresolved direct references |

All 805 predicate sites pass 7,245 bounded evaluation probes. There is one
unmapped native read-index slot (overlay A, slot 12, address `0x604bd0`), pointing
inside a source string rather than a scenario array. It is retained as a warning;
no discovered script transfer or menu entry targets it. The unused `shortcut`
and `user33` tables were not reached or exposed as invented menu entries.

Browser reports are separate:

- `private/browser-tests/never7-routes-v2/report.json`: source-earned Yuka clear,
  Yuka Cure entry, source finale, grouped Append entries, retained progress after
  loading an old save, reload and Start again. Earned-progress backups are imported
  through the UI for the late-game checkpoint; no manual unlocks are used.
- `private/browser-tests/never7-routes-reader-v1/report.json`: 178 texts, two
  choices, 15 voiced segments, one source-reached movie, original-bank music,
  selection, clipboard, pause, 15 save slots, reload, Next choice and mobile
  fullscreen. The movie is sought near its end to test resumption.

The first route-browser attempt failed its test assertion because CSS uppercased
the heading returned by `innerText`; the ending menu had opened successfully.
The corrected assertion uses `textContent`, and the full rerun passed.

## Limits

There has been no side-by-side original PS2 comparison. The tests establish that
the supported entry points and routes can execute to their source endings and
keep the expected flags; they do not prove every optional scene or choice history.
Animations, credits presentation, calendar/score artwork, inline timing and SPU2
sound parity remain incomplete. Static image-format gaps are retained in the
compatibility report, with no unresolved direct story-image references.

Native Windows conversion and a clean GUI import of Never7 remain untested. This
update is installed locally; it is not a new public release. Runtime signatures
are unchanged, so previous Never7 saves and progress remain compatible.

Installation used an atomic directory exchange. The previous import is retained
at `private/never7/reader-before-routes-20260922`; live service checks confirmed
adapter `0.5.0-experimental`, all 34 native menu entries and 39 credits mappings.
No live save bank, unrelated service or other game import was changed. Refresh
the browser once to load the updated reader modules.
