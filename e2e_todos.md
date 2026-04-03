IMPORTANT:
- DON'T add any timeouts for now. If using waits, use deterministic ones like documentLoaded or waiting for specific deterministic content on the page.
- DON'T skip tests for now.

---
search_and_details.spec.js

Todos:
- move Search and filtering tests into a separate test file
- add tests for various filters that can be selected via the
  filtering-modal

- assert other behaviors of the /datasets/:id view
---
making sure each "feature" actually runs for all roles
---
@tests/src/tests/view/authenticated/import/next_previous_buttons.spec.js:50-56 - i dont want shit like this. why would results not be returned when import-sources are seeded in @api/prisma/seed.js ?
---
@user_management.spec.js (56-59) - this is wrong. we are relying on a timeout to guess whether user is authorized to see the button/modal etc. This is just PLAIN WRONG. The way this should work is that this test should only be called for admin and operator roles, never for user role, using our new role-based-tests approach. 
* IMPORTANT: Also Scan ALL tests for this OR similar silliness and report (don't fix these others yet, only report, ADD fixing them to ai feature todo memory).
---
@association.spec.js (131-134) - again, STRAIGHT UP WRONG. We are only asserting that a Project was created, not that it was the same as the selected project.
---
@tests/src/tests/view/authenticated/upload/resume_upload.spec.js:101-102 why are we not testing the upload resume behavior after this?
---
i removed some timeouts/skips, don't change that.
---
in-test todos
---
; hidden/ignored errors in tests; are 'features' being tested for each role separately?; alerts e2e; stats e2e;

