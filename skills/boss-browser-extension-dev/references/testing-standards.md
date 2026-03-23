# Testing Standards

Validate the smallest useful set of checks for the changed layer, then report exactly what ran.

## Testing strategy

Use a layered approach instead of relying on one testing style.

- Use TDD for pure logic and deterministic rules.
- Use integration testing for cross-context messaging and shared state flow.
- Use manual regression for real-site behavior, selector fragility, injection timing, and MV3 lifecycle edge cases.

For each task, write the expected outcome before implementation:

- what the user does
- what state or message transition should happen
- what visible result confirms success

## Build checks

Run these first when code changes affect build output:

- `npm run build`
- confirm expected artifacts exist in `dist/`
- confirm `public/manifest.json` still points at filenames produced by the build

## Layer-specific checks

### Popup changes

- open the popup and verify controls render
- verify each changed control sends the expected message
- verify refreshed stats or logs still display without console errors

### Background changes

- verify config read and write paths still work
- verify runtime stats still aggregate correctly
- verify record storage and retrieval still work
- verify changed message handlers return expected payloads

### Content script changes

- verify the script initializes on matching pages
- verify selectors still find expected cards or controls
- verify missing elements fail safely without breaking the loop
- verify manual start and stop commands still work
- verify hidden-tab and rate-limit guards still behave sensibly

### Injected script changes

- verify XHR and `fetch` interception still preserve original request flow
- verify forwarded candidate data still reaches the content script through `window.postMessage`
- verify page-context changes do not attempt to call extension APIs directly

### Cross-context changes

- trace one end-to-end flow from popup action to visible page result
- verify message names, payload fields, and receiver logic stay aligned
- verify no layer depends on variables from another execution world

## What should be tested first

Prefer tests first for:

- school matching and filtering rules
- limit, counter, and breaker calculations
- config merge behavior
- record shaping and payload mapping
- helper functions extracted from long DOM or state code

Prefer scenario-first checks for:

- popup button to runtime action flows
- background to content synchronization
- injected data forwarding into the content script

Prefer manual-first checks for:

- selector compatibility on live pages
- button availability and click behavior on real cards
- hidden-tab behavior
- timing issues caused by page load, lazy rendering, or MV3 worker wake-up

## Manual regression checklist for this repo

- build the extension
- load the unpacked extension from `dist/`
- open a matching `zhipin.com` page
- confirm the content script initializes
- confirm candidate marking still appears on matching cards
- confirm popup status updates after a filter action
- confirm start and stop controls affect the automation loop
- confirm logs and records continue to update

## Reporting rules

Always report:

- which commands were run
- which manual checks were completed
- which checks were not possible
- any residual risk, especially selector drift, MV3 lifecycle issues, and page-structure dependence
