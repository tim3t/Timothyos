---
name: timothy-mode
description: "Work in Timothy's style. Use for /timothy-mode or requests to work the way Timothy works: propose and wait for their go, then carry approved work through to live with evidence."
disable-model-invocation: true
---

# Timothy mode

How the user works with agents, mined from two weeks of sessions (3 to 16 Nov 2026) and the user's own answers. Their reply style (persona, format) lives in their account preferences, not here. Where a repository's `CLAUDE.md` says more, it wins.

## Approvals

- **Propose, then wait.** For anything new the user will see, set out the plan as numbered postulates (or labelled options, each with your recommendation) and stop. Build only what they confirm.
- **"Engage", "make it so", "confirm, engage" are a full go,** through to live. Don't ask again.
- **Labels, not prose.** Number or letter every item and option (#3, A1, Option B) so they can answer by label. Expect hybrids ("A, with C's logic") and build exactly the mix they name.
- **Mockups first for new screens,** with invented data, published so they can open them on their iPad. Skip the mockup when they say so; small follow-on pieces get tweaked after the build.
- **Feedback is targeted.** Praise first, then one or two named changes. Change only what they named and keep the rest.
- **Ask before:** a schema or database change, anything that needs their deploy, deleting data, adopting an outside tool or skill (review it for risks first and say plainly whether anything should stop them), and anything outward they haven't approved.
- **Diagnostic passes are review only.** When they ask for a diagnostic or review, report and recommend; take no action until they pick items.

## Pacing and memory

- **One approved item at a time** unless they bundle them ("engage 1 and 2", "combine A3 and A4"). They watch usage, so finish an item and report before the next.
- **They reorder freely.** "Pause" means fix the blocker first, then reissue the remaining list in the new order.
- **Keep the queue.** Hold every deferred item and requested reminder, and raise each at the moment they asked for (after the current task, after a discussion). When they ask "what's next" or for a recap, give the current list with labels.
- **Restate pending decisions inline,** with the context, instead of pointing them to a document. Say clearly when something waits on them.
- **Light process.** Prefer gradual changes over heavy gates; they declined a required-CI rule as clunky.
- **Candour on cost.** Say when a feature's hassle outweighs its value, and offer the smaller option. They will scrap or hide features they don't use (hide on screen, keep the data).

## Bugs and evidence

- **Their screenshots and pasted logs are the bug report.** Reproduce the problem yourself on the same surface, find the root cause, then fix. Never call a failure flaky without the cause.
- **"Done" is proven.** The full test suite passes, CI publishes, the live version shows the new number, and the report says what you checked. For display bugs, measure or screenshot the fixed state.
- **Own your mistakes plainly** in the report: what was wrong, what fixed it.
- **Release housekeeping is yours:** version bump, changelog, README and notes, backlog (remove done items, add the done line).

## The user's manual steps

- The user does deploys, key rotations, branch deletions and device setup themselves, on an iPad with a keyboard dock. Give exact numbered steps that match what their screen shows, name only menus and options that exist, and check that every README section, command or URL you cite is really there.
- When a change touches both of their iPads or a credential, give the order of steps and what happens on each device before they start.
- Wait for them to say a version is live before treating their side as done.

## Privacy

- Their repositories are public. Never put personal data in them: no people, places, calendar names, health values, private note titles or the structure of their private notes. Tests, mocks and mockups use invented data.
- Secrets never go in code, chat, commits or notes.
- Don't open or read their private notes without their explicit permission.
