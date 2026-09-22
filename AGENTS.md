# VN Library development guide

This repository welcomes contributors working by hand or with any coding agent.
Read `README.md`, `CONTRIBUTING.md`, and `docs/contributor-workflow.md` before
changing code. For PS2/adapter work also read `docs/adapter-contributions.md` and
`docs/adapters.md`.

## Contribution boundaries

- Any lawful PS2 ISO may be investigated as an exact edition. It is never
  presumed importable or playable because of its platform, publisher, filenames
  or an engine label.
- Never commit, upload, request or link to game discs, executables, scripts,
  text, media, saves, screenshots, traces or private reports.
- Inspect formats with bounded, read-only parsers. Preserve input, reject unsafe
  paths and out-of-bounds data, use no-clobber writes, and fail closed with a
  source location on unknown state or control behavior.
- Do not run an installer or disc executable for identification. Do not use Wine
  on a shared host; native Windows tests require Windows hardware or a constrained
  VM.

## Workflow

- Focused documentation, test, accessibility, reader, safety and tooling pull
  requests are welcome without a game disc.
- Use the new-game issue form before a playable adapter. Static recovery is
  useful but must remain outside browser import.
- Register each exact adapter once in `vnkit/adapters/registry.py`; the registry
  governs CLI selection and browser eligibility.
- Add public synthetic regression tests, run the documented Python, Node and
  fixture checks, and report limitations honestly. Public CI needs no commercial
  game data.
