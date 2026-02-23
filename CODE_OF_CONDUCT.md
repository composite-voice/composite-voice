# Code of Conduct

## Welcome

This is a project about giving software a voice — and the people building it deserve to be heard too.

CompositeVoice is a community first, a codebase second. Whether you're here because you shipped a voice agent last week and hit a wall, because you're curious about real-time audio pipelines, or because you've never contributed to open source before and this seems like a good place to start — you belong here. The only qualification for membership in this community is that you show up with honesty and some patience for others who are doing the same.

This isn't a large project with a steering committee. It's a small library, a maintainer, and the people who find it useful. That scale means we can actually be a community in the genuine sense — not a crowd of strangers transacting over a ticket queue.

---

## The community we're building

CompositeVoice sits at an intersection that most developers haven't worked in before: real-time audio capture, streaming AI inference, and browser APIs that behave differently across every platform. That means the people here often arrive with gaps — someone who knows WebSockets but not audio, someone who knows AI APIs but has never used `getUserMedia`, someone who knows JavaScript but not TypeScript. Nobody here knows all of it.

This is a community where experience levels mix and learning is expected. If you've shipped five voice agents, your job when someone asks a question you find obvious is to answer it well, not to signal that you found it obvious. If you've never opened a pull request before, your job is to ask when you're stuck — not to suffer quietly and give up.

---

## What good participation looks like

Good participation is specific and generous. Here are concrete examples.

**Helping someone understand a concept:**

> "The reason `AudioContext` has to be resumed after a user gesture is that browsers require it as an autoplay restriction — here's the MDN article: [link]. In this project, that's handled in `AudioCapture.ts` around line 42. If you're seeing the `interrupted` state, that's almost certainly why."

Not:

> "Did you read the docs?"

**Reviewing a pull request:**

> "This works for the happy path, but if the WebSocket closes between `startCapture()` and the first `onmessage`, the interim results buffer will never be flushed. Could you add a flush call in the `onclose` handler? I think something like `this._flushBuffer()` after the close event would cover it."

Not:

> "This is broken."

**Disagreeing about a design decision:**

> "I'd push back on using a class here — the state is simple enough that a plain function with a closure might be easier to test and tree-shake. But I might be underestimating the complexity; what's your reasoning for the class? Happy to be wrong."

Not:

> "This is the wrong pattern."

**Asking for help:**

> "I'm getting a `NotAllowedError` when calling `startCapture()` on iOS Safari 16.4. I'm calling it from a button click handler, so I expected the gesture requirement to be satisfied. Here's the stack trace and the relevant part of my setup..."

That kind of clear, specific question — even when you don't know the answer — makes it fast for someone to help you. You don't need to have already diagnosed the problem to ask well.

---

## What we don't tolerate

The list is short. All of the following are grounds for removal from the community:

- Harassment or discrimination based on age, background, disability, ethnicity, gender identity and expression, nationality, personal appearance, race, religion, sexual identity, or any other protected characteristic
- Personal attacks — criticising code is welcome; criticising the person writing it is not
- Derogatory comments about someone's experience level or the quality of their questions
- Publishing someone's private information without their consent (doxxing)
- Sustained disruption of discussions — repeated off-topic replies, deliberate trolling, bad-faith arguments that waste everyone's time
- Unwelcome sexual attention or advances
- Any conduct that would be unacceptable in a professional workplace

The practical test: if you'd be uncomfortable saying it in a professional code review with your name attached, don't say it here.

---

## Scope

This code of conduct applies in all project spaces:

- GitHub Issues and Pull Requests
- Code review comments
- GitHub Discussions
- Commit messages (yes, commit messages)
- Any public forum where you're representing the CompositeVoice project

It also applies to private conduct that affects members of this community.

---

## How to report

If you witness or experience something that violates this code of conduct, please report it. You will not face any negative consequences for reporting in good faith. Your report will be handled with care and confidentiality.

**Step 1:** Do not respond publicly. Escalating in the open usually makes situations worse before they get better.

**Step 2:** Report through one of these private channels:

- **GitHub Security Advisory (preferred):** [Open a Security Advisory](https://github.com/lukeocodes/composite-voice/security/advisories/new). This creates a private channel visible only to the maintainer and is designed for confidential communication.
- **Direct contact:** Reach the maintainer via [GitHub](https://github.com/lukeocodes).

**Step 3:** Include what you're comfortable sharing:

- What happened, with specific detail if you have it
- When and where it happened — link to the issue, comment, or discussion if applicable
- Whether this was a one-time incident or part of a pattern
- What outcome you're hoping for, if you have one in mind

You don't need a complete picture to file a report. If you saw something and you're unsure whether it rises to the level of a violation, report it anyway. A borderline situation that goes unaddressed tends to escalate; one that gets a quiet check-in usually doesn't.

All reports are confidential. Your identity will not be disclosed to the person being reported without your explicit consent.

---

## Enforcement

When a report is received:

1. **Acknowledgement** — within 48 hours, the maintainer will confirm receipt and let you know the report is under review.

2. **Context** — before taking action, the maintainer will review the situation carefully. This may include reading the full thread, reaching out to witnesses, or a private conversation with the person being reported.

3. **Decision** — the response is proportional to the severity and context. It may range from:
   - A private note explaining why the behaviour was a problem
   - A request for a public or private apology, depending on the situation
   - A temporary suspension from participating in the project
   - A permanent ban from the community

4. **Communication** — the decision and the reasoning behind it will be communicated to all parties involved, within the bounds of confidentiality.

If you'd like to appeal a decision, reply to the original reporting channel. Appeals are reviewed with the same care as the original report.

---

_Based on the [Contributor Covenant](https://www.contributor-covenant.org/) v2.1, adapted with a human voice._
