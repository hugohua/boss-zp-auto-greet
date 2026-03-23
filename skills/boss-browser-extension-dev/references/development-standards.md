# Development Standards

Use imperative changes and keep scope tight.

## Testing-first policy

- Define acceptance checks before implementing.
- Prefer TDD for stable logic that can be expressed as pure functions or narrow state transitions.
- Prefer scenario-first integration testing for cross-context behavior.
- Treat manual regression as mandatory when behavior depends on real page markup, injection timing, permissions, or MV3 service worker lifecycle.

Use the lightest effective strategy:

- pure logic: write or update tests first
- message and state flow: define the scenario and expected transitions first
- DOM and third-party page behavior: define the regression checklist first

## Change strategy

- Trace the feature or bug to one owning layer before editing.
- Preserve existing public behavior unless the task explicitly changes behavior.
- Prefer extending existing message shapes and storage schemas over inventing parallel pathways.
- Refactor only when it reduces risk for the current task.

## Layer ownership

- `public/manifest.json`: declare capabilities, permissions, and script registration only
- `public/popup.*`: collect operator input, render status, and dispatch commands
- `src/background.js`: own storage, counters, records, shared runtime state, and central message routing
- `src/content.js`: own DOM inspection, DOM interaction, page-visible automation state, and content-side command execution
- `src/injected.js`: own page-context interception of XHR and `fetch`, then forward data with `window.postMessage`

## Messaging rules

- Keep message names stable and explicit.
- Update both sender and receiver in the same task.
- Handle failure from `chrome.runtime.sendMessage` and `chrome.tabs.sendMessage`.
- Return structured results from handlers where practical.

## DOM automation rules

- Prefer multiple fallback selectors for volatile site markup.
- Fail safely when elements are missing.
- Avoid assuming card order remains stable after scroll or lazy load.
- Recompute candidate state after major DOM-driven actions if needed.

## State and storage rules

- Preserve existing storage keys unless migration is intentional.
- Keep defaults centralized.
- When adding config fields, wire them through background storage and popup controls together.
- When changing counters or records, check both storage writes and popup display paths.

## Logging and diagnosability

- Add logs around start, stop, pause, retry, and breaker conditions.
- Log meaningful failure causes instead of generic errors.
- Do not flood logs inside tight loops without rate awareness.

## Refactor boundaries

Refactor only when one of these is true:

- the target function is too risky to modify in place
- the same logic is duplicated across touched code
- testability or diagnosability materially improves

If refactoring, keep behavior-preserving changes separate from feature logic when feasible.

When a file is hard to test, prefer extracting stable logic instead of giving up on testing entirely.
