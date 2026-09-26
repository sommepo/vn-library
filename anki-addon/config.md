# VN Library media

Requires AnkiConnect to be installed and Anki to stay open. Configure this add-on
in **Tools → VN Library media**. The bridge listens on loopback. Optional
Tailscale Serve HTTPS access allows a phone to mine into this computer's Anki.

- `reader_origins`: exact reader addresses, such as `http://127.0.0.1:8891` or
  your private Tailscale HTTPS address. No trailing slash or path.
- `port`: bridge port used in Yomitan (default 8776).
- `anki_port`: existing AnkiConnect port (default 8765). Do not change its bind address.
- `source_field`: map this field to `{url}` in Yomitan.
- `image_field`, `audio_field`: blank Yomitan fields that receive game media.
  These must exist in your note type. Keep dictionary pronunciation in a separate field.
- `remote_enabled`: off by default. Requires the phone connection key on every
  request, including requests from Yomitan on this computer.
- `remote_origin`: this Anki computer's exact HTTPS origin, for example
  `https://your-anki-computer.your-tailnet.ts.net:8776`. This is separate from the reader host.
- `remote_key`: generate with the settings dialog. Put it in Yomitan's API key
  setting on every connected device. Keep it private; never put it in a URL.
- `anki_key`: AnkiConnect's existing key, if it has one. In remote mode the bridge
  uses this separate key for local AnkiConnect. It never forwards the phone key.

For remote use, choose **Detect Tailscale**, then **Copy Tailscale setup command /
instructions** and **Save**. Run the copied command on this computer after
checking `tailscale serve status` for a port conflict. Use Serve, not Funnel;
do not change AnkiConnect's bind address or reset other Tailscale routes. In the
phone's Yomitan settings use the copied HTTPS address and connection key. Anki
must stay open and this computer must stay awake. These settings do not configure
Tailscale automatically. See the project's `docs/anki.md` for the full guide.

Turn off this Serve endpoint before disabling remote mode. Local Yomitan then
uses its original AnkiConnect key again, or none if AnkiConnect has no key.

Enable **Anki media** in VN Library's reading settings. Look up a word on the
current game line, then use Yomitan's ordinary Add button. The reader host must
remain reachable. Old or expired lookups fail visibly; look up the original line
again. Backlog mining is deliberately refused because it has no saved scene image.

Media becomes part of your Anki collection and follows its normal sync settings.
