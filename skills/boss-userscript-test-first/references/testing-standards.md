# Testing Standards

Validate the smallest useful set of checks for the changed layer, then report exactly what ran.

## Baseline rule

For any non-trivial task, add or update tests before production code.

If the repository has no test harness yet, use this order:

1. Choose the lightest suitable test runner.
2. Add repeatable scripts such as `npm test`, `test:unit`, or `test:dom`.
3. Write the first failing or missing-coverage test.
4. Change the production code only after that baseline exists.

Prefer Vitest plus `jsdom` when dependency changes are allowed. Use a lighter fallback only if the environment blocks new dependencies.

## High-value targets by file

### `src/config.js`

Cover:

- config merge behavior
- school text parsing into `targetSchools`
- `matchSchool`
- label counts
- record shaping and truncation
- daily and hourly limit calculations

### `src/filter.js`

Cover:

- API payload normalization from saved response fixtures
- deduplication by `geekId` or `encryptGeekId`
- DOM extraction from saved HTML fixtures
- label injection and defensive selector fallback
- safe behavior when expected nodes are missing

When `filter.js` is too side-effect-heavy, extract pure helpers first and test those helpers before touching the larger flow.

### `src/greeting.js`

Cover:

- greeting template rendering
- button and input lookup fallback
- safe handling when send controls are missing
- extracted target-selection or stop-condition helpers

Use DOM tests for message-box and send-button behavior. Use unit tests for template and decision logic.

### `src/anti-detect.js`

Cover:

- failure counting
- breaker trigger and reset
- `safetyCheck` outcomes for session expiry, VIP limits, captcha, work hours, and hidden tabs

Make time, document visibility, and page location easy to stub before changing them.

### `src/ui/*`

Cover:

- basic render smoke tests
- stats refresh behavior
- badge or notification output when changed

### `src/index.js`

Prefer scenario tests or manual checks for:

- route-driven initialization
- repeated initialization protection
- visibility and mutation-driven refresh behavior

## Fixture rules

- Source DOM fixtures from `temp/chat.html` and `temp/chat-list.html` before inventing markup.
- Source API fixtures from `temp/*.har` or extracted JSON snapshots before inventing payloads.
- Store the test-ready copy under `tests/fixtures/` when needed.
- Keep fixtures focused; trim irrelevant noise, but preserve the structure that makes the selector or parser realistic.
- Note the fixture source in the test file when the origin matters.

## Verification gates

Run the narrowest changed tests first, then the broader relevant checks.

At minimum, complete the checks relevant to the touched layer:

- changed unit tests
- changed DOM or fixture tests
- broader relevant suite
- `npm run build`
- artifact check for `dist/boss-zhipin.user.js`
- manual regression for live-page-only risks

## Manual regression checklist for this repo

- load the built userscript in Tampermonkey or the current userscript workflow
- open a matching BOSS page
- confirm the script initializes without obvious console failure
- confirm target marking still appears on matching cards
- confirm greeting controls still start and stop the loop safely
- confirm records or stats still update if the touched code affects them
- confirm changed selector paths still work on real DOM if the task touched live-page behavior

## Reporting rules

Always report:

- which tests were written or updated first
- which commands were run
- which fixtures were used
- which manual checks were completed
- which checks were not possible
- what residual risk remains, especially selector drift, timing, and third-party page dependence
