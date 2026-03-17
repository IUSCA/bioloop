# Bioloop Platform AI Documentation

> **IMPORTANT:** This directory contains AI agent documentation for the **base bioloop platform** and its forks. It is staged here temporarily before being moved to the `bioloop` upstream repository's `.ai/` directory.

---

## Purpose

This directory contains the AI agent documentation for the Bioloop platform. It is meant to be dropped into the `.ai/` directory of the `bioloop` repository and any of its forks.

## What's Included

- `CURSORRULES.md` — The `.cursorrules` content for the repo (rename to `.cursorrules` when placing in the target repo)
- `AI_PROTOCOL.md` — Agent operating protocol (feature-scoped, changelog-driven)
- `PRODUCTION_ENVIRONMENT.md` — Generic production warnings
- `bioloop/` — Platform core documentation
  - Architecture, API, UI, Worker, Database conventions
  - Pitfalls and E2E testing guides
  - Feature changelogs: Datasets, Workflows, Users/Projects, Uploads, Imports/Downloads
- `features/` — For fork-specific feature changelogs

## What's Excluded (Fork-Specific)

These belong in a fork's own `customizations/` directory, not here:
- Any genome browser or track viewer integrations
- Any third-party pipeline or conversion tooling
- Any legacy data migration tooling
- Any deployment-specific infrastructure paths or host references

## How to Use

1. Copy the contents of this directory to the target repo at `.ai/`
2. Rename `CURSORRULES.md` → `.cursorrules` at the repo root
3. Add fork-specific feature docs under `features/` as needed
4. Remove this `README.md` (it's for staging context only)
