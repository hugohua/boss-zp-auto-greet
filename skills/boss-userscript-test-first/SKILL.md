---
name: boss-userscript-test-first
description: Test-first development workflow for the BOSS Zhipin userscript in this repository. Use when Codex needs to implement, refactor, debug, review, or validate changes to candidate filtering, greeting automation, anti-detect behavior, config persistence, UI panel code, DOM selectors, saved fixtures, or build output in Antigravity IDE, and the task should begin by writing or updating tests before production code.
---

# Boss Userscript Test First

Follow this workflow when changing this repository from Antigravity IDE.

## Start from the repo map

Read only the files needed for the task.

- `src/index.js` for bootstrap, route handling, and module wiring
- `src/config.js` for config persistence, counters, records, and school matching
- `src/filter.js` for candidate extraction, DOM labeling, and chat-list highlighting
- `src/greeting.js` for greeting selection, greeting execution, and stop conditions
- `src/anti-detect.js` for safety checks, circuit breaker logic, and behavior simulation
- `src/ui/*.js` for panel rendering, records display, notifications, and styles
- `temp/chat.html` and `temp/chat-list.html` for DOM regression fixtures
- `temp/*.har` for API payload fixtures
- `rollup.config.mjs` and `package.json` for build and test scripts
- `docs/*.md` only when business context or module history is needed

Before editing, identify the owning layer:

- bootstrap and route wiring: `src/index.js`
- config, counters, records, and school matching: `src/config.js`
- candidate extraction and DOM marking: `src/filter.js`
- greeting loop and message sending: `src/greeting.js`
- anti-detect and circuit-breaker logic: `src/anti-detect.js`
- operator UI and styles: `src/ui/*`

Do not spread logic across layers unless the task explicitly requires it.

## Build the safety net before code

Use this order every time:

1. Define the user-visible behavior and the smallest proof that it still works.
2. Choose the validation layer before touching production code.
3. Write or update the tests first.
4. Only then change the production code.

Treat these as acceptable safety nets, ordered by strength:

- a failing automated unit or DOM test
- a new fixture-backed parser scenario
- a written manual regression checklist for behavior that cannot be automated yet

Do not start feature logic with no safety net unless the task is truly trivial and behavior-preserving.

If the code is hard to test:

- extract a small helper first
- keep that refactor behavior-preserving
- test the helper
- return to the feature change

## Pick the right validation layer

Read [references/testing-standards.md](references/testing-standards.md) for the full matrix.

Prefer unit-first for:

- config merge behavior
- school parsing and matching
- record and counter calculations
- greeting template rendering
- extracted decision logic from long loops

Prefer DOM and fixture-first for:

- selector fallback
- card highlighting and badge injection
- chat-list decoration
- input box lookup and send button lookup
- panel rendering or stats refresh

Prefer API and fixture-first for:

- XHR response normalization
- candidate payload mapping
- deduplication by `geekId` or `encryptGeekId`

Prefer manual-first, plus a checklist, for:

- real page click behavior
- lazy rendering and infinite scroll
- Tampermonkey or GM API quirks
- hidden-tab behavior
- anti-detect timing and platform defenses

Even when manual regression is required, still automate the stable parts first.

## Use a predictable test layout

If the repository already has test tooling, use it.

If not, add the smallest harness that matches the task before the feature change:

- prefer Vitest for unit and DOM tests
- use `jsdom` or an equivalent lightweight DOM environment for selector and UI tests
- place stable fixtures under `tests/fixtures/`
- reuse `temp/chat.html`, `temp/chat-list.html`, and `temp/*.har` as source material instead of inventing unrealistic markup or payloads
- add `npm test` and narrower scripts such as `test:unit` or `test:dom` when they materially help repeatability

Do not add heavyweight browser E2E unless the task truly requires it.

## Apply repo-specific guardrails

Read [references/development-standards.md](references/development-standards.md) for the full rules.

Always preserve these repo-specific behaviors:

- keep `GM_getValue` and `GM_setValue` compatibility, including the `localStorage` fallback in `src/config.js`
- keep DOM selectors defensive and grouped with fallback options
- keep business rules separate from side effects when possible
- keep randomness, time, and timers injectable or easy to stub when touching loop logic
- keep circuit-breaker, limit, and stop-condition changes reviewed together
- keep build output compatible with `dist/boss-zhipin.user.js` and the banner-based Rollup output
- prefer narrow patches over broad rewrites

## Finish with verification, not just code

Before closing the task:

- run the new or changed tests first
- run the broader relevant suite
- run `npm run build`
- confirm `dist/boss-zhipin.user.js` is still produced
- run manual checks for any live-page risks that cannot be automated

In the final response:

- say which tests were written first
- list the commands that were run
- state which manual checks were completed
- call out any coverage gaps or live-site risk clearly
