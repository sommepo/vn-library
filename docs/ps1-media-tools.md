# PS1 media conversion tools

The PS1 readers ship in beta.5; their CUE/BIN conversion is an advanced local
CLI workflow. It is not part of browser Add game or the Windows tool bundle.
Install Node.js 22+, FFmpeg/ffprobe and FluidSynth. Original samples and sequences
are recovered from your own media; no soundfonts or game files are downloaded.

## VGMTrans builds

Use [VGMTrans](https://github.com/vgmtrans/vgmtrans) revision
`3e16daae49d42246f2d1b302b04f6e80a8037342`. A C/C++ toolchain, CMake 3.25+
and Git are needed. The shell target does not need Qt. These are separate
external tool builds; do not modify an existing PS2 converter in place.

For Kamaitachi and Otogirisou, start from the toolkit root:

```sh
git clone https://github.com/vgmtrans/vgmtrans.git private/tools/vgmtrans-chunsoft
git -C private/tools/vgmtrans-chunsoft checkout 3e16daae49d42246f2d1b302b04f6e80a8037342
git -C private/tools/vgmtrans-chunsoft submodule update --init --recursive
git -C private/tools/vgmtrans-chunsoft apply "$PWD/scripts/vgmtrans-chunsoft-exact-vab.patch"
cmake -S private/tools/vgmtrans-chunsoft -B private/tools/vgmtrans-chunsoft-build \
  -DCMAKE_BUILD_TYPE=Release -DENABLE_UI_QT=OFF -DENABLE_SHELL=ON -DBUILD_LTO=OFF
cmake --build private/tools/vgmtrans-chunsoft-build --target vgmtrans-shell -j 2
export VNKIT_CHUNSOFT_VGMTRANS="$PWD/private/tools/vgmtrans-chunsoft-build/src/ui/shell/vgmtrans-shell"
```

The exact-VAB patch uses authoritative sample lengths and validates bounded
ADPCM frames, including banks beginning with sustained silence. It is the source
change used for the recorded conversions; other revisions are not verified.
Full fresh builds remain dependent on the host compiler and upstream build
requirements. The executable is not supplied by this release.

Memories Off uses two builds of the same pinned revision: an unmodified shell
selected with `VNKIT_VGMTRANS`, and a separate shell with
[`vgmtrans-memoriesoff-short-vab.patch`](../scripts/vgmtrans-memoriesoff-short-vab.patch)
selected with `VNKIT_MEMORIESOFF_SHORT_VGMTRANS`. Repeat the clone/build steps
in separate directories, applying only that patch for the short-VAB build.
Do not combine the PS1 patches or apply the PS2 filename/pressure patches to
these builds. All three variables must point to actual executable files.

VGMTrans is zlib-licensed. Preserve its licence, vendored-library notices and
modified-source attribution; see [the retained notice](../third_party/LICENSE-vgmtrans.txt)
and [provenance](provenance.md).

## Import

Use the [Memories Off guide](memoriesoff-runtime.md#import) or
[shared sound-novel commands](chunsoft-ps1-runtime.md#local-import). Tool environment
variables must be present in the shell running the CLI. Keep conversion output
private and use a new directory when changing inputs or converter builds.
Otogirisou includes a reviewed Unicode correspondence bound to the original
font texture hashes. Read [its guide](otogirisou-runtime.md) for the review limits.
