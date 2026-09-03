# GitHub Copilot Instructions for Bioloop

## UI Development (`ui/` folder)

Project conventions live under [`docs/contributing/`](../docs/contributing/), not in this
file, so that every developer and AI agent shares one source regardless of tooling.
See [Stack Conventions](../docs/contributing/conventions/) for JavaScript, Express,
PostgreSQL/Prisma, and Vue 3 rules.

Consult [UI Coding Standards](../docs/contributing/ui-coding-standards.md) for:
- Detailed styling guidelines
- Icon usage and libraries
- Component best practices
- Import conventions
- Utility component usage

### Quick Links

- **Vuestic UI Docs:** https://vuestic.dev/
- **Tailwind CSS Docs:** https://tailwindcss.com/docs
- **Material Icons:** https://fonts.google.com/icons?icon.set=Material+Icons
- **Material Design Icons (MDI):** https://pictogrammers.com/library/mdi/

## Engineering Principles

Prefer simple, modular solutions with clear boundaries. Before implementing:
- Favor KISS and DRY; avoid speculative abstractions
- Design extension points at likely change seams, not everywhere
- Minimal implementation today; low-risk additions tomorrow

For deep design analysis, invoke `/design-thoughtfully`.

