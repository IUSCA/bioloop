ABAC Policies Implementation Invariants:

- Policies as pure functions
- Explicit attribute declarations
- Centralized loaders
- Request-scoped caching
- Zero knowledge required at call sites
- Separation of concerns between policy definition, data loading, and enforcement


Driving forces:
- Policies should be easy to understand and reason about in isolation
- Policy enforcement should be efficient and not require redundant data fetching
- Use existing data fetching mechanisms (e.g. Prisma) to avoid reinventing the wheel


```javascript
const allowed = await authorize(
  somePolicy,
  {
    user: { id: req.user.id, preFetched: req.user }, // use pre-fetched user
    resource: { id: req.params.id },
    context: { id: req.id }
  },
  hydratorRegistry
)
```