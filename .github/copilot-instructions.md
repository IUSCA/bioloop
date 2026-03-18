# GitHub Copilot Instructions for Bioloop

## UI Development (`ui/` folder)

Consult [UI Coding Standards](../docs/ui/coding_standards.md) for:
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

## API Service Tests (`api/src/services/` & `api/tests/services/`)

Consult [API Service Tests Skill](../skills/api-service-tests/SKILL.md) when:
- Writing or extending tests for any `api/src/services/*.js` file
- Choosing between lifecycle, invariants, or concurrency test files
- Setting up fixtures, cleanup, or concurrency patterns with Jest + real Prisma (no mocks)