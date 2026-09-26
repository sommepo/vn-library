# VN Library media

Requires AnkiConnect to be installed and Anki to stay open. Configure this add-on
in **Tools → VN Library media**. The bridge listens only on this computer.

- `reader_origins`: exact reader addresses, such as `http://127.0.0.1:8891` or
  your private Tailscale HTTPS address. No trailing slash or path.
- `port`: bridge port used in Yomitan (default 8776).
- `anki_port`: existing AnkiConnect port (default 8765). Do not change its bind address.
- `source_field`: map this field to `{url}` in Yomitan.
- `image_field`, `audio_field`: blank Yomitan fields that receive game media.
  These must exist in your note type. Keep dictionary pronunciation in a separate field.

Enable **Anki media** in VN Library's reading settings. Look up a word on the
current game line, then use Yomitan's ordinary Add button. The reader host must
remain reachable. Old or expired lookups fail visibly; look up the original line
again. Backlog mining is deliberately refused because it has no saved scene image.

Media becomes part of your Anki collection and follows its normal sync settings.
