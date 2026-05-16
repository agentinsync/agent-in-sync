#!/usr/bin/env python3
"""
Update a specific row in results.csv with benchmark data.
Uses file locking to prevent race conditions during parallel runs.

Usage:
  python3 benchmark/update-csv.py \
    --bug P1 --condition without_ais --run 1 \
    --input-tokens 45231 --output-tokens 3412 \
    --cost 0.0823 --tool-calls 18 --wall-clock 142 \
    --correct yes

  python3 benchmark/update-csv.py \
    --bug P1 --condition without_ais --run 1 \
    --submitted-issue-id abc123-... \
    --notes "agent used grep extensively"
"""

import argparse
import csv
import fcntl
import os
import sys
import tempfile


def parse_args():
    p = argparse.ArgumentParser(description='Update a row in results.csv')
    p.add_argument('--csv', default='benchmark/results.csv', help='Path to results.csv')
    p.add_argument('--bug', required=True, help='Bug ID (e.g. P1, C2, MS1)')
    p.add_argument('--condition', required=True, choices=['without_ais', 'with_ais'])
    p.add_argument('--run', required=True, type=int, help='Run number (1, 2, or 3)')
    p.add_argument('--input-tokens', type=int)
    p.add_argument('--output-tokens', type=int)
    p.add_argument('--cost', type=float, help='Total cost in USD')
    p.add_argument('--tool-calls', type=int)
    p.add_argument('--wall-clock', type=int, help='Wall-clock seconds')
    p.add_argument('--correct', choices=['yes', 'no'])
    p.add_argument('--searched-ais', choices=['yes', 'no'])
    p.add_argument('--found-solution', choices=['yes', 'no'])
    p.add_argument('--submitted-issue-id', help='UUID returned by submit_after_solving')
    p.add_argument('--notes', help='Free-form notes')
    p.add_argument('--timestamp', help='ISO-8601 UTC timestamp of the run (e.g. 2026-02-27T09:00:00Z)')
    return p.parse_args()


FIELD_MAP = {
    'input_tokens': 'input-tokens',
    'output_tokens': 'output-tokens',
    'total_cost_usd': 'cost',
    'tool_calls': 'tool-calls',
    'wall_clock_s': 'wall-clock',
    'correct': 'correct',
    'searched_ais': 'searched-ais',
    'found_solution': 'found-solution',
    'submitted_issue_id': 'submitted-issue-id',
    'notes': 'notes',
    'timestamp': 'timestamp',
}


def main():
    args = parse_args()

    if not os.path.exists(args.csv):
        print(f'Error: {args.csv} not found', file=sys.stderr)
        sys.exit(1)

    # Build update dict from non-None args
    updates: dict[str, str] = {}
    for csv_field, arg_name in FIELD_MAP.items():
        attr = arg_name.replace('-', '_')
        val = getattr(args, attr, None)
        if val is not None:
            updates[csv_field] = str(val)

    if not updates:
        print('No fields to update. Exiting.', file=sys.stderr)
        sys.exit(1)

    lock_path = args.csv + '.lock'
    with open(lock_path, 'w') as lock_file:
        fcntl.flock(lock_file, fcntl.LOCK_EX)

        rows = []
        matched = False
        fieldnames: list[str] = []

        with open(args.csv, newline='') as f:
            reader = csv.DictReader(f)
            fieldnames = list(reader.fieldnames or [])
            for row in reader:
                if (row['bug_id'] == args.bug
                        and row['condition'] == args.condition
                        and row['run'] == str(args.run)):
                    row.update(updates)
                    matched = True
                rows.append(row)

        if not matched:
            print(
                f'Warning: no row found for bug={args.bug} condition={args.condition} run={args.run}',
                file=sys.stderr,
            )
            sys.exit(1)

        # Write atomically via temp file
        dir_ = os.path.dirname(os.path.abspath(args.csv))
        with tempfile.NamedTemporaryFile('w', dir=dir_, delete=False, newline='', suffix='.tmp') as tf:
            writer = csv.DictWriter(tf, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(rows)
            tmp_path = tf.name

        os.replace(tmp_path, args.csv)
        # Lock released when lock_file is closed (exiting with block)

    print(f'Updated {args.bug}/{args.condition}/run{args.run} in {args.csv}')


if __name__ == '__main__':
    main()
