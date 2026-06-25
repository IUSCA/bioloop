---
title: Dataset Import
order: 2
---

# Dataset Import

## 1. Overview

The Dataset Import feature lets authorized users browse configured filesystem
paths, select a directory, and initiate a dataset import workflow through a
guided stepper UI.

Import sources are the filesystem locations the UI is allowed to browse. They
are stored in the database and managed by an administrator — the UI dynamically
fetches the list of sources and presents them in a dropdown, so no application
code or config changes are needed when a new source is added or an existing one
is changed.

---

## 2. Configuring Import Sources in Production

### 2.1 Create `import_sources.json`

In the `api/` directory, create a file named `import_sources.json` containing
a JSON array of import source objects.  The file is read by the seed script and
can be re-run at any time to add or update sources.

```json
[
  {
    "path": "/data/bioloop/genomics",
    "label": "Genomics Lab Drops",
    "description": "Instrument drop directory for the genomics lab",
    "sort_order": 1
  },
  {
    "path": "/data/bioloop/proteomics",
    "label": "Proteomics Lab Drops",
    "description": "Instrument drop directory for the proteomics lab",
    "sort_order": 2
  }
]
```

#### Field reference

| Field | Required | Description |
|---|---|---|
| `path` | **Yes** | Absolute path as shown in the UI.  Must be unique across all sources.  The API enforces this as an allowlist — only paths under a registered source can be browsed. |
| `label` | No | Human-readable name shown in the UI dropdown.  Defaults to the path if omitted. |
| `description` | No | Longer description of this source (not currently shown in the UI, reserved for future use). |
| `sort_order` | No | Integer; lower values appear first in the dropdown.  Sources with no sort order sort after those with one, then alphabetically by label. |
| `mounted_path` | No | The path at which this source is mounted **inside the API container**.  Only needed when the container mount point differs from `path`.  When omitted (or `null`), the API reads files directly from `path`.  See section 2.3 for examples of both cases. |

### 2.2 Run the seed script

From the `api/` directory:

```bash
node src/scripts/init_prod_import_sources.js
```

The script **upserts** — running it again with an updated `import_sources.json`
is safe.  Existing sources with matching `path` values will have their label,
description, and sort order updated.  Sources not present in the file are left
untouched.

### 2.3 Make the paths accessible to the API container

The API container must be able to read the directories listed in
`import_sources.json`.  In `docker-compose-prod.yml`, add a volume mount for
each import source under the `api` service:

```yaml
services:
  api:
    volumes:
      - /host/path/to/source:/container/path/to/source:ro
```

#### When the canonical path and the mount point are the same (most common)

Mount the directory at the same absolute path.  No extra configuration is
needed — omit `mounted_path` from `import_sources.json`:

```yaml
# docker-compose-prod.yml
- /data/bioloop/genomics:/data/bioloop/genomics:ro
```

```json
{ "path": "/data/bioloop/genomics", "label": "Genomics Lab Drops" }
```

#### When the mount point differs from the canonical path

If the filesystem must be mounted at a different path than the one shown in
the UI (e.g. a network share whose host path clashes with another path at the
mount point), set `mounted_path` in `import_sources.json` to the local mount
point:

```yaml
# docker-compose-prod.yml
- /data/bioloop/genomics:/opt/sca/imports/genomics:ro
```

```json
{
  "path": "/data/bioloop/genomics",
  "mounted_path": "/opt/sca/imports/genomics",
  "label": "Genomics Lab Drops"
}
```

The API reads files from `mounted_path` and exposes `path` to the UI.  No
environment variables are required for this translation.

---

## 3. Access Control

The import feature is role-gated.  The roles that can access it are configured
in `ui/src/config.js` under `enabledFeatures.import.enabledForRoles`.  Users
whose role is not in that list see a "feature currently disabled" alert instead
of the stepper.

The filesystem route enforces a server-side allowlist independent of the
UI role check: a path can only be browsed if it falls within a registered
`import_source`.  Requests for paths outside any registered source are rejected
with `403 Forbidden`.

---

## 4. How the File Typeahead Works

When a user types in the Dataset Path field:

1. The UI appends the typed text to the selected import source's path and sends
   it to `GET /fs?path=<full-path>&dirs_only=true`.
2. The API's `resolveImportSource` middleware checks that the requested path
   starts with a registered import source.  If not, the request is rejected.
3. The API translates the canonical path to the local mount point using
   `import_source.mounted_path` (falls back to `import_source.path` when null).
4. If the full path exists exactly, its contents are listed (trailing slash) or
   it is returned as the single match (no trailing slash).
5. If the exact path does not exist, the parent directory is listed and results
   are filtered by case-insensitive substring match on the typed portion.

This means typing a partial directory name filters the dropdown in real time
without requiring a separate search index.
