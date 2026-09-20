# DupinAnalyzer - Configuration Guide

## What is this?

DupinAnalyzer scans one or more log files against a set of rules defined in a
JSON config file. Each rule is a regular expression pattern with named capture
groups. Every line in every log file that matches a rule's pattern becomes a
row in that rule's result category, shown as a table in the Results tab.

## Why?

Instead of hardcoding "what to look for" in the app, you describe it in a
config file. This lets you point DupinAnalyzer at completely different kinds
of logs (auth logs, network logs, application logs, whatever) just by
swapping the config, no code changes required.

## How to use it

1. Open Control Panel.
2. Pick a Log Directory (the folder containing the log files to scan).
3. Pick a Configuration file (a `.json` file following the format below).
4. Click Start Analysis.
5. Matches show up per category in the Results tab, with per-column stats
   (`Unique <COLUMN>`) and a full Analyzed Logs view.
6. Optionally set a Telegram ID and use Get Report to send the matched log
   files to a Telegram bot as an archive.

## Config format

The config is a JSON array of rule objects. Here is a short example, built
for a simple web server access log:

```json
[
  {
    "name": "request",
    "pattern": "\\[(\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2})\\] INFO Request from (\\d+\\.\\d+\\.\\d+\\.\\d+) to (\\S+)",
    "groups": ["!time", "ip", "path"],
    "color": "#3B82F6"
  },
  {
    "name": "!failed_login",
    "pattern": "\\[(\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2})\\] ERROR Failed login for (\\w+) from (\\d+\\.\\d+\\.\\d+\\.\\d+)",
    "groups": ["!time", "username", "ip"],
    "color": "#EF4444"
  }
]
```

This config expects log lines like:

```
[2024-01-15 10:23:45] INFO Request from 192.168.1.10 to /api/login
[2024-01-15 10:24:01] ERROR Failed login for admin from 192.168.1.10
```

### Fields

| Field     | Type       | Description                                                                 |
|-----------|-----------|-------------------------------------------------------------------------------|
| `name`    | `string`   | Category name. Shown as a card header in Results, and as an option in the category filter dropdown. |
| `pattern` | `string`   | A regular expression (Rust `regex` syntax). Capture groups (`(...)`) become table columns, in order. |
| `groups`  | `string[]` | Column names for each capture group in `pattern`, in the same order. Must have exactly one entry per capture group. |
| `color`   | `string`   | Hex color (`#RRGGBB`) used as the category's accent color (dot, border, badge). |

Every matched line becomes one row, with one value per group, tagged with the
source log file (`fileId`) and shown in a `VirtualizedTable` under that
category.

## The `!` prefix

You can prefix either a rule's `name` or one of its `groups` with `!`. It
never changes what gets matched, it only changes what gets displayed or
exported. The `!` itself is stripped from the UI, it's purely a marker in the
config.

### `!` on a category `name`: excluded from Get Report

```json
{
  "name": "!failed_login",
  "pattern": "\\[(\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2})\\] ERROR Failed login for (\\w+) from (\\d+\\.\\d+\\.\\d+\\.\\d+)",
  "groups": ["!time", "username", "ip"],
  "color": "#EF4444"
}
```

- The category still matches, still shows up in Results, still counts toward
  its own match count.
- But log files that only matched this category (and no other, non `!`
  category) are excluded from:
  - The Get Report button (both its count and the files it actually sends).
  - It does not affect the "ANALYZED LOGS" total in the stats summary, that
    number always counts every file that matched any category, `!` or not.

Use this when a rule is useful for on screen inspection (e.g. failed login
attempts) but shouldn't by itself justify pulling a log file into the
Telegram report, for example noisy or low signal matches.

If a log file matches both an excluded (`!`) category and a normal one, it's
not excluded. Get Report only skips files whose only matches came from `!`
prefixed categories.

### `!` on a `groups` entry: excluded from the stats summary

```json
{
  "name": "request",
  "pattern": "\\[(\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2})\\] INFO Request from (\\d+\\.\\d+\\.\\d+\\.\\d+) to (\\S+)",
  "groups": ["!time", "ip", "path"],
  "color": "#3B82F6"
}
```

- The column still appears in the results table for that category (e.g. you
  will still see the `time` value in each row).
- But it's excluded from the `statsSummary` block at the top of the Results
  tab, no `Unique TIME` stat card is generated for it.
- This is meant for columns that are technically useful data (timestamps,
  ports, line numbers, etc.) but not meaningful to summarize as "how many
  unique values did we see", for example a timestamp is basically always
  unique, so counting it adds noise rather than signal.

## Walkthrough of the example

With the config above:

- `request` is a normal category. Its `ip` and `path` columns each get a
  `Unique IP` / `Unique PATH` stat card. Its `time` column is hidden from
  stats (but still shown in the table). Files matching `request` count
  toward Get Report.
- `!failed_login` is displayed as `FAILED_LOGIN` in the UI (the `!` is
  stripped). Its `username` and `ip` columns get stat cards, `time` does
  not. Files matched only by this category are left out of Get Report, but
  if the same file also matched `request`, it's still included.

## Quick reference

| Prefix location       | Effect                                                                        | Still shown in Results? | Still counted in "ANALYZED LOGS"? |
|------------------------|--------------------------------------------------------------------------------|:---:|:---:|
| `!` on `name`          | File excluded from Get Report (unless it also matched a normal category)      | Yes | Yes |
| `!` on a `groups` item  | Column excluded from the `statsSummary` stat cards                            | Yes (in table) | n/a |
| No `!`                  | Default behavior, included everywhere                                        | Yes | Yes |
