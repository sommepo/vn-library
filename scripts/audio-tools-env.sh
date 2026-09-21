#!/bin/sh
# Optional locally extracted Ubuntu tools; no host package installation.
set -eu
vnkit_audio_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
vnkit_audio_sysroot="$vnkit_audio_root/private/tooling/audio-sysroot"
if [ ! -d "$vnkit_audio_sysroot/usr/bin" ]; then
  echo 'Optional audio tools are absent; see docs/pia-audio.md.' >&2
  exit 2
fi
PATH="$vnkit_audio_sysroot/usr/bin:$PATH"
LD_LIBRARY_PATH="$vnkit_audio_sysroot/usr/lib/x86_64-linux-gnu:$vnkit_audio_sysroot/usr/lib/x86_64-linux-gnu/pulseaudio${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
XDG_CONFIG_HOME="$vnkit_audio_root/private/tooling/audio-config"
export PATH LD_LIBRARY_PATH XDG_CONFIG_HOME
exec "$@"
