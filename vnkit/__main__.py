from __future__ import annotations
import argparse
import errno
import json
from pathlib import Path
import shutil
import subprocess
import sys
from . import __version__
from . import disc
from .adapters.registry import ADAPTERS, adapter_ids, adapter_spec

ROOT = Path(__file__).resolve().parent.parent


def detected_adapter(source):
    for spec in ADAPTERS:
        adapter = spec.load()
        try:
            identification=adapter.detect(source)
            if identification['supported']:return adapter,identification
        except (ValueError,KeyError,UnicodeError):pass
    return None,{'supported':False,'reason':'No tested edition adapter matched this source'}


def emit(value):
    print(json.dumps(value, ensure_ascii=False, indent=2))


def validate(path):
    path = Path(path).resolve()
    if path.is_dir():
        path /= 'content.json'
    content = json.loads(path.read_text())
    if not isinstance(content, dict):
        raise ValueError('Content must be a JSON object')
    if not isinstance(content.get('assets', {}), dict) or not isinstance(content.get('compatibility', {}), dict):
        raise ValueError('Content assets and compatibility must be JSON objects')
    issues = []
    if content.get('compatibility', {}).get('status') == 'blocked':
        issues.append('This import is BLOCKED: extracted resources are not an executable story port.')
    node = shutil.which('node')
    if not node:
        raise ValueError('Validation needs Node.js 22+. Reading and disc extraction need only Python 3.11+.')
    try:
        result = subprocess.run([node, str(ROOT / 'scripts' / 'validate-content.mjs'), str(path)], capture_output=True, text=True, timeout=60)
    except subprocess.TimeoutExpired as error:
        raise ValueError('Content validator exceeded its 60-second limit') from error
    report = json.loads(result.stdout) if result.stdout else {'errors': [result.stderr.strip()]}
    if not isinstance(report, dict) or not isinstance(report.get('errors'), list):
        raise ValueError('Content validator returned an invalid report')
    if result.returncode and not report['errors']:
        report['errors'].append(f'Content validator failed with exit code {result.returncode}')
    issues += report.get('errors', [])
    for ident, asset in content.get('assets', {}).items():
        from .server import safe_path
        try:
            target = safe_path(path.parent, asset['url'])
            if not target.is_file():
                issues.append(f'Missing resource: {ident} -> {asset["url"]}')
        except (ValueError, KeyError, TypeError) as error:
            issues.append(f'Invalid asset {ident}: {error}')
    return {'valid': not issues, 'gameId': content.get('id'), 'instructions': report.get('scriptValidation',{}).get('instructions',len(content.get('instructions', []))),
            'assets': len(content.get('assets', {})), 'errors': issues,
            'compatibility': content.get('compatibility', {}),
            **({'scriptValidation':report['scriptValidation']} if 'scriptValidation' in report else {})}


def main(argv=None):
    parser = argparse.ArgumentParser(prog='python3 -m vnkit', description='Local VN disc inspection, game-specific import and reader. Originals are never modified.')
    parser.add_argument('--version', action='version', version=__version__)
    commands = parser.add_subparsers(dest='command', required=True)
    inspect = commands.add_parser('inspect', help='Inspect ISO9660 image or extracted disc directory read-only')
    inspect.add_argument('source', type=Path)
    inspect.add_argument('--fingerprint', action='store_true', help='SHA-256 the complete input')
    extract = commands.add_parser('extract', help='Extract disc resources with no-clobber exact-match resume')
    extract.add_argument('source', type=Path)
    extract.add_argument('--out', type=Path, required=True)
    extract.add_argument('--level', choices=['disc', 'archives'], default='disc', help='disc preserves the archive files; archives opens detected game containers')
    imp = commands.add_parser('import', help='Import with a detected/selected edition adapter; incomplete/blocked support exits 3')
    imp.add_argument('source', type=Path)
    imp.add_argument('--adapter', choices=['auto', *adapter_ids(), 'synthetic'], default='auto')
    imp.add_argument('--out', type=Path, required=True)
    imp.add_argument('--work', type=Path, help='Private resumable extraction/media workspace')
    check = commands.add_parser('validate', help='Validate every instruction/reference and reader resource; blocked imports fail')
    check.add_argument('content', type=Path)
    launch = commands.add_parser('serve', help='Launch isolated reader and text publisher; loopback by default')
    launch.add_argument('--library', type=Path, default=ROOT / 'private/library')
    launch.add_argument('--state', type=Path, default=ROOT / 'private/state')
    launch.add_argument('--host', default='127.0.0.1')
    launch.add_argument('--port', type=int, default=8891)
    launch.add_argument('--allow-origin', action='append', default=[], help='Additional exact WebSocket consumer origin, e.g. https://renji-xd.github.io')
    launch.add_argument('--public-origin')
    launch.add_argument('--tls-cert')
    launch.add_argument('--tls-key')
    launch.add_argument('--access-token-file')
    package = commands.add_parser('package', help='Create shareable code-only tarball from an explicit allowlist')
    package.add_argument('--out', type=Path, default=ROOT / 'dist/vnkit-code-0.1.0.tar.gz')
    args = parser.parse_args(argv)
    try:
        if args.command == 'inspect':
            report = disc.inspect(args.source, fingerprint=args.fingerprint)
            adapter,identification=detected_adapter(args.source)
            report['identification'] = identification
            if identification['supported']:
                report['archives'] = adapter.inspect(args.source)['archives']
            emit(report)
        elif args.command == 'extract':
            if args.level == 'archives':
                adapter,identification=detected_adapter(args.source)
                if not identification['supported']:
                    raise ValueError('No supported archive adapter detected; use --level disc for ISO files')
                emit(adapter.extract(args.source, args.out))
            else:
                emit(disc.extract(args.source, args.out))
        elif args.command == 'import':
            if args.adapter == 'synthetic':
                if args.source.resolve() != (ROOT / 'fixtures/synthetic').resolve():
                    raise ValueError('The synthetic adapter only imports the bundled original test fixture.')
                records = []
                for file in sorted(args.source.rglob('*')):
                    if file.is_file():
                        records.append(disc.write_stream(args.out, str(file.relative_to(args.source)), iter_file(file)))
                emit({'status': 'synthetic-fixture', 'files': len(records), 'warning': 'This is not a conversion of a commercial game.'})
            else:
                adapter,identification=detected_adapter(args.source)
                if not adapter:raise ValueError(identification['reason'])
                if args.adapter!='auto' and args.adapter!=adapter.ADAPTER_ID:raise ValueError('Selected adapter does not match this disc edition')
                spec = adapter_spec(adapter.ADAPTER_ID)
                if spec is None:
                    raise ValueError(f'Adapter is not registered: {adapter.ADAPTER_ID}')
                result = spec.import_game(args.source, args.out, args.work)
                emit(result)
                if result.get('status') in ('blocked', 'incomplete-runtime') or result.get('compatibility', {}).get('status') == 'blocked':
                    return 3
        elif args.command == 'validate':
            report = validate(args.content)
            emit(report)
            return 0 if report['valid'] else 3
        elif args.command == 'serve':
            from .server import serve
            serve(args.library, args.state, args.host, args.port, args.allow_origin, args.public_origin,
                  args.tls_cert, args.tls_key, args.access_token_file)
        elif args.command == 'package':
            from .package import build
            emit(build(args.out))
        return 0
    except (OSError, ValueError, KeyError, TypeError, RecursionError, subprocess.SubprocessError) as error:
        if args.command == 'serve' and isinstance(error, OSError) and error.errno == errno.EADDRINUSE:
            host = {'0.0.0.0': '127.0.0.1', '::': '::1'}.get(args.host, args.host)
            url_host = f'[{host}]' if ':' in host else host
            url = args.public_origin or f'{"https" if args.tls_cert else "http"}://{url_host}:{args.port}'
            print(f'vnkit: Cannot listen on {args.host}:{args.port}: address already in use.\n'
                  f'An existing VN reader may already be running; if so, open {url.rstrip("/")}/\n'
                  'If another service owns this port, choose a free --port. No running process was stopped.',
                  file=sys.stderr)
            return 2
        print(f'vnkit: {error}', file=sys.stderr)
        return 2


def iter_file(path):
    with path.open('rb') as stream:
        yield from iter(lambda: stream.read(1024 * 1024), b'')


if __name__ == '__main__':
    sys.exit(main())
