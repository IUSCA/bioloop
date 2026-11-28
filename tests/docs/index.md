## Introduction

Tests are written using Playwright.

---

### Coverage

- Some tests assert authenticated state, while others assert unauthenticated state of the app.
- Tests are end-to-end, in the sense that they do not require mocked network requests, and instead make calls to an actual backend API. These tests span across 3 components of the app:
    - UI
    - API
    - Database

---

### Config
Playwright config is in `tests/playwright.config.js`.

### Docs
- [Authentication](./authentication.md)
- [Test Execution](./execution.md)
- [Server Side State](./server_side_state.md)
- [Recording Tests](./record.md)
- [Attachments](./attachments.md)
