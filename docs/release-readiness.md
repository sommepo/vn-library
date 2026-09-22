# Public release readiness (historical pre-release assessment)

This assessment predates the v0.1.0-beta.1 public release. It remains a record of
what that early beta did not establish: it is not a claim that the release was
unpublished or that its installation paths are fully verified.

## Already built

- Working CLANNAD and Remember11 imports using the owner's disc content.
- Shared reader, local/shared saves, learning features and optional CRT filters.
- GUI upload, server ISO selection, edition checks and CLI-backed import jobs.
- Private staging, validation before installation, existing-import protection,
  resumable chunks, persistent job status and source fingerprints.
- MIT original code, third-party notices and an explicit code-package allowlist.
- Python/Node tests and isolated Chromium/Firefox checks with actual game data.

This is substantial reusable software, not just two frontends. New titles still
need evidence that their formats and engine behavior match a supported adapter.

## For a future verified/stable release

Windows test installer: see [Windows setup](windows.md). It includes a tray app,
app-local runtime/tool setup and configurable port. It still needs installation,
upgrade/uninstall and complete import tests on the Z13 before claims of a verified
Windows install-and-play release.

1. **Prove clean setup and conversion.** Unpack the release on a fresh Linux
   installation. Bootstrap dependencies without the development cache, upload a
   full owner-supplied ISO and import each supported game through the GUI. Test
   interruption/recovery and run actual reader smoke tests on those outputs.
   Current GUI evidence covers real HTTP transfer of synthetic data and actual
   CLANNAD identification; its conversion orchestration tests mock the CLI result.
   The Remember11 bootstrap's Ubuntu 26.04 x86-64 dependency is a portability limit.
   The GUI now checks vgmstream only for CLANNAD; Remember11 checks its own
   VGMTrans and FluidSynth dependencies.
2. **Review the publication contents.** Build the code-only package and inspect
   it for private content, personal hostnames/paths and accidental test artifacts.
   README now uses generic setup, but older linked reports still contain home-server
   details. Rewrite those public entry points or keep local operational notes out
   of the release. Recheck licence notices and package contents after these changes.
3. **Test advertised integrations.** Use real Yomitan/Anki mining, GSM text input
   plus capture/overlay, and Hachidori screenshots. Record browser/OS versions and
   exact setup. Until then, retain the README's unverified labels. The existing
   feed is WebSocket, not an outbound webhook. Renji format checks are not GSM tests.
4. **Bring regression entry points up to date.** Some older browser harnesses
   still use removed Q.Save/Q.Load buttons or assume expanded title actions.
   Use the newer focused tests as current evidence and fix the older selectors
   before presenting a single public all-tests command as comprehensive coverage.
5. **Choose the release scope.** An early beta can ship with honest animation,
   timing, extras and route-coverage limits. A stable release needs broader route
   and device testing. Native Windows/macOS import, ARM hosting, Safari/iOS and
   Docker-based conversion are not currently verified targets.

The existing Docker setup only serves already imported games. It has a read-only
library and lacks Node/media import tools; it must not be advertised as a complete
GUI-import appliance until that is deliberately implemented and tested.

## Historical README wording decisions

The wording decisions below were recorded before publication. The published
project name is VN Library; retained points describe scope and evidence limits.

- Keep the current name, VN Import Toolkit, until the owner chooses another.
- Use “early beta,” not “complete PS2 emulator” or “universal ISO converter.”
- Explain direct browser lookups without claiming every extension/browser was tested.
- Treat GSM/Hachidori as integration candidates until end-to-end tests pass.
- Keep Live text separate from Activity; do not call it a live stats page.
- List Sound test once. Credit GSM and Renji for stats inspiration without implying
  their code was copied.
- Include planetarian in the PS2 roadmap. Prototype confirms the PS2 release:
  https://www.prot.co.jp/ps2/planetarian/index.html. Engine compatibility is untested.
- The historic wording approval did not establish broad device, route or
  integration support beyond the published early-beta claims.

External feature descriptions were checked against the official
[GSM settings](https://docs.gamesentenceminer.com/docs/settings/),
[Hachidori capture guide](https://github.com/bee-san/hachidori/blob/main/docs/media-capture.md),
[Yomitan Anki guide](https://yomitan.wiki/anki/) and
[Tailscale Serve docs](https://tailscale.com/docs/features/tailscale-serve).
These support their own features, not proof of integration with this reader.
