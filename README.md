# VN Library

Read Japanese visual novels in your browser, with dictionary lookups, sentence
mining and reading stats. Import your own game media, then read on a desktop,
tablet or phone. No game files are included or downloaded.

## Get started

- **Windows:** download [the v0.2.0 installer](https://github.com/sommepo/vn-library/releases/tag/v0.2.0), extract it and run `Install.cmd`.
- **Linux:** download the source from [the same release](https://github.com/sommepo/vn-library/releases/tag/v0.2.0) or clone this repository, then follow [setup](docs/setup.md).

Open the library, choose **Add game / Import media** and select a supported PS2
ISO. PS1 CUE/BIN and GBA cartridge imports use the command line and the extra
steps described in their game guides. Imported games no longer need the original
disc image to play.

Updating: quit the Windows tray app before running the new installer. Keep your
game folders and back up your saves. Existing imports do not need rebuilding.

[Windows instructions](docs/windows.md) · [Linux and importing](docs/setup.md) ·
[Changelog](docs/changelog.md) ·
[Releases and checksums](https://github.com/sommepo/vn-library/releases)

## Games and platforms

The reader opens on a small **Home** page with today's reading and overall
statistics. From there the library has four minimal console-inspired
environments: **one** for PS1, **two** for PS2, **portable** for PSP and
**advance** for GBA. Portable is included as an empty frontend; no PSP game is
playable yet.

Support is per exact edition, and several readers are experimental. Each game
guide lists the exact supported edition,
setup, implementation, tested coverage and remaining limitations.

| Platform | Game guide | Import |
| --- | --- | --- |
| one · PS1 | [Memories Off](docs/memoriesoff-runtime.md) | Local CUE/BIN CLI |
| one · PS1 | [Otogirisou: Sosei-hen](docs/otogirisou-runtime.md) | Advanced local CUE/BIN CLI |
| one · PS1 | [Kamaitachi no Yoru: Tokubetsu-hen](docs/kamaitachi-runtime.md) | Advanced local CUE/BIN CLI |
| two · PS2 | [CLANNAD](docs/clannad-runtime.md) | Add game or CLI |
| two · PS2 | [Remember11](docs/remember11-runtime.md) | Add game or CLI |
| two · PS2 | [Never7](docs/never7-runtime.md) | Add game or CLI |
| two · PS2 | [Ever17 Premium Edition](docs/ever17-runtime.md) | Add game or CLI |
| two · PS2 | [Cartagra](docs/cartagra-runtime.md) | Add game or CLI |
| two · PS2 | [Higurashi Matsuri: Kakera Asobi](docs/higurashi-runtime.md) | Add game or CLI |
| advance · GBA | [Gyakuten Saiban](docs/gs1-gba-runtime.md) | Experimental local CLI |
| advance · GBA | [Gyakuten Saiban 2](docs/gs2-gba-runtime.md) | Experimental local CLI |
| advance · GBA | [Gyakuten Saiban 3](docs/gs3-gba-runtime.md) | Experimental local CLI |

The three Gyakuten Saiban cartridges run on an original-code GBA machine in the
browser (no BIOS image, no third-party emulator), with the game's own graphics
and sound, its text as selectable Japanese, touch on the game screen and saves.
Their text uses the included glyph and name-tag maps, which are bound to each
ROM and have not been proofread; see each guide.

[Platform environments](docs/platform-environments.md) ·
[Compatibility](docs/compatibility.md) · [428 research status](docs/428-psp-investigation.md) (experimental, not playable)

## Reading and learning

- Selectable Japanese for browser dictionaries such as [Yomitan](https://github.com/yomidevs/yomitan).
- Optional [Anki media support](docs/anki.md) for the current scene and original voice.
- Backlog, Auto, Skip read, Next choice, Previous line and global pause.
- Autosave, 15 manual slots and optional shared saves across your devices.
- Reading activity, Home statistics, an optional session stats box, exports, Live text and WebSocket text output.
- Adjustable display/audio, optional CRT filters and sound tests where supported.

Otogirisou and Kamaitachi retain their original full-scene text and inline choices.
The platform menus have smooth transitions and sliding glass selection controls.

[Reader guide](docs/reader-guide.md) · [Saves](docs/shared-saves.md) ·
[Reading statistics](docs/text-and-statistics.md) · [Remote access](docs/remote-access.md)

## Contribute

Documentation, tests, reader improvements and edition-specific adapters are
welcome, by hand or with any coding agent. Start with [Contributing](CONTRIBUTING.md)
and the [contributor workflow](docs/contributor-workflow.md).

[Architecture](docs/architecture.md) · [Adapter development](docs/adapters.md) ·
[Testing](docs/testing.md) · [Optional import skill](.agents/skills/vn-import/SKILL.md)

## Licence and credits

Original code is [MIT](LICENSE). Game content is not included or covered by that
licence. See [third-party notices](third_party/) and [provenance](docs/provenance.md)
for conversion tools and reused components.

Inspired by [Tsukiweb](https://github.com/requinDr/tsukiweb-public),
[Renji’s Texthooker UI](https://github.com/Renji-XD/texthooker-ui) and
[GameSentenceMiner](https://github.com/bpwhelan/GameSentenceMiner).
Menu music: “Nova Mistero” by **virabelo**, from
[Free Music Archive](https://freemusicarchive.org/music/virabelo/nova-mistero),
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), recording unchanged.

Developed with substantial assistance from OpenAI Codex. Game dialogue, artwork,
music and voices come from your supplied media; the importer and reader do not
need an AI service. [Development and AI usage](docs/development.md)
