# Remote access

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
