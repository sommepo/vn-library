# Contributor workflow for people and coding agents

Anyone may contribute to VN Library: manually, with a coding agent, or with a mix of both. No particular AI product, account or skill is required. You remain responsible for reviewing a proposed change, its provenance and its tests before opening a pull request.

## Choose a scope

Ordinary documentation, tests, bug fixes, accessibility, reader UI, packaging and safe-parser improvements can go straight to a focused pull request. Open an issue first when the change would alter a shared reader contract, add a large new dependency, or change security-sensitive file/network handling.

Any lawful PS2 ISO may be the subject of a new-game proposal. That invitation is to investigate its **exact edition**, not a promise that every PS2 ISO already imports or can become playable with a small patch. Use the three contribution levels in [CONTRIBUTING.md](../CONTRIBUTING.md): fingerprint/research, static recovery, or a playable adapter. Propose the last level before building it.

You do not need a game disc for ordinary work or public tests. If you own a disc, keep it and every derived file private; [adapter contributions](adapter-contributions.md) defines the public-safe evidence that belongs in an issue or PR.

## Get ready

1. Read the [README](../README.md) and [CONTRIBUTING.md](../CONTRIBUTING.md).
2. For an adapter or ISO change, read [adapter contributions](adapter-contributions.md) and the [adapter guide](adapters.md). Check the relevant existing engine fingerprints before assuming a new format.
3. Make one focused change with public, synthetic regression coverage. Do not add game content, extracted data, saves, screenshots or private reports.
4. Run the public checks:

   ```sh
   python3 -m unittest discover -s tests -p 'test_*.py' -v
   node --test tests/reader*.mjs tests/clannad-vm.test.mjs tests/remember11-vm.test.mjs
   python3 -m vnkit validate fixtures/synthetic
   ```

5. Complete the pull-request template honestly, including remaining limits and the commands actually run. The repository's pull-request workflow runs the same public checks without a commercial disc.

## Working with an AI agent

If your agent supports repository instructions, ask it to read `AGENTS.md` first. Every agent can instead follow this portable order: README, CONTRIBUTING, this guide, then the adapter documents relevant to the task. Do not give an agent an ISO, extracted assets, private save data or credentials merely to make a PR.

You can start an agent with this prompt:

```text
Work on <issue or concise goal> in VN Library. Read README.md, CONTRIBUTING.md
and docs/contributor-workflow.md. For any adapter or PS2 ISO work, also read
docs/adapter-contributions.md and docs/adapters.md. Keep game content and all
derived/private data out of the repository. Use bounded, fail-closed parsing,
add public synthetic tests, run the documented checks, and report unsupported
behaviour rather than guessing it.
```

Review the diff yourself before submitting it. In particular, check that an agent did not broaden edition detection, turn an unknown state-changing command into a no-op, add a hidden data download, or label a recovery-only adapter as playable.

## When a PR is ready

A good PR is small enough to review, explains what changed and what did not, and does not require maintainers to possess the contributor's disc. Static recovery is useful when it clearly exits as incomplete and stays out of browser import. Playable support needs exact-edition evidence, source-driven execution, private validation summaries and explicit remaining fidelity limits.

Questions and proposals belong in an issue; use the new-game form for a PS2 edition. The project welcomes improvements at every layer, but merges support claims only at the level the evidence demonstrates.
