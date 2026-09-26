# Anki media from the game

**Available in beta.4.** This needs the updated reader/server and the
VN Library media add-on. Earlier release downloads do not contain this feature.

Once set up, Yomitan's ordinary **Add** button includes the current scene image
and its original voice clip, when available. No desktop recording, microphone,
OCR, media-capture permission or second dictionary is needed.

## Setup

1. Keep desktop Anki and **AnkiConnect** installed on the computer where you use
   Yomitan. Anki must remain open.
2. In VN Library, open **Reading settings → Anki media → Download Anki add-on**.
   The download is preconfigured with the address of this reader.
3. In Anki, choose **Tools → Add-ons → Install from file** and select
   `VN-Library-media.ankiaddon`. Restart Anki. Its options are under
   **Tools → VN Library media** (or the add-on's Config button).
4. In Yomitan's Anki settings, change the AnkiConnect address to
   `http://127.0.0.1:8776`. Keep your existing AnkiConnect key if you use one.
   AnkiConnect itself keeps its normal port, usually 8765. Approve its normal
   connection-permission prompt if shown.
5. Set up these fields in your Yomitan note format:

   | Note field | Yomitan value |
   | --- | --- |
   | Source | `{url}` |
   | Picture | Leave blank |
   | SentenceAudio | Leave blank |

   These fields must exist in your Anki note type. If your type uses other names,
   enter those names in **Tools → VN Library media**. Keep dictionary word audio
   in a separate field. Your card template must display `{{Picture}}` and
   `{{SentenceAudio}}` where you want them to appear. The add-on does not change
   note types, card templates, decks or dictionary definitions.
6. Enable **Attach the scene and original voice** in the reader's Anki media
   panel. Close settings and wait for **Anki: ready** in the bottom controls
   (also shown in the fullscreen menu). Then open a fresh word lookup and click
   Yomitan's Add button as usual. A popup opened while media was preparing must
   be closed and reopened; it keeps the earlier URL.

The bridge default is **8776**, separate from the reader (**8891**) and
AnkiConnect (**8765**). All are configurable. No firewall changes are made.
A VN Library profile in Yomitan can keep this setup separate from other sites.
Normal cards from unrelated sites with a Source URL pass through unchanged.
Missing or blank Source fields are rejected so a misconfigured format cannot
silently create a game card without its media.

## Checking your setup

- **A card has `#vnl=pending` in Source and empty media:** the lookup opened
  before media was ready. A new note with that URL did not pass through the
  bridge's Add path: the bridge rejects pending lookups and removes valid
  context fragments before adding. Check Yomitan's address is port **8776**,
  not AnkiConnect's **8765**. Wait for **Anki: ready** and open a fresh lookup.
- **The Add button disappears after changing the address:** keep Anki open,
  restart it after installing the add-on, and check **Tools → VN Library media**
  appears. Check Yomitan's Anki connection status and the configured bridge port.
  If the word already has a note, check another unmined word too.
- **Anki: retry:** open the status button and choose **Prepare current line
  again**. The error explains what failed. A failed request no longer leaves the
  URL saying `pending` indefinitely.

The ready indicator confirms that the reader prepared media. It cannot check
Yomitan's settings or confirm the add-on is running on your reading computer.
Existing cards are not automatically repaired by changing the address.

## Home server and device support

The reader may run on a Linux home server while Anki and the bridge run on your
Windows or Linux reading computer. Use the reader's private HTTPS/Tailscale
address to download the add-on. That exact origin is allowed in its configuration.
The computer running Anki must be able to reach that address.

The bridge binds only to `127.0.0.1`; it does not expose Anki on your network.
Remote reader origins require HTTPS. The bridge is not an AnkiDroid/AnkiMobile
add-on, and direct phone-to-desktop mining is not provided in this first version.
Cards already added follow Anki's normal media sync and device playback support.

## What gets attached

- **Image:** the fully composed graphics plane at the game's source resolution,
  using decoded backgrounds, portraits, layers and scene overlays. It omits the
  textbox, dictionary popup, menus and CRT filter. If the source scene is black,
  its image is black too. This is not a screenshot of the desktop.
- **Audio:** the complete imported voice asset associated with that presentation,
  without re-recording or lossy conversion. A clip can span several short text
  segments. This version does not crop timed subsegments or concatenate earlier
  lines. Music, effects and dictionary pronunciation are not substituted for a
  missing voice. Missing-on-disc voice associations remain absent.
- The sentence and word still come from Yomitan. The bridge preserves definitions,
  tags, deck settings, dictionary pronunciation and unrelated fields. It fills the
  two configured game-media fields, replacing competing content in those fields.

Lookups pin their own media context. Advancing after opening a popup does not
change what that popup adds. Repeated sentences use separate source/occurrence
IDs. Mining does not advance the story, mark extra text read or change statistics.

Backlog, companion-page and menu mining are deliberately refused for now: those
views do not have their historical scene images. Use Previous line or a save to
return to the desired scene, then open a fresh lookup.

## Failures and privacy

Only explicitly enabled mining prepares media. The host keeps up to 128 contexts
for at most two hours, bounded to 64 MiB in memory. Restarting the host or filling
the cache can expire an old lookup sooner. No context history is written to disk.
If media is still being prepared, expired, unavailable or rejected by Anki, no
new card is requested. Return to the original line and choose **Anki media → Prepare current line
again**, then open a new lookup. Do not return
to a different scene and retry an old popup expecting its media to change.

AnkiConnect can sometimes swallow failures in its optional attachment helper.
The bridge instead calls `storeMediaFile` and checks each required write before
creating the note. A failed note creation can leave unreferenced media in Anki;
its Check Media tool can find that. An ambiguous timeout after creation is never
automatically retried: check Anki before clicking Add again.

The URL fragment contains a short-lived capability for one context. It is removed
from the Source field before saving to Anki. Treat active lookup URLs as private.
Requests are not logged. The bridge fetches only configured reader origins,
refuses redirects, uses bounded requests, and forwards Anki actions only to the
configured loopback AnkiConnect port. It never receives the entire game script.
Game media added to Anki is part of your collection and follows **your Anki sync
settings**, which may upload it to AnkiWeb. VN Library does not initiate sync.

## Implementation and checks

- `web/mining.mjs`: source composition and immutable presentation contexts;
  uses the existing `SceneCapture` compositor rather than a second renderer.
- `vnkit/mining.py`: bounded context cache and registered source-voice access.
- `vnkit/anki_bridge.py`: original AnkiConnect-compatible bridge. It preserves
  Yomitan's version-2 bare responses and modern version-6 envelopes. It enriches
  `addNote`, `addNotes`, `guiAddCards` and those operations nested in `multi`.
  Existing-note updates are not enriched in this version.
- `anki-addon/__init__.py`: desktop Anki lifecycle and configuration dialog.
- `vnkit/anki_addon.py`: builds the add-on from original source only.

For development without installing the add-on, run on the Anki computer:

```sh
python3 -m vnkit.anki_bridge --config /path/to/local-anki-bridge.json
```

The JSON uses the keys documented in `anki-addon/config.md`.
Do not run this command and the Anki add-on simultaneously on the same port.

Tests use temporary state and an Anki transport mock, never the user's collection:

```sh
python3 -m unittest discover -s tests -p test_mining.py -v
sh scripts/browser-env.sh node tests/browser-mining.mjs private/browser-tests/new-mining
```

Chromium and Firefox pass original-fixture scene/voice transfer, old-popup
pinning, unvoiced narration, backlog refusal, restore and opt-out. The optional
`VNKIT_YOMITAN_CLIENT` points to an unmodified, privately checked-out upstream
`ext/js/comm/anki-connect.js`; this actual client passes through the real HTTP
bridge. This is not an installed-extension popup test. Real CLANNAD portrait composition and FLAC voice, plus Higurashi WAV voice,
also pass with unchanged study counts, using isolated state; private reports are not distributed.
The maintainer reported successful desktop mining after configuring Yomitan
to use the bridge on port 8776. The automated tests do not run a real Anki
collection. Other note templates, browser/OS combinations and media playback
on synced devices still need testing.
