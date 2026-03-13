## Type Annotations

**All Python code in `workers/` must include type annotations.** This applies to:
- Function and method signatures (parameters and return types)
- Module-level variables
- Local variables where the type is not immediately obvious from the right-hand side

### Standard imports for annotations

```python
from collections.abc import Generator
from pathlib import Path
from typing import Any
```

Use built-in generic syntax (Python 3.10+):

```python
# Correct - built-in generics, union with |
def get_datasets(
    dataset_type: str,
    name: str | None = None,
) -> list[dict[str, Any]]:
    ...

# Correct - module-level variables
FIXTURES_DIR: Path = Path(__file__).parent / 'fixtures'
_TYPE_MAP: dict[str, Path] = {'RAW_DATA': FIXTURES_DIR / 'raw_data'}

# Correct - generator (yield fixture or iterator)
def dataset_fixture() -> Generator[dict[str, Any], None, None]:
    yield {...}

# Wrong - missing annotations entirely
def get_datasets(dataset_type, name=None):
    ...

# Wrong - old-style Optional / Union from typing
from typing import Optional, Union
def get_datasets(dataset_type: str, name: Optional[str] = None) -> list:
    ...
```

---

## Method Signature Style: One Argument Per Line

When a function or method declaration has **2 or more parameters**, each parameter goes on its own line. The closing parenthesis and return annotation are on their own line.

```python
# Correct - 2+ params, one per line
def register_candidate(
    self,
    candidate: Path,
) -> None:
    ...

def await_stability(
    celery_task: WorkflowTask,
    dataset_id: int,
    wait_seconds: int | None = None,
    **kwargs: Any,
) -> tuple[int]:
    ...

# Correct - single param may stay on one line
def is_a_reject(self, name: str) -> bool:
    ...

# Wrong - multiple params on one line
def register_candidate(self, candidate: Path) -> None:
    ...

def await_stability(celery_task, dataset_id, wait_seconds=None, **kwargs):
    ...
```

This rule applies to:
- All function and method definitions in `workers/`
- Pytest fixture definitions in `workers/tests/`
- Does **not** apply to call sites (arguments at call sites follow normal line-length rules)
