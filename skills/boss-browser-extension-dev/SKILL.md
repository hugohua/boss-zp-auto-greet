---
name: boss-browser-extension-dev
description: Development and testing workflow for a Manifest V3 browser extension in this repository. Use when Codex needs to implement, refactor, debug, review, or validate Chrome extension behavior involving manifest configuration, popup UI, background service workers, content scripts, injected page scripts, DOM automation, selector drift, message passing, storage, build output, or manual regression checks.
---

# Boss Browser Extension Dev

Follow this workflow when working in this repository.

## Start from the repo map

Read only the files needed for the task.

- [public/manifest.json](public/manifest.json) for permissions, content script registration, popup entry, and service worker entry
- [src/background.js](src/background.js) for storage, runtime state, counters, and cross-context messaging
- [src/content.js](src/content.js) for DOM scanning, candidate state, automation loop, and popup command handling
- [src/injected.js](src/injected.js) for MAIN world interception of XHR and `fetch`
- [public/popup.js](public/popup.js) and [public/popup.html](public/popup.html) for operator controls and status rendering
- [rollup.config.mjs](rollup.config.mjs) and [package.json](package.json) for build behavior

Before changing code, identify which execution world owns the behavior:

- `MAIN world`: page-native APIs and network interception in `src/injected.js`
- `ISOLATED world`: DOM automation and extension messaging in `src/content.js`
- `extension background`: storage and shared state in `src/background.js`
- `popup`: operator controls in `public/popup.js`

Do not move logic across these boundaries unless the task explicitly requires it.

## Develop in small slices

Use this order:

1. Define the success checks before editing. Write down the user-visible outcome, the message or state transitions involved, and the verification plan.
2. Trace the user-facing trigger to the owning file and function.
3. Confirm the data path across `popup`, `content`, `background`, and `injected` if messaging is involved.
4. Change only the layer that owns the bug or feature.
5. Rebuild mentally for MV3 constraints before editing:
   background is event-driven, content scripts do not share JS context with the page, and injected scripts cannot directly call extension APIs.
6. Keep selectors, message types, storage keys, and runtime state names consistent with existing conventions unless there is a clear reason to rename them.

Prefer:

- narrow patches over broad rewrites
- explicit helper functions over long inline branches
- defensive DOM lookup for brittle site markup
- logging around state transitions and failure paths

Avoid:

- mixing page-world interception with extension-world logic
- hard-coding assumptions about one page variant without fallback selectors
- adding new message types when an existing one can be extended safely
- silent failures on async messaging or DOM actions

## Use test-first thinking

Prefer test-first development, but do not force pure TDD where the surface is dominated by page integration.

Use this policy:

- For pure logic, use TDD. Extract or keep logic in small functions, write the expected behavior first, then implement.
- For message flow and state sync, define the end-to-end scenario first, then implement against that scenario.
- For DOM selectors, injected interception, and third-party page behavior, define a regression checklist first and treat manual verification as part of the test plan.

For every non-trivial task, identify the validation layer before coding:

- unit-level validation for matching, filtering, limit calculations, storage merging, and payload shaping
- integration-level validation for popup/background/content/injected message flow
- manual regression for real-page behavior, selector drift, MV3 lifecycle timing, and extension loading

## Standards for code changes

For development standards, read [references/development-standards.md](references/development-standards.md).

Apply these repo-specific rules:

- Keep `manifest`, `popup`, `background`, `content`, and `injected` changes aligned. A feature that adds UI control usually needs both popup wiring and runtime handling.
- Treat selectors in `src/content.js` as volatile. Prefer grouped selectors and graceful fallback.
- Treat network interception in `src/injected.js` as fragile. Modify only the minimum needed and preserve original request/response flow.
- Preserve storage compatibility unless the task explicitly includes migration.
- When changing automation loops, review stop conditions, rate limits, hidden-tab behavior, and circuit-breaker logic together.

## Test before closing the task

For the full checklist, read [references/testing-standards.md](references/testing-standards.md).

At minimum, perform the checks relevant to the touched layer:

- build succeeds with `npm run build`
- generated files appear under `dist/`
- manifest entries still match built filenames
- popup controls still send and receive the expected messages
- background state updates still surface in popup stats
- content script still finds target cards and fails safely when selectors miss
- injected script still forwards candidate data to the content script path

If a check cannot be run locally, say so clearly and provide a manual verification checklist.

## Output expectations

In your response:

- summarize the execution layer you changed
- call out any MV3 or cross-context risk
- list the exact verification performed
- if verification is partial, state the gap plainly
