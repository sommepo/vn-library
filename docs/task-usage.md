# Task usage log

`task-usage.csv` in the project root records work from the Never7 investigation
onward. Open it in a spreadsheet. It stays local and is not in release packages.
Historical tasks have not been assigned guessed counts.

The recorder reads this task's local Codex log. It subtracts the last cumulative
token counters before a matching user request from the latest recorded counters.
It also records the model ID and reasoning effort from the log, not a guess from
the app's name. If several models occur, all are listed.

Input includes context sent again on later requests. Cached input is a subset of
input, and reasoning output is a subset of output. Do not add these columns twice.
`total_tokens` includes cached input; `uncached_input_tokens` is listed separately
so repeated context does not look like new generated text. These are usage counts,
not a price or remaining allowance. Compaction overhead may be included in the
local cumulative counters. This records the current task only, not other tasks.

`measured_through` is a UTC timestamp. The final reply and any work after that
timestamp are excluded until the row is refreshed on the next turn. A missing
baseline or a counter reset leaves counts blank. Partial work is labelled partial;
finishing an investigation does not mean finishing the game port.

```sh
python3 scripts/record-task-usage.py \
  --match 'OK try with the Never 7 ISO' \
  --id never7-initial-trial --task 'Never7 PS2 import and reuse trial' \
  --status in_progress --outcome 'Investigating disc and parser compatibility'
```

Running the same task ID updates its row. Use a new ID for each later task, and a
distinctive phrase from its first user request. `--rollout /path/to/rollout.jsonl`
works outside Codex. Raw conversations, paths and credentials are not exported.
To finalise an earlier row after another task begins, supply `--until 'distinctive
phrase from the next task request'`. Otherwise the snapshot includes all work
since the start, including subsequent requests in this conversation.
If work later uses subagents, record their logs separately: the parent log is not
assumed to include their usage. No subagents were used for the Never7 trial.

For a new continuation milestone started by a repeated short message, use
`--match 'Continue' --exact --last-match` with a new task ID. This selects the
latest complete matching message and its own counter baseline. Do not combine
`--last-match` with `--until`. Record the prior milestone with `--until` first;
otherwise later work would be counted twice across rows.
