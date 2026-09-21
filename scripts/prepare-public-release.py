#!/usr/bin/env python3
"""Stage only allowlisted public files; never copy the working folder or Git history."""
import argparse,hashlib,json,re,sys,tarfile,tempfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vnkit.package import build

def main():
 p=argparse.ArgumentParser();p.add_argument('--out',type=Path,required=True);a=p.parse_args()
 if a.out.exists():raise SystemExit('Use a fresh staging directory')
 a.out.mkdir(parents=True)
 with tempfile.TemporaryDirectory() as tmp:
  source=Path(tmp)/'source.tar.gz';build(source)
  with tarfile.open(source) as archive:
   for m in archive.getmembers():
    if not m.isfile():continue
    rel=Path(m.name).relative_to('vnkit')
    if '..' in rel.parts or rel.is_absolute():raise ValueError('Unsafe package member')
    if str(rel)=='PACKAGE-MANIFEST.json':continue
    data=archive.extractfile(m).read()
    if rel.suffix in {'.md','.txt','.py','.mjs','.js','.json','.yaml','.ps1','.cs','.sh','.html','.css'}:
     s=data.decode('utf-8')
     s=s.replace('user@your-server.your-tailnet.ts.net','user@your-server.your-tailnet.ts.net').replace('your-server.your-tailnet.ts.net','your-server.your-tailnet.ts.net').replace('/path/to/vn-library','/path/to/vn-library').replace('/home/user','/home/user').replace('the development host','the development host').replace('on the development host, user jack','on the development host')
     if str(rel) in ('docs/next-session.md','docs/pia-handoff-paused.md','docs/github-release-draft.md'):
      s='# Development notes\n\nLocal session notes are excluded from the public release. See [README](../README.md),\n[adapter guide](adapters.md) and [compatibility notes](compatibility.md).\n'
     data=s.encode()
    target=a.out/rel;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
 # Generic setup, not a copy of the owner's deployment configuration.
 (a.out/'docs/remote-access.md').write_text('''# Remote access

Run VN Library on a computer that stays on while you read. For private access,
install Tailscale on that host and each reading device. Use Tailscale Serve,
not Funnel. Check existing Serve routes before making changes.

Replace the hostname below with your own Tailscale hostname:

```sh
python3 -m vnkit serve --port 8891 --public-origin https://your-server.your-tailnet.ts.net:8891
tailscale serve --bg --https=8891 http://127.0.0.1:8891
```

Use that HTTPS address on each device. Keep the backend on loopback. Do not open
router ports. A running Windows tray host already occupies its configured port;
stop it before starting an alternative CLI host. The Windows tray currently has
no public-origin field, so remote-host setup uses the CLI above.

For local access, open http://127.0.0.1:8891/. For SSH forwarding:

```sh
ssh -N -L 8891:127.0.0.1:8891 user@your-server
```

Browser-local saves belong to the address used. Export them before changing
addresses, or select shared saves on the same host for cross-device use.
''')
 # Do not ship a home-server operational policy as public project instructions.
 agents=a.out/'AGENTS.md';s=agents.read_text();start=s.index('The reader now runs as the isolated');end=s.index('\n## Completed-route',start)
 s=s[:start]+'''For local development use an isolated loopback server and temporary browser
profile. See docs/remote-access.md for optional private remote access. Never
change unrelated services or existing Tailscale routes.
'''+s[end:];agents.write_text(s)
 manifest={str(p.relative_to(a.out)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(a.out.rglob('*')) if p.is_file()}
 (a.out/'PACKAGE-MANIFEST.json').write_text(json.dumps(manifest,indent=2)+'\n')
 print(json.dumps({'staged':str(a.out),'files':len(manifest)}))
if __name__=='__main__':main()
