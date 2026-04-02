# General JavaScript Review Criteria

**Note**: This project has ESLint configured for API and UI with different rule sets. Many code style issues are automatically caught by linting. Focus code review on logic, patterns, and architecture-level concerns not covered by ESLint.

## Code Correctness

- **Null/undefined handling**: Flag unguarded property access on values that could be null/undefined (e.g., `user.profile.name` where `profile` might be null). Use optional chaining (`?.`) appropriately.
- **Async/await pitfalls**:
  - `await` inside a `forEach` doesn't work as expected — flag it. Use `for...of` or `Promise.all`.
  - Unhandled promise rejections — every `.then()` chain should have a `.catch()`, every `async` function should be called with error handling.
  - Floating promises (calling an async function without `await` and without `.catch()`) should be flagged.
- **Type coercion**: Flag loose equality (`==`) where strict equality (`===`) is almost certainly intended. Exception: `== null` to check for both null and undefined is acceptable.
- **Mutation**: Flag functions that mutate their arguments unexpectedly. Prefer returning new values.

## Error Handling

- Functions that can fail should throw errors (or return `{ data, error }` tuples), not return `null` silently.
- `catch (e) {}` — swallowing errors silently is a warning. At minimum, log the error.
- Flag overly broad try/catch that catches errors from multiple operations, making it unclear which failed.
- **Prisma-specific**: Transaction callbacks must handle errors properly. Errors in the callback automatically roll back the transaction; flag un-caught promise rejections inside `prisma.$transaction()`.
  ```js
  // GOOD
  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.create({ ... })
      // If this throws, entire transaction rolls back
    })
  } catch (e) {
    // Handle rollback
  }

  // BAD — unhandled error in transaction
  await prisma.$transaction(async (tx) => {
    const result = await tx.user.create({ ... }).catch(e => {
      // Error swallowed, unclear if transaction rolled back
    })
  })
  ```

## Naming and Clarity

- Boolean variables and functions should read as predicates: `isLoading`, `hasPermission`, `canEdit`, not `loading`, `permission`, `edit`.
- Functions should be named for what they do: `fetchUser`, `formatDate`, not `doThing`, `process`, `handle`.
- Flag single-letter variable names outside of loop counters (`i`, `j`) and common conventions (`e` for event, `err` for error).
- Magic numbers should be named constants: `const MAX_RETRIES = 3`, not just `3` inline.

## Module Structure

- Flag circular imports — they cause subtle bugs and are hard to debug.
- Default exports make refactoring and search harder. Prefer named exports unless it's a component file (Vue SFCs default export is fine).
- `index.js` barrel files are fine for re-exporting, but flag if they're re-exporting everything from everywhere (makes tree-shaking harder).

## Environment and Config

- No hardcoded secrets, API keys, or URLs that differ between environments.
- `process.env.FOO` should have a fallback or startup check — flag bare `process.env.FOO` in critical paths without validation.
- Flag checking `process.env.NODE_ENV === 'development'` to enable debug behavior — this should usually be an explicit `DEBUG` flag so it works in staging.

## Dependencies (package.json)

- New dependencies should be justified. Flag additions of large packages for small tasks (e.g., adding `lodash` just for `_.get`).
- Check version ranges: `^` is fine, `*` is not. Pinned exact versions for critical deps is acceptable.
- `devDependencies` vs `dependencies`: Runtime deps go in `dependencies`. Build tools, test frameworks, and type packages go in `devDependencies`.
- Flag if the same package appears in both `dependencies` and `devDependencies`.

## Testing

- New features without tests are a warning (not critical, depends on project standards).
- Test descriptions should describe behavior, not implementation: `"returns 401 when token is missing"` not `"test auth middleware"`.
- Flag tests that test only the happy path for logic that has obvious error branches.
- Mocks should be scoped — flag global state mutation in tests that isn't reset between tests.
- Flag `setTimeout`/`setInterval` in tests without fake timers — causes flaky tests.

## Vite / Build Config

- `define` in `vite.config.js` for constants is fine, but make sure nothing sensitive is exposed to the frontend bundle.
- Flag source maps enabled in production builds if the repo is proprietary — leaks source code.
- External packages listed in `optimizeDeps.exclude` or `ssr.noExternal` should have a comment explaining why.
