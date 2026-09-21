#!/bin/sh
# Optional testing dependency only; never part of the reader's runtime.
set -eu
vnkit_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
vnkit_tools="$vnkit_root/private/tooling"
mkdir -p "$vnkit_tools"
vnkit_archive="$vnkit_tools/playwright-core-1.55.0.tgz"
if [ ! -f "$vnkit_archive" ]; then
  curl --fail --location --proto '=https' --tlsv1.2 \
    'https://registry.npmjs.org/playwright-core/-/playwright-core-1.55.0.tgz' \
    --output "$vnkit_archive.part"
  mv "$vnkit_archive.part" "$vnkit_archive"
fi
python3 - "$vnkit_archive" "$vnkit_tools/playwright" <<'PY'
import hashlib, pathlib, sys, tarfile
archive, target = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
digest = hashlib.sha256(archive.read_bytes()).hexdigest()
if digest != '6b63fdf41725afb924880728d39cf560d770f785a861d18c15611e99dd3172bd':
    raise SystemExit('Pinned browser-tool checksum mismatch; do not execute it')
print('Playwright 1.55.0 tarball SHA-256:', digest)
with tarfile.open(archive) as source:
    for member in source.getmembers():
        path = pathlib.PurePosixPath(member.name)
        if path.is_absolute() or '..' in path.parts or not (member.isfile() or member.isdir()):
            raise SystemExit('Unsafe browser-tool tar member')
    source.extractall(target, filter='data')
PY
PLAYWRIGHT_BROWSERS_PATH="$vnkit_tools/browsers" node "$vnkit_tools/playwright/package/cli.js" install chromium
printf '%s\n' 'Optional browser tools installed privately. Runtime import/reading does not need them.'
