# Development Standards

Use test-first changes and keep the patch surface small.

## Non-negotiables

- Write tests before production changes for stable logic.
- Create the minimum test harness first if the repository does not already have one.
- Keep behavior-preserving refactors separate from behavior changes when feasible.
- Never claim a live DOM path is safe without either fixture coverage or manual verification.
- Prefer extraction for testability over editing large side-effect-heavy functions in place.

## Change strategy

- Trace the requested behavior to one owning file before editing.
- Define the expected outcome, state transition, or visible DOM effect before coding.
- Change the smallest layer that owns the behavior.
- Avoid mixing storage, DOM parsing, UI rendering, and action execution in one patch unless the task truly spans them.
- Preserve existing public behavior unless the task explicitly changes behavior.

## File-specific guidance

### `src/config.js`

- Preserve storage keys unless migration is part of the task.
- Keep defaults centralized.
- Test parsing and matching rules before editing them.
- Treat counter and record changes as behavior changes that need explicit tests.

### `src/filter.js`

- Extract pure mapping or parsing helpers before changing complex DOM flows.
- Keep selector groups centralized and additive.
- Prefer fixture-backed DOM tests for card extraction and label injection.
- Preserve deduplication behavior when combining API and DOM sources.

### `src/greeting.js`

- Extract template, target-selection, or stop-condition logic before editing the loop.
- Keep message sending and DOM clicks behind thin helpers where possible.
- Review stop, skip, rest, and limit behavior together when touching the loop.
- Make time and randomness easy to stub.

### `src/anti-detect.js`

- Treat breaker logic and safety gates as high-risk behavior.
- Test failure counting, reset behavior, and guard conditions before changing them.
- Keep page checks fail-safe and diagnosable.

### `src/ui/*`

- Keep rendering code separate from data shaping where possible.
- Use DOM smoke tests when changing stats, badges, notifications, or records rendering.
- Preserve IDs and hooks used by other modules.

## Best practices

- Prefer explicit helper names over long inline branches.
- Prefer narrow, reviewable patches over broad rewrites.
- Add logs around state transitions and failure paths, not inside every fast loop.
- Reuse real saved fixtures from `temp/` before inventing synthetic ones.
- Update or add fixtures when a site structure change is the real reason for the edit.
- Keep userscript constraints in mind: the code runs on a third-party page and must fail safely.

## Anti-patterns

- Editing `greetingLoop` or `filterByDOM` directly with no test plan.
- Refactoring multiple modules at once just to make a small change.
- Swallowing errors silently without a log, test, or clear fallback.
- Introducing new storage schemas, selectors, or timing behavior without targeted verification.
- Declaring success after a build only, when the change affects DOM or runtime behavior.
