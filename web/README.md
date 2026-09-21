# Local reader modules

This is original MIT-licensed browser code using native ES modules, IndexedDB,
HTML media, and DOM text. There is no build step or third-party frontend runtime.

- `engine.mjs`: content validation and deterministic instruction execution.
- `app.mjs`: player, media, saves, bookmarks, settings, clipboard and publisher.
- `statistics.mjs`: reading-activity accounting independent from game saves.
- `storage.mjs`: browser IndexedDB storage, with explicit storage failures.
- `live.mjs`: live text from BroadcastChannel or the authenticated local relay.

## Current content contract

`{format:"vnkit.content", version:1, id, title, adapter:{id,version}, entry,
assets:{assetId:{type,url}}, instructions:[...]}`. Asset URLs are relative paths
within the import. Instructions have stable `id`, `op`, and optional `source`
provenance. `next` overrides the next authored instruction; otherwise execution
continues to the next entry. Adapter output must already encode source control
flow correctly; the reader never derives narrative order from filenames.

Text is a string or a run array, e.g.
`["今日は", {"base":"日本語", "reading":"にほんご"}, "を読む。"]`.
Ruby runs become semantic `<ruby>` with one `<rt>`, without per-character spans.

Supported operations are `text`, `choice`, `jump`, `if`, `set`, `add`, `call`,
`return`, `background`, `sprite`, `music`, `sound`, `wait`, `end`. See the working
fixture and `validateContent` for exact fields. Conditions compare `{var,
operator,value}` using `eq/ne/lt/lte/gt/gte`; variables default to zero when first
read. No expression evaluation, arbitrary JavaScript, or unknown op skipping is
allowed. Unknown instructions fail before execution, including unreachable ones.

This intentionally small runtime currently has no video instruction, native
engine bytecode interpreter, complex transition/mask/shader effects, animation
tracks, arbitrary easing, or source-specific typography. No commercial engine
support follows from synthetic fixture tests. Adapters must report such gaps.

## State and reading data

Version 1 `vnkit.save` records game/content signature, PC, variables, return stack,
background, positioned sprites, music, pending presentation and occurrence ID,
remaining script wait, and music/voice/effect playback positions. Import validates
the content revision and structure. Media seek accuracy is browser/codec-dependent.
Audio autoplay remains subject to browser policy and requires a user gesture on
some devices. The fixture's voice channel contains test tones, not spoken audio.

Game saves and `vnkit.activity` records use separate IndexedDB keys. A restored
presentation never emits or counts again. Revisiting a segment through execution
gets a new occurrence ID and counts as rereading. New source locations with the
same sentence count as distinct unique text. Skip adds no reading characters.
Choice options are exported once when presented; only the selected choice is
counted, separately from narrative. Punctuation counts; whitespace, speaker names,
UI labels and ruby readings do not. These are estimates of reading activity.

One reader tab per game owns a Web Lock; insecure contexts use a renewable local
lease. Companion pages have no timer. Hidden tabs, panels, manual pause and five
minutes of inactivity pause activity; the threshold is configurable. A heartbeat
gap contributes at most five seconds. JSON and session CSV exports are available
in Activity. Save files are exported separately in Saves. Backups are local
downloads on the reading device; browser storage is not the Linux server's disk.

## Text delivery and interaction

The Japanese textbox is always reserved for text selection and dictionary use.
Click/tap artwork or Next, or use Space/Enter/Right Arrow to advance. Existing
selection, input controls and open panels block advancement. Alt+C copies current
text; Alt+S and Alt+L quicksave/load. Explicit Copy attempts a browser fallback when
the Clipboard API is unavailable. Automatic copy is opt-in and requires a secure
context and permission; failure is shown instead of copying on the server.

Events use `vnkit.text-event` version 1 with `type`, `gameId`, `gameTitle`,
`sessionId`, `segmentId`, `occurrenceId`, `speaker`, `sentence`, `timestamp`,
`flags:{skip,navigation,restored:false}`, `ruby`, `speakerIncluded`. They represent
complete displayed segments, never typewriter fragments or future script text.
The relay receives `{token,event}` at `/api/events`. Get publisher credentials
and separate receiver URLs from `/api/session`. Do not substitute the publisher
token into a receiver URL. The default receiver JSON contains `sentence`, which
Renji's receiver accepts; `format=plain` is dialogue-only text, and `format=json`
contains structured events. Changing output settings does not republish old text.

## Verification scope

Run `node tests/reader-engine.test.mjs`. These original fixture tests exercise both
branches and more than 120 segments per route, save state around choices and
inside calls, validation failures, ruby, identity-based statistics and pause/
reload/skip accounting. Browser integration tests and actual-game evidence are
tracked separately in the repository's testing/investigation documentation.
Yomitan operation and real Windows/Android clipboard/device behaviour require
device checks; automated core tests do not establish those claims.
