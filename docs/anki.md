# Anki media from the game

**Included in the refreshed beta.4 download.** Phone-to-desktop mining needs
**VN Library media add-on 0.2.0**. If you installed the earlier 0.1.0 add-on,
download it again from the updated reader and reinstall it in Anki. Updating
the reader alone does not update an add-on already installed in Anki.

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
Yomitan's settings or confirm the add-on is running on your Anki computer.
Existing cards are not automatically repaired by changing the address.

## Home server and device support

The reader may run on a Linux home server while Anki and the bridge run on your
Windows or Linux reading computer. Use the reader's private HTTPS/Tailscale
address to download the add-on. That exact origin is allowed in its configuration.
The computer running Anki must be able to reach that address.

The bridge and AnkiConnect both bind to `127.0.0.1`. Remote reader origins require
HTTPS. Cards already added follow Anki's normal media sync and device playback
support.

### Mine on a phone, add cards on a computer

This works through the phone's Yomitan extension and desktop Anki. The game may
stay on a separate home server. It is not an AnkiDroid or AnkiMobile add-on.

```text
Phone: VN Library + Yomitan
    → Tailscale HTTPS on the Anki computer
    → VN Library media add-on
    → local AnkiConnect → Anki collection

The add-on fetches the selected scene and voice from the reader host.
```

1. Install **VN Library media 0.2.0** on the computer running Anki, replacing the
   older add-on through **Tools → Add-ons → Install from file**. Restart Anki.
   Keep your existing note-field names and reader address.
2. Connect that computer and the phone to your Tailscale network. The computer
   must also be able to open your reader's address.
3. Open **Tools → VN Library media** and enable **Allow mining from my phone /
   another device through Tailscale**. Choose **Detect Tailscale**. This fills
   in the Anki computer's HTTPS address and generates a connection key.
4. Choose **Copy Tailscale setup command / instructions**, then **Save**. In a
   terminal on the Anki computer, run `tailscale serve status`. Check that the
   chosen HTTPS port is unused, then run the copied command. With the default
   ports, it is:

   ```sh
   tailscale serve --bg --https=8776 http://127.0.0.1:8776
   ```

   Follow Tailscale's HTTPS setup link if it shows one. If that HTTPS port already
   belongs to another service, change the port in the add-on's HTTPS address,
   save, and copy its updated command. Do not reset existing Serve routes.
5. In the phone's **Yomitan → Anki settings**, set the server address to the
   **phone address** shown in the add-on, for example
   `https://your-anki-computer.your-tailnet.ts.net:8776`. Use **Copy key** to put the
   connection key in Yomitan's **API key** setting. It is required even for the
   connection check. Do not put the key in the URL.
6. Keep the same note-field setup: Source uses `{url}`, with empty templates for
   your scene image and sentence audio fields. Enable **Anki media** in the
   phone's VN Library settings, wait for **Anki: ready**, and open a fresh lookup.

If you also mine on the Anki computer, its Yomitan address can stay
`http://127.0.0.1:8776`, but it now needs the **same connection key**. If
AnkiConnect already has its own key, enter that separately in the add-on's
**Existing AnkiConnect key** field. The phone key is not sent to AnkiConnect.

There are two different addresses: **Reader addresses** points to the machine
hosting the game; **This Anki computer's HTTPS address** points to the machine
running Anki. They can be different machines. Keep Anki open and its computer
awake while mining. Phone cards are added to that desktop collection and reach
AnkiDroid through your usual sync.

Use [Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve), which
is private to your tailnet, rather than Funnel. No router port forwarding is
needed. Leave AnkiConnect's bind address, CORS settings and port unchanged.
The add-on detects an address and copies commands; it does not change your
Tailscale setup itself. Keep the connection key private: it grants access to
mining and collection lookups. Normal mining actions are allowed; arbitrary
AnkiConnect administration and deletion commands are refused.

To turn remote access off, remove only this Serve endpoint with
`tailscale serve --https=8776 off` (use your chosen HTTPS port), then disable
remote mining in the add-on. Restore the local Yomitan API key to your original
AnkiConnect key, or leave it empty if you had none.

If Yomitan cannot connect, check the HTTPS address and connection key, that Anki
is open, and that both devices are connected to Tailscale. `127.0.0.1` on a phone
means the phone itself. Opening the bridge address as a normal webpage is not a
connection test; use Yomitan's connection status.

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
python3 -m unittest discover -s tests -p 'test_mining*.py' -v
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

Remote tests use an isolated HTTPS reverse proxy with a verified test certificate
and mocked Anki writes. They cover image/voice attachment, version-2 and version-6
replies, connection-key checks, nested batches, backend key separation and turning
remote mode off. `VNKIT_TEST_REMOTE_MINING=1` runs the browser harness with remote
authentication; its transport remains loopback, while the Python tests cover TLS.
These checks do not establish a real phone/Tailscale/Windows Anki pass.
