## Property-Based Testing for `projectObject`

The core idea: instead of writing *example inputs → expected outputs*, you define **invariants that must hold for all inputs**.

---

### Properties worth testing

**1. Subset guarantee**
For any object and any path list, every key in the result must have originated from the source. The projected result contains no keys that weren't allowed.

**2. Completeness**
For every allowed path that exists in the source, the projected result must contain it. Nothing that was allowed and present should go missing.

**3. Idempotency**
Projecting an already-projected object with the same paths produces an identical result. `project(project(obj, paths), paths) === project(obj, paths)`

**4. Monotonicity**
Adding more paths to the allow-list can only add keys to the result, never remove them. A larger filter set is a superset of a smaller one's result.

**5. Empty paths → empty result**
For any object, projecting with `[]` always returns `{}`.

**6. Full paths → full object**
If the allow-list contains every path present in the object, the result deep-equals the source.

**7. Non-existent paths are ignored gracefully**
Paths that don't exist in the source produce no error and no phantom keys in the result.

**8. Array length preservation**
When projecting `items[*].field`, the result array length equals the source array length — no elements dropped, no duplicates.

**9. Source immutability**
The source object is never mutated. After projection, it deep-equals its original state.

**10. Order independence**
Shuffling the path list produces the same result. The projector is a set operation, not a sequential one.

---

### How to wire these into fast-check

You'll need two arbitraries:

- **`arbitraryObject`** — generates random nested objects with arrays of records
- **`arbitraryPathsFor(obj)`** — given a generated object, enumerates all valid paths from it and returns a random subset

The key insight is generating paths *derived from the object* so you can meaningfully test completeness and correctness, rather than throwing random strings that all miss.