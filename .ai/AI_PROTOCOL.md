# Cursor Agent Operating Protocol (Bioloop)

## Purpose

This repository uses **repo-resident files** as the **single source of truth for cross-workspace and cross-machine continuity** (local ↔ remote).

Chat history is persistent **within a workspace**, but **must never be treated as globally authoritative**.

The `.ai/` directory defines **explicit AI memory artifacts** that override chat memory when present.

---

## Feature-Scoped Work Model

Development is organized **by feature**, not by chat.

Each feature has:
- a **dedicated Cursor chat/tab** (human-enforced)
- a **dedicated changelog file** in `.ai/features/`
- a clearly defined **scope**

The active feature for this chat will be explicitly stated by the user.

---

## Required Pre-Work (MANDATORY)

Before answering *any* development or design prompt:

1. **Identify the active feature** (from user message or prior declaration).

2. **Locate the authoritative changelog** for that feature:
   ```
   .ai/features/<feature>.md
   ```

3. **Read the entire changelog** (or at minimum the most recent entries).

4. **Assume the changelog overrides chat memory** in case of conflict.

5. If the changelog is missing, empty, or unclear:
   - STOP
   - Ask for clarification
   - Do NOT infer or invent behavior.

This step is required **even if the chat already discussed the topic**.

---

## During Work

While working on the feature:
- Treat the changelog as the **current mental model**
- Do not re-decide things already recorded
- Do not contradict logged decisions unless explicitly instructed to revise them
- Keep reasoning consistent with documented constraints

Chat discussion is **exploratory only** until a decision is logged.

---

## Required Post-Work (MANDATORY)

If **any** of the following occur:
- a design decision is made
- behavior is clarified
- constraints are introduced or removed
- architecture or data flow changes
- an assumption is confirmed or rejected

Then you MUST:

1. Append a **factual, concise entry** to the feature changelog.
2. Use **decision-style language**, not discussion.
3. Do **not** summarize the chat — summarize the *outcome*.

### What to Document

**REQUIRED:**
- Update feature changelogs in `.ai/features/<feature>.md` for design decisions (see above)

**ALLOWED:**
- Update existing user-facing documentation (e.g., usage guides, READMEs) when helpful
- Update existing technical documentation when code changes

**FORBIDDEN (unless explicitly requested by user):**
- ❌ Refactor summary files (e.g., `*_REFACTOR.md`, `*_CHANGES.md`)
- ❌ "What changed" summary files
- ❌ Migration guide files (separate from feature changelogs)
- ❌ Change documentation files
- ❌ Implementation summary files

**Why:** This information belongs in:
1. Feature changelogs (`.ai/features/<feature>.md`) - for design decisions
2. Existing usage documentation - for user guidance
3. The code itself - implementation details are self-documenting
4. Git history - for change tracking

**Exception:** Only create additional documentation files if the user explicitly requests them.

---

## Code Style Guidelines

### Emoji Usage Policy

**NEVER use emojis in:**
- ❌ Code comments
- ❌ Logging statements (`logger.info()`, `console.log()`, etc.)
- ❌ Error messages
- ❌ Variable names, function names, or any code identifiers
- ❌ Commit messages
- ❌ Code documentation (JSDoc, docstrings, etc.)

**Emojis ALLOWED in documentation files only:**
- ✅ Markdown documentation files (`.md`)
- ✅ Strictly documentational emojis (✅ ❌ ⚠️ 🎯 📖 etc.)
- ✅ Visual markers for readability in documentation

**Exception for code:**
- May use emojis in extremely complex scripts for debugging purposes
- Only when visual markers in logs would significantly aid debugging
- Must be explicitly justified and temporary

**Rationale:**
- Code should be text-based and emoji-free for compatibility
- Logs should be grep-friendly and parseable
- Documentation can use emojis for visual clarity

---

### Correct entry style

```markdown
## 2026-01-15

- Decision: Conversions do not create sessions directly.
- Constraint: Conversion pipeline must remain stateless.
- Clarification: Sessions are created only after data products exist.
```

### Forbidden entry content

- "We talked about…"
- "It seems like…"
- "Maybe later…"
- Speculation or future planning unless explicitly approved

---

## Git Synchronization Awareness

Prefer to use Git to tell if the current feature's changelogs have changed upstream.

If they have, or if the user explicitly asks (or reminds you) to:
- check for changelog updates
- sync with remote changes
- reconcile local vs remote state

You must **never assume** the changelog is up to date unless verified or stated.

---

## Priority Order of Truth

When conflicts exist, resolve them in this order:

1. `.ai/features/<feature>.md` (highest)
2. Other `.cursorrules` or `.ai/` documentation
3. Repository code
4. Chat history (lowest)

Chat memory is **context**, not authority.

---

## Failure Mode Safeguards

If at any point:
- the active feature is ambiguous
- the changelog contradicts itself
- instructions are missing or unclear

You must:
- pause
- state the inconsistency
- ask for explicit direction

Do **not** guess.

---

## Summary Principle

> **Chats explore.**
> **Changelogs decide.**
> **Files persist.**

This protocol exists to prevent:
- cross-window hallucinations
- local/remote desynchronization
- silent context drift

**Compliance is mandatory.**

---

**Last Updated:** 2026-01-19
