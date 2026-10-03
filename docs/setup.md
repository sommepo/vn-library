# Setup and importing

For Windows, download the latest release and follow the [installer guide](windows.md).
No game content is included. Each adapter accepts only its documented edition.

## Linux

You can also run the reader on a Linux computer or home server.

You’ll need Python 3.11+, Node.js 22+, FFmpeg/ffprobe and the game’s conversion
tools. The automatic tool setup currently targets Ubuntu 26.04 on x86-64; other
distributions may need manual setup.

Download **VN-Library-Linux-source-v0.2.0.tar.gz** from
[Releases](https://github.com/sommepo/vn-library/releases/tag/v0.2.0), or clone
the repository. The Linux download is source code, not a desktop installer.
Extract it, open a terminal in the `vnkit` folder, then follow the
[CLANNAD setup guide](clannad-import.md) or
[Remember11 setup guide](remember11-import.md).
Cartagra uses FFmpeg/ffprobe and the standard media tool setup; see the
[Cartagra guide](cartagra-runtime.md).
Never7 and Ever17 use the same media tools as Remember11; see the
[Never7 guide](never7-runtime.md) or [Ever17 guide](ever17-runtime.md).
Higurashi uses the CLANNAD media tools; follow its
[import guide](higurashi-runtime.md#import-from-your-own-disc).

Start the reader:

```sh
python3 -m vnkit serve --port 8891
```

Open **http://127.0.0.1:8891/** in your browser. Keep the terminal running while
importing or playing. If the port is occupied, choose another with `--port`.

Docker Compose is available for serving games you’ve already imported. It does
not include the conversion tools.

## Import a PS2 ISO

Add game supports the six exact PS2 editions listed in the [README](../README.md#games-and-platforms).

1. Open **Library → Add game / Import media**.
2. Choose your ISO and click **Add game**.
3. Wait for **Ready to play**, then click **Open game**.

The app copies the ISO to the folder shown on screen, checks the edition and
prepares the game automatically. Your original file stays unchanged.

You can close the import panel while preparation continues, but keep the app or
server running. If something stops, choose **Try again** to reuse the uploaded ISO
and completed work.

The uploaded ISO and temporary conversion files are kept after import. They are
not automatically removed, so allow space for these as well as the finished game.
Conversion requires at least **24 GiB free**, after the upload.

To avoid copying an ISO already on the host, expand **Use an ISO already on the
host** and select it there.

By default, the server lists ISOs in the toolkit folder. To use another folder:

```sh
VNKIT_IMPORT_SOURCE_DIR=/path/to/isos python3 -m vnkit serve --port 8891
```

The CLI is also available. For example:

```sh
python3 -m vnkit inspect '/path/to/Clannad (Japan).iso' --fingerprint
python3 -m vnkit import '/path/to/Clannad (Japan).iso' \
  --adapter clannad-ps2 --work private/clannad \
  --out private/library/clannad
```

Current imports can finish with exit code **3** because presentation support is
incomplete. Read the report: this is different from a conversion failure, which
uses exit code **2**.

[GUI import and recovery](import-gui.md) ·
[CLI and adapter guide](adapters.md)


## Import PS1 CUE/BIN media

PS1 import is currently a local command-line workflow. Keep the original CUE
and its named BIN together. The browser uploader accepts PS2 ISOs only.

- [Memories Off](memoriesoff-runtime.md#import) needs FFmpeg, FluidSynth and
  the documented VGMTrans builds.
- [Kamaitachi](kamaitachi-runtime.md) needs the exact-VAB converter described
  in [PS1 media tools](ps1-media-tools.md).
- [Otogirisou](otogirisou-runtime.md) uses the same exact-VAB converter and
  the bundled reviewed Unicode correspondence, checked against your source font.

The Windows package includes these readers and their source, but its bundled
conversion tools and Add game flow remain for PS2. Use an independently prepared
PS1 import or configure the extra converters yourself. To transfer your own
finished import, copy its complete folder into the host's library while the
reader is stopped; see [Windows data folders](windows.md#games-saves-and-updates).

## PSP

The **portable** frontend is included and starts empty. There is no playable
PSP adapter or PSP import UI yet. [428 research](428-psp-investigation.md) is
paused and its recovery output is not a reader import.

## Check your media

The per-game guides identify accepted editions. These SHA-256 values identify
the PS2 ISO dumps used for the documented tests; no discs are provided.

```text
CLANNAD
35077758488971fc919b2afdadd4e9ebaad48ac67443cf281bbdbfed9bae81e9

Remember11
5cfad772a6d320f2c96c5692e7813a971a045a451e49ba81e3a4402557bd612b

Never7
52759964e8437da516827dc5ca28dc92a15c98940f5b9453131ca028a3b78c8b

Ever17 Premium Edition
45b7e194a205e761f1550dc5b728811f82dc91d72af95a14f5ab085e08c1ac4c

Cartagra
6534fc86c45780aadb58dc6013d47bbf9a87bf305d8742e230cba9004f0946d1

Higurashi Matsuri: Kakera Asobi (standalone)
0d7ff9509035cce07a9b06c8d2c813cadcf2c07adb97e4fa9da3041851f8f859
```
