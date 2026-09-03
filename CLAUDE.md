# Bioloop

Standing reply and evidence preferences live in the user-level `~/.claude/CLAUDE.md`. This
file covers how work is carried out in this repository.

## Working through a change

**State the plan before a long investigation.** Name the arms, the control, the metric, and
the comparison before running anything that takes more than a few tool calls.

**Run long jobs in the background and wake up to check them.** Index builds, gateway sweeps,
and embedding runs take hours. Start them detached using the harness's own background
mechanism, then use the waiting time for work that does not depend on them. Do not sit polling,
and do not truncate an experiment because it is slow. A process started with `nohup ... &`
inside a tool call is killed when that call ends.

**Do not stop for confirmation partway through an agreed plan.** A decision that has an obvious
right answer, is cheap to reverse, and gets documented when taken should be taken. Reserve
stopping for choices that are genuinely the user's: anything outward-facing, license-bearing,
or that cannot be undone by re-running.

**Flag design changes made during implementation.** When the code ends up differing from a
design already stated in conversation, the summary names the departure before it names the
results: what was planned, what was built instead, and why. This applies most sharply to
positions argued for in an earlier turn, because those have already been accepted and will not
be re-derived. Mid-implementation changes are fine; the silence is the problem. When the change
is large enough that its trade-offs differ, raise it before building.

## Cleaning up after a wrong turn

**Remove fixes that did not fix anything.** When a bug turns out to have a different cause than
first assumed, list every change made under the wrong diagnosis and remove each one the true
cause explains away. Removal is the default; a speculative change survives only if it is
independently worthwhile, and then it is a design choice argued on its own terms rather than a
fix. Comments written to justify the wrong diagnosis are the worst residue, because they read
as a measured finding. Sweep `.claude/skills/` and the design docs too.

**Audit downstream decisions when a premise is reverted.** When a design premise is reversed,
find the decisions whose stated justification was the old premise and say for each one whether
it still holds. Grep for the old premise as prose, not only as a constant, because stale claims
survive in docstrings and headings long after the constant changed. A decision that is merely
unexamined under the new premise is still worth reporting.

**Sweep every doc a change touches.** Before calling a change done, grep the docs tree for the
identifiers, field names, weights, counts, and phrases the change touched, and read every hit.
Worked examples, deferred-work tables, and "open questions" sections go stale first and are the
least likely to be found by looking near the code. A measurement recorded in a doc is evidence
of what was true when it was taken, so add what changed rather than rewriting it. Check
intra-document links after editing a heading.

**Capture operational techniques in a project skill.** When a session works out how to do
something operational — exact selectors, the flag that turned out to be required, the approach
that looked reasonable and did not work — write it into `.claude/skills/<name>/SKILL.md` so the
next session does not rediscover it. Record dead ends explicitly, verify claims against the
running system before writing them down, and end each skill with a section telling the next
agent to keep it current. When working in territory a skill covers and hitting something it
does not mention, amend the skill in the same change.

## Code and design

**Prefer dropping a feature over complicated code.** Long-term readability outweighs feature
completeness. When a feature can only be made correct with intricate logic, lead with the
option of removing it rather than presenting the complicated implementation as the default.
State plainly whether the simple version is genuinely simple. Some fields exist only for
display and need to be representative rather than accurate; for those a cheap approximation is
the right answer and precision work is wasted.

**Refuse rather than fall back to a default.** A missing entry in a configuration table is a
gap to report, not a value to guess. The API returns an error naming the thing that is
undefined, and the UI catches that status and shows a plain message. Where possible, add a test
asserting the configuration covers everything the code can reach.

**Omit content rather than show a defective one.** When a derived pipeline cannot produce a
good value for a row, it emits nothing for that row. Do not substitute a fallback, a
placeholder, or the runner-up, and do not re-rank to find a passing candidate. Prefer precision
over coverage: dropping a few acceptable rows is fine, admitting a few wrong ones is not.

**Let every LLM step abstain.** Silence is a first-class answer. Make the empty answer the
expected one in the prompt and say plainly that most inputs have none. Cap output per axis
rather than requesting a fixed count, and let each axis be empty independently. Get confidence
from something the model cannot simply assert, such as self-consistency or verification against
an external source. Never add a free-text justification field to a guided-decoding schema.

**Constants need a rationale that can be derived or pictured.** Prefer a constant naming a
geometric, statistical, or structural fact: an angle, a probability, a rank position, a
documented protocol limit. If the only justification is "this worked on the queries I tried",
say so explicitly rather than dressing it up in a design comment.

**Name a constant for the kind of claim it makes**, not for the quantity it is compared
against, so a reader can tell whether it is a mathematical precondition, a privacy rule, a
legibility choice, or a performance bound. `min_` plus a noun implies a tunable floor; use it
only when the value really is a choice someone may change. Say in both the jsdoc and the design
doc whether it may be tuned and what breaks if it is.

**Split a constant that carries two meanings** before tuning either. The test is not whether
the two call sites currently want the same number, but whether an argument for changing one is
an argument for changing the other. Equal values with different rationales is a normal, stable
state.

## Documentation

**Comments link to the design docs.** Function, schema, and migration comments do not restate
design discussion, constraints, or trade-offs. Write a one-line purpose plus the API contract
and link to the file and section, as `@see docs/biobank-design/<file>.md — <Section>`. Keep
inline comments for code-level facts that are not in the docs: lock ordering, why one statement
precedes another, which trigger checks what.

**Describe the target state, not the legacy one.** Design documents cover the processes the
design will have. Do not narrate how the system used to be organised, what a refactor replaced,
or what was deleted. A decision record still explains why a shape was chosen, but the contrast
is drawn against the alternative in the abstract, never against the repository's own history.

**Prose over the decision template.** Describe structure, interfaces, and behaviour as ordinary
prose with the reasoning stated inline where it belongs. Reserve the numbered decision form for
genuinely contested choices where the alternative, the reason, and the cost are each worth
stating separately.

**Prose style, for a reader skimming at 2am during an incident.** One idea per sentence, under
25 words. Every sentence needs a subject and a finite main verb. No cleft openers, no trailing
participial clauses, no more than one em-dash per paragraph, no nominalisations. Define a term
once, in its own sentence, before using it. Serial comma always. Lead each section with the
claim, then support it.

**Use the code's own vocabulary.** When writing notes or explanations about existing code, name
the functions and variables the code uses and enumerate the values a call actually returns. Do
not coin a new verb or abstraction, even when the summary feels clearer, because a coined term
forces the reader to map it back onto the code before they can check the claim. This applies to
prose for people outside the code as well.

**Generated tables get their own file.** A table a script produces lives in its own file with
the hand-written document linking to it, never embedded behind generated-block markers. A
README is reviewed as prose somebody wrote; a generated table is reviewed as output nobody
typed. Keep the generator's `--check` mode pointed at the generated file.
