#!/usr/bin/env python3
"""Write task token deltas from a local Codex rollout to a browseable CSV.

Read-only access to one explicitly selected task log; no prompt text is exported.
The snapshot excludes output produced after its last token-count event.
"""
import argparse
import csv
import json
import os
from pathlib import Path
import tempfile

FIELDS = ['task_id', 'task', 'started_at', 'measured_through', 'status', 'model',
          'reasoning_effort', 'input_tokens', 'cached_input_tokens',
          'uncached_input_tokens', 'output_tokens', 'reasoning_output_tokens',
          'total_tokens', 'measurement', 'outcome']
COUNTERS = ['input_tokens', 'cached_input_tokens', 'output_tokens',
            'reasoning_output_tokens', 'total_tokens']


def measure(path, match, until=None, *, exact=False, last=False):
    if last and until:
        raise ValueError('--last-match cannot be combined with --until')
    usage = None; baseline = None; started = None; timestamp = None
    model = ''; effort = ''; models = set(); efforts = set()
    resets = False
    with Path(path).open(encoding='utf-8') as stream:
        for line in stream:
            row = json.loads(line); payload = row.get('payload', {})
            kind = row.get('type')
            if kind == 'turn_context':
                model = payload.get('model', model)
                effort = payload.get('effort', effort)
            if kind == 'response_item' and payload.get('type') == 'message' and payload.get('role') == 'user':
                text = '\n'.join(c.get('text', '') for c in payload.get('content', []) if isinstance(c, dict))
                if started and until and until in text:
                    break
                matches = text.strip() == match if exact else match in text
                if matches and (not started or last):
                    started = row['timestamp']; baseline = usage.copy() if usage else None
                    models.clear(); efforts.clear(); resets = False
            if kind == 'event_msg' and payload.get('type') == 'token_count':
                info = payload.get('info') or {}
                current = info.get('total_token_usage')
                if current is None: continue
                if started:
                    if model: models.add(model)
                    if effort: efforts.add(effort)
                if started and usage and any(current.get(k, 0) < usage.get(k, 0) for k in COUNTERS):
                    resets = True
                usage = current; timestamp = row['timestamp']
    if not started: raise ValueError('No user message matches --match in this rollout')
    available = baseline is not None and usage is not None and not resets and timestamp >= started
    result = {'started_at': started, 'measured_through': timestamp or '',
              'model': '; '.join(sorted(models)), 'reasoning_effort': '; '.join(sorted(efforts)),
              'measurement': ('local cumulative counter delta; through last recorded event; excludes later output'
                              if available else 'unavailable: missing baseline/latest count or counter reset')}
    result.update({k: usage.get(k, 0)-baseline.get(k, 0) if available else '' for k in COUNTERS})
    result['uncached_input_tokens'] = result['input_tokens']-result['cached_input_tokens'] if available else ''
    return result


def save_row(path, row):
    path = Path(path); records = []
    if path.exists():
        with path.open(newline='', encoding='utf-8') as stream:
            reader = csv.DictReader(stream)
            if reader.fieldnames != FIELDS: raise ValueError('CSV schema differs; refusing to overwrite')
            records = list(reader)
    matches = [i for i, r in enumerate(records) if r['task_id'] == row['task_id']]
    if len(matches) > 1: raise ValueError('Duplicate task ID in CSV')
    if matches: records[matches[0]] = row
    else: records.append(row)
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode='w', newline='', encoding='utf-8',
                                     dir=path.parent, delete=False) as tmp:
        try:
            writer = csv.DictWriter(tmp, fieldnames=FIELDS)
            writer.writeheader(); writer.writerows(records); tmp.close()
            os.replace(tmp.name, path)
        finally:
            Path(tmp.name).unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--rollout', type=Path, help='Explicit local JSONL; otherwise find current CODEX_THREAD_ID')
    parser.add_argument('--match', required=True, help='Distinctive text from the task-start user message')
    parser.add_argument('--exact', action='store_true', help='Match the complete user message, ignoring surrounding whitespace')
    parser.add_argument('--last-match', action='store_true', help='Use the most recent matching request (for repeated Continue messages)')
    parser.add_argument('--until', help='Stop before a later user request when finalising an earlier task')
    parser.add_argument('--id', required=True)
    parser.add_argument('--task', required=True)
    parser.add_argument('--status', choices=['in_progress', 'completed', 'partial', 'blocked'], required=True)
    parser.add_argument('--outcome', default='')
    parser.add_argument('--out', type=Path, default=Path('task-usage.csv'))
    args = parser.parse_args()
    try:
        if not args.rollout:
            ident = os.environ.get('CODEX_THREAD_ID', '')
            if not ident or any(c not in '0123456789abcdef-' for c in ident):
                raise ValueError('Supply --rollout outside a Codex task')
            root = Path(os.environ.get('CODEX_HOME', Path.home()/'.codex'))/'sessions'
            paths = list(root.glob(f'**/*-{ident}.jsonl'))
            if len(paths) != 1: raise ValueError('Cannot uniquely locate this task log; supply --rollout')
            args.rollout = paths[0]
        row = measure(args.rollout, args.match, args.until, exact=args.exact, last=args.last_match)
        row.update(task_id=args.id, task=args.task, status=args.status, outcome=args.outcome)
        save_row(args.out, row)
        print(json.dumps(row, indent=2))
    except (OSError, ValueError, TypeError, KeyError) as error:
        parser.exit(2, f'Usage recording: {error}\n')


if __name__ == '__main__': main()
