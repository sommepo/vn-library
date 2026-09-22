# Contributing an edition-specific adapter

This guide turns the [adapter development guide](adapters.md) into a contribution contract. It applies to game-specific work only; ordinary reader, documentation and test improvements do not need a new-game proposal.

## Agree the scope first

Open a new-game proposal before implementing a playable adapter. State the exact platform, region, disc serial and version; a title name, archive filename, publisher or claimed engine family is not enough. The proposal should identify the intended support level:

| Level | May be merged when | User-visible result |
| --- | --- | --- |
| Fingerprint/research | It records reproducible, lawful, non-content evidence and a bounded reuse hypothesis | Not an adapter claim |
| Static recovery | Detection/extraction is safe, edition-gated and tested with synthetic malformed-input cases | Blocked/incomplete; never browser-playable |
| Playable adapter | The reader can follow source control flow, preserve state and expose its remaining fidelity limits | Eligible for browser import only after explicit review |

Static recovery is a valid result. Do not flatten recovered strings into an invented story, guess unsupported state changes, or make the GUI advertise a title merely because its files extract.

## Evidence, privacy and provenance

Inspect only a copy you are authorised to use. Keep all original files and derived data outside the repository. Never include in an issue, PR, commit, release, test fixture or external diagnostic:

- disc images, executables, archives, raw scripts, text, images, audio or video;
- saves, reading history, route traces, private reports or screenshots;
- links to downloads of any of the above.

Public evidence may state the exact edition, hashes, file/container signatures, field widths, offsets, command names, aggregate counts, command lines and failures. It must distinguish **confirmed**, **probable** and **unknown** reuse. Follow the shared-engine investigation in [adapters.md](adapters.md#shared-engine-investigation) and record the licence, revision and reuse layer for upstream work. Update [provenance.md](provenance.md) before merging copied or adapted code, or adding a distributed dependency.

## Implementation requirements

An adapter is edition-specific and supplies `detect`, `inspect`, `extract` and `import_game` as described in [adapters.md](adapters.md#small-interface).

- Detection must check internal, edition-specific evidence and reject every untested revision. Never add a broad publisher, filename or engine-family fallback.
- Use `Source`, `IsoImage` and the safe writers. Bound every allocation, offset and extent; reject traversal, symlinks, malformed tables and changed outputs.
- Preserve original ordering, byte identities and source locations. Use source control flow rather than sorting strings or filenames.
- The reader must fail closed on unknown state/control instructions. It may name nonessential presentation degradation, but it may not bypass a state change to continue text.
- Keep edition-specific filenames, opcodes, mappings and native behaviour in adapter modules, not the generic reader.

## Registering an adapter

Add one `AdapterSpec` to [vnkit/adapters/registry.py](../vnkit/adapters/registry.py). That registration is the sole source for CLI detection/selection and browser import eligibility. It records the adapter module and, where needed, a dedicated importer module.

Leave `gui_game_id` unset for fingerprint and static-recovery work. Set it only when maintainers have accepted the title as playable in the browser flow. A GUI record must also state its user setup guide, allowed incomplete-validation notices and any special tool preflight profile; none is permission to hide new validation errors.

Do not add a second hand-maintained adapter list in CLI, import-job or UI code. Add a synthetic registry test that proves the module's `ADAPTER_ID`, GUI status and game ID are correct.

## Tests and validation evidence

Every adapter PR needs original, public synthetic tests for its detection, corrupt/truncated input and relevant control-flow or decoder boundaries. Run:

```sh
python3 -m unittest discover -s tests -p 'test_*.py' -v
node --test tests/reader*.mjs tests/clannad-vm.test.mjs tests/remember11-vm.test.mjs
python3 -m vnkit validate fixtures/synthetic
```

For static recovery, document the private owned-media audit command and its aggregate outcome. For a playable adapter, also validate all discoverable scripts/references and privately test at least 100 successive presented segments, choices, save/restore and media boundaries. Name every unverified route, device, native feature or original-engine comparison. Do not attach the private output.

## Documentation expected in a PR

Update the public support table in [adapters.md](adapters.md), add an edition-specific fingerprint/format note, and document the import and fidelity boundary. Update provenance when applicable. External contributors should not edit local handoffs, task-usage files or workspace-specific `AGENTS.md` policy; maintainers will handle those separately.
