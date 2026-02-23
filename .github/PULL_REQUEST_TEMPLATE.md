## What does this PR do?

<!-- A short description of the change and why it was made.
     Focus on the "why" — the diff shows the "what."
     If this fixes a bug, describe what the bug was. If it adds a feature, describe the use case it enables.
     If the "why" is fully explained by a linked issue below, a single sentence is fine. -->

---

## Related issues

<!-- Link issues so they close automatically on merge, or stay associated for context.
     Examples:
       Fixes #123
       Closes #456
       Related to #789 (doesn't close it, but worth linking) -->

---

## Type of change

<!-- Check all that apply -->

- [ ] Bug fix
- [ ] New feature
- [ ] New provider (STT / LLM / TTS)
- [ ] Documentation improvement
- [ ] Refactoring (no behaviour change)
- [ ] Performance improvement
- [ ] Breaking change — if checked, describe what breaks and how users should migrate

---

## Pre-merge checklist

<!-- Work through this before marking the PR as ready for review.
     It's fine to open a Draft PR before this is all green — that's what drafts are for. -->

- [ ] `pnpm type-check` passes
- [ ] `pnpm lint` passes (or `pnpm lint:fix` was run)
- [ ] `pnpm test` passes — all existing tests still green
- [ ] Tests added or updated to cover any new or changed behaviour
- [ ] If adding a provider: exported from the category index and top-level `src/index.ts`
- [ ] If adding a provider: documented in the README providers table
- [ ] If changing the public API: README and relevant example READMEs updated
- [ ] If adding API key requirements: `sample.env` entries added to affected examples

---

## How to test

<!-- Walk the reviewer through verifying that this works.
     Include required environment setup, which example to run (if applicable),
     and what specifically to look or listen for.

     Example:
     "Copy sample.env in examples/01-deepgram-anthropic-deepgram/ and add Deepgram + Anthropic keys.
     Run `pnpm example:01-deepgram-anthropic-deepgram:dev`.
     Speak a sentence and confirm the transcript appears in the UI within ~500ms.
     Check the browser console — there should be no errors during the full
     listen → think → speak cycle.
     Then close the browser tab abruptly and re-open it — the agent should reconnect
     cleanly without requiring a page reload." -->

---

## Notes for reviewers

<!-- Design decisions, trade-offs, known limitations, or specific areas you'd like extra attention on.
     If there's nothing to flag, delete this section — it's optional. -->
