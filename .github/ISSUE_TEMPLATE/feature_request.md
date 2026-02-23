---
name: Feature request
about: Suggest an idea or improvement
labels: enhancement
---

## Summary

<!-- One or two sentences: what do you want to see added or changed?
     This is the TL;DR that appears in the issue list — make it specific enough
     to be meaningful at a glance. -->

---

## Problem or use case

<!-- What are you trying to do that isn't currently possible, or is harder than it should be?

     Please describe the underlying problem, not just the solution you already have in mind.
     Understanding the actual problem is more useful than a feature spec — it often leads to
     a better solution than the one originally imagined, and helps the maintainer assess
     whether and how to address it.

     Example of a good problem description:
     "I'm building a voice agent for a public kiosk application. The kiosk runs in a browser
     on a device with no internet fallback. When the Deepgram WebSocket drops (which happens
     on flaky networks), the entire agent stops functioning. There's no way to hook into the
     reconnection lifecycle to show the user a 'reconnecting...' message, and there's no event
     I can listen to for partial reconnection state. I'm currently polling agent.state, which
     feels fragile."

     That's much more useful than: "Add a reconnecting event." -->

---

## Proposed solution

<!-- If you have a specific idea, describe it here. How would it work?
     API sketches are extremely helpful — showing how you'd expect to call the new
     functionality makes it much faster to evaluate whether it fits the SDK's design. -->

```typescript
// Example of what the API might look like — feel free to be rough/speculative
```

---

## Alternatives considered

<!-- What have you tried already, or what other approaches could solve the same problem?
     Knowing what you've ruled out helps avoid suggesting workarounds that don't fit your situation.

     This also helps frame whether this is a gap in the library, a gap in documentation,
     or something that's intentionally out of scope. -->

---

## Who would benefit

<!-- Is this a niche use case specific to your situation, or would it benefit most users of the SDK?
     Neither answer disqualifies a request — niche features can still be worth adding,
     and broad features need to be designed more carefully.
     A rough sense of the audience helps with prioritisation. -->

---

## Additional context

<!-- Links to related issues, prior art in similar libraries, relevant specs or API docs,
     or anything else that helps evaluate or scope this request.
     If you've already started a prototype implementation, mention it here — a draft PR
     alongside a feature request is always welcome. -->
