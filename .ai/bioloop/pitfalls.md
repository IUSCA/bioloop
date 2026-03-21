# Bioloop Platform Common Pitfalls

This document catalogs frequent mistakes and anti-patterns in the Bioloop platform codebase.

---

## Database & Prisma

1. **❌ Creating new Prisma instances instead of reusing from `@/db`**
   - Always use: `const prisma = require('@/db');`
   - Never use: `const prisma = new PrismaClient();`

2. **❌ Not using transactions for multi-operation API calls**
   - Use `prisma.$transaction()` when operations must be atomic
   - Pass transaction instance to service methods

3. **❌ Repeating complex Prisma includes instead of using constants**
   - Define shared includes in `api/src/constants/prismaIncludes.js`
   - Reuse across routes

---

## Authentication & Authorization

4. **❌ Using `auth.hasRole()` directly instead of `auth.canAdmin`/`auth.canOperate`**
   - Use semantic helper methods for clarity and maintainability

---

## UI Components (Vuestic)

5. **❌ Using `va-progress-circular` (correct: `va-progress-circle`)**

6. **❌ Using `va-radio-group` (correct: individual `va-radio` components)**

7. **❌ Forgetting `text-by` and `value-by` on `va-select`**
   - Always specify these props for proper option binding

8. **❌ Adding styling classes without being asked**
   - Avoid: `text-sm`, `bg-gray-100`, `text-red-500`
   - Use Vuestic component props instead

---

## UI Logic

9. **❌ Clearing form fields on selection (preserve manual input)**
   - Only auto-populate if fields are empty
   - Don't overwrite user's manual selections

10. **❌ Showing toast notifications for UI interactions**
    - Only show toasts for API success/failure
    - Not for: selecting items, opening modals, etc.

---

## General Code Quality

11. **❌ Not organizing imports at the top of files**
    - All imports should be at the top
    - Group by category (external, db, middleware, services, etc.)

12. **❌ Using `console.log` in API code instead of `logger`**
    - Use `logger` for API/worker code
    - `console.log` only for CLI scripts

13. **❌ Manual error handling instead of using `asyncHandler`**
    - Let `asyncHandler` catch errors automatically
    - Use `createError` for HTTP errors

14. **❌ Hiding errors with try-catch blocks**
    - **Never** use try-catch to silence errors and return success responses
    - Try-catch is acceptable at interface boundaries (e.g., API route handlers catching service errors to set proper status codes)
    - **Never** abuse try-catch within services or business logic to hide failures
    - Example of what NOT to do:
      ```javascript
      try {
        const stats = fs.statSync(filePath);
      } catch (error) {
        logger.error(error);
        // BAD: continuing execution and returning 200
      }
      ```
    - Instead, let errors bubble up or explicitly handle them with proper error responses

---

**Last Updated:** 2026-01-17
