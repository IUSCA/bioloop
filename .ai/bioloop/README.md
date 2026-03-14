# Bioloop Platform Core Documentation

**Purpose:** Documentation for features and patterns shared across all Bioloop platform instances.

This directory contains the **base platform documentation** that applies to:
- The original Bioloop platform
- Any Bioloop forks

---

## Core Platform Features

### 1. Datasets
**File:** `features/datasets.md`
- Raw data vs data products
- Dataset types and lifecycle
- Staging and archival

### 2. Workflows
**File:** `features/workflows.md`
- Python-based workflow framework
- "Integrated" workflows
- Workflow execution and monitoring

### 3. Users & Projects
**File:** `features/users-projects.md`
- User management and authentication
- Role-based access control
- Project organization and ACLs

### 4. Uploads
**File:** `features/uploads.md`
- Browser-based dataset uploads (TUS protocol)
- Resumable upload support
- BLAKE3 checksum verification

### 5. Imports & Downloads
**File:** `features/imports-downloads.md`
- Dataset imports from external sources (SDA, etc.)
- Secure download mechanisms

---

## E2E Testing

### e2e_testing_conventions.md
Playwright e2e testing patterns:
- Test directory structure
- Authentication setup (mock tickets, storage state)
- API helpers for state management
- Common testing patterns (modals, pagination, roles)
- Running tests (Docker, VS Code plugin)

### e2e_testing_pitfalls.md
Common e2e testing mistakes:
- Authentication anti-patterns
- Brittle selectors
- State setup through UI vs API
- Timing and synchronization issues
- Test organization problems

---

## Platform Conventions

### architecture.md
Microservice architecture overview:
- Service components (UI, API, Workers)
- Database architecture
- Cross-service communication
- **Workflow architecture (Rhythm integration)**
- Environment-specific behavior

### api_conventions.md
API development patterns:
- Import organization
- Prisma usage
- Transactions
- Route handlers
- **Workflow creation pattern (CRITICAL)**
- Error handling

### ui_conventions.md
UI development patterns:
- Vuestic component usage
- Constants patterns
- Form validation
- Modal patterns

### worker_conventions.md
Worker development patterns:
- Configuration
- Task definitions
- **Workflow task pattern and argument flow**
- Logging

### database_patterns.md
Database and Prisma patterns:
- Schema conventions
- Cascade deletes
- JSON fields
- Shared includes

### pitfalls.md
Common mistakes in platform code:
- Database anti-patterns
- Authentication errors
- UI component mistakes

---

**Last Updated:** 2026-01-27
