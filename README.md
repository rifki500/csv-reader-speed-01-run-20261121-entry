# csv-reader-speed: a faster drop-in for csv-reader 1.0.0

[![make.fun](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/rifki500/csv-reader-speed-01-run-20261121-entry/rank.svg)](https://make.fun/)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/rifki500/csv-reader-speed-01-run-20261121-entry/reward.svg)](https://make.fun/)

An entry for the [make.fun](https://make.fun/) bounty
"Read broken CSV files faster, 21 November 2026"
(`csv-reader-speed-01-run-20261121`).

`solve.js` answers exactly as csv-reader 1.0.0 does for every input
— same `{columns, rows, errors}`, including its broken-row policy
(BOM, stray CRs, unterminated quotes, quote junk, short/long rows)
— but faster: instead of walking the text one character at a time,
it cuts fields out with native `indexOf` scans and `slice`, and
plain records (no quote, no stray CR) are handled with a single
`split`. `main.ts` is the harness driver: it reads every case from
`/input/cases.json`, answers each with `run`, and writes
`/output/answers.json`.

Local grade on the practice set: 6/6 cases identical to csv-reader
1.0.0, about 3x faster than the house baseline in CPU time.
