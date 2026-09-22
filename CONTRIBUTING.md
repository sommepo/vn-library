# Contributing to VN Library

Thank you for helping improve VN Library. We welcome contributions to the reader, safe disc handling, documentation and edition-specific adapters, whether you work by hand or with a coding agent of your choice. Start with the [contributor workflow](docs/contributor-workflow.md); it has a tool-neutral quick start and does not require a game disc for ordinary work.

Any lawful PS2 ISO can be proposed for investigation. Start with a [new-game proposal](.github/ISSUE_TEMPLATE/new-game-proposal.yml) before writing a playable-game adapter: an exact release can require substantial format and runtime work, and a familiar title, publisher or engine label is not enough to establish compatibility.

## Contributions involving a game

Use one of these scopes in the proposal and PR:

1. **Fingerprint or research:** document an exact platform/edition and evidence for a possible shared layer. This does not claim that the title is importable.
2. **Static recovery:** add bounded, fail-closed detection or extraction. It may return a blocked/incomplete result, but it must not be presented as playable or enabled in the browser's Add game flow.
3. **Playable adapter:** add source-driven execution and presentation through the shared reader. This needs maintainer agreement before implementation and stronger private validation evidence.

Read [the adapter contribution guide](docs/adapter-contributions.md) before opening a game-related issue. It defines the safety, privacy, testing and registration requirements. The existing [adapter guide](docs/adapters.md) remains the format and reader contract reference. Documentation, test and focused reader/tooling PRs do not require a proposal unless they change a shared contract, a large dependency, or security-sensitive file/network handling.

## Privacy, licence and safety rules

- Use only media you are entitled to inspect. Do not upload, commit, link to, or request ISOs, extracted scripts, text, artwork, audio, saves, screenshots, route traces or private validation reports.
- Keep tests self-contained and synthetic. A PR may report aggregate counts, hashes, offsets and commands run against an owned copy, but not recovered game material.
- Do not run game executables or installers to identify a format. Parsers must use bounded reads, reject unsafe paths and preserve input files. Unknown state-changing instructions must stop at their source location.
- Check the licence and provenance of every upstream reference or implementation. Update [provenance](docs/provenance.md) when code or a distributed dependency is adopted. Publicly visible code is not automatically reusable.

By submitting a contribution, you license your original contribution under this repository's [MIT License](LICENSE).

## Local checks

Python 3.11+ and Node.js 22+ are the baseline development runtimes. Before a PR, run the checks relevant to the files you changed; this is the minimum public suite:

```sh
python3 -m unittest discover -s tests -p 'test_*.py' -v
node --test tests/reader*.mjs tests/clannad-vm.test.mjs tests/remember11-vm.test.mjs
python3 -m vnkit validate fixtures/synthetic
```

Browser and real-disc checks are additional evidence, not substitutes for these tests. Run browser tests with a temporary server and browser profile. Do not run Wine on a shared development host; Windows installation/import tests belong on a Windows device or a constrained VM.

## Pull requests

Keep a PR focused and describe its support level honestly. Include the exact edition tested, the public synthetic tests added, commands run and any remaining unverified behaviour. A static-recovery PR is useful when it labels its limits; it is not expected to invent a linear story or bypass unresolved controls.

Use the pull-request checklist. The public CI runs the same no-disc checks. Maintainers own local operational handoffs and task accounting, so external contributors do not need to update workspace-specific instructions or private status records.
