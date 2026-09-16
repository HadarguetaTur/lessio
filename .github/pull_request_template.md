<!-- Bug-fix contract (docs/ops/agent-policy.md §Bug-fix contract). Every section
     is required; "n/a" with a reason is an answer, an empty section is not. -->

Closes #

## Risk class
<!-- green | yellow | red — the highest class of any path touched. The labeler
     marks; the reviewer decides, and may only raise it. Red must not be
     authored by an agent. -->

## Root cause
<!-- One paragraph, with file:line. For a feature: what problem this solves. -->

## Change
<!-- What changed and why it is the smallest safe fix. No drive-by refactors. -->

## Test evidence
<!-- The regression test that fails before / passes after, and the commands run:
     npm run lint · npx tsc --noEmit · npx vitest run · npm run build
     If no test was added, say why ("not realistically testable: …"). -->

## Mirror / i18n check
<!-- Touched DEFAULT_TEMPLATES, botStrings, threshold or fingerprint logic → both
     Node and Deno copies updated? Touched messages/*.json → both he and en? -->

## What was NOT tested
<!-- e.g. not exercised against Meta / Sumit / a real WhatsApp window / production data. -->

## Ops needed after merge
<!-- none | needs-migration (additive?) | needs-edge-deploy <fn> | needs-ops (crons, secrets, Meta, payments).
     Anything here is human-only; the agent must not perform it. -->
