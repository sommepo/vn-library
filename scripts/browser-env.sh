#!/bin/sh
# Select private browser tools and optional locally extracted libraries/fonts.
set -eu
vnkit_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
export PLAYWRIGHT_BROWSERS_PATH="$vnkit_root/private/tooling/browsers"
if [ -d "$vnkit_root/private/tooling/sysroot/usr/lib/x86_64-linux-gnu" ]; then
  export LD_LIBRARY_PATH="$vnkit_root/private/tooling/sysroot/usr/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
fi
if [ -f "$vnkit_root/private/tooling/fonts.conf" ]; then
  export FONTCONFIG_FILE="$vnkit_root/private/tooling/fonts.conf"
fi
exec "$@"
