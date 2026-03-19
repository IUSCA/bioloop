# Production Environment Warnings

**THIS IS THE PRODUCTION ENVIRONMENT.**

Production configuration varies by deployment. The notes below describe generic cautions applicable to all Bioloop deployments. Update this file for your specific environment.

---

## Access Restrictions

### ❌ NEVER Allowed (Unless User Explicitly Permits)

**File System:**
- **NEVER** write/delete files outside the application directory without explicit permission
- **ALWAYS** delete anything written to `/tmp` after work is done

**Database:**
- **NEVER** reset the database on a production host

**Docker:**
- **NEVER** run `docker exec` or restart containers unless explicitly permitted

**Workers:**
- **NEVER** restart/kill/stop workers without explicit permission
- Can view logs safely

**System Services:**
- **NEVER** restart system services (docker, nginx, etc.)
- **NEVER** use sudo unless explicitly granted

**Git:**
- **NEVER** do git write operations (`git pull`, `git push`, `git rebase`, `git merge`, `git commit`)
- Can do read-only operations (`git status`, `git diff`, `git log`, etc.)

### ✅ Always Allowed

- Safe read-only operations for debugging
- Reading logs, viewing process status
- File inspection (except `.env` files)
- Git read-only operations

---

## Sensitive File Restrictions

### .env Files

**NEVER read, write, display, or print the contents of `.env` files that contain secrets.**

- `.env.default` files are safe to read (templates with example values)
- `.env` files may contain secrets — do NOT access them

---

## Hot Reloading

API and UI changes typically do **NOT** require restarts unless:
- Configuration files changed (`config/*.json`)
- New npm package installed
- Prisma schema changed (requires `npx prisma generate`)

---

**Last Updated:** 2026-01-16
