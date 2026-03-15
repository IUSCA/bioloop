# Database & Prisma Patterns

## Prisma Schema Conventions

**Model naming:**
- Use `snake_case` for model names (matches PostgreSQL convention)
- Use `snake_case` for field names
- Use descriptive relation names

```prisma
model project {
  id           Int               @id @default(autoincrement())
  name         String
  description  String?
  datasets     project_dataset[]
  members      project_member[]
}

model project_dataset {
  id         Int     @id @default(autoincrement())
  project_id Int
  dataset_id Int
  project    project @relation(fields: [project_id], references: [id])
  dataset    dataset @relation(fields: [dataset_id], references: [id])

  @@unique([project_id, dataset_id])
}
```

---

## Cascade Delete Patterns

Use `onDelete: Cascade` for dependent data:

```prisma
model dataset_file {
  id         Int      @id @default(autoincrement())
  path       String
  dataset_id Int
  dataset    dataset  @relation(fields: [dataset_id], references: [id], onDelete: Cascade)
}
```

---

## JSON Field Usage

Use `Json` type for flexible metadata:

```prisma
model dataset {
  metadata Json? // { stage_alias: "path/to/staged", custom_key: "value" }
}
```

Access in code:
```javascript
const stageAlias = dataset.metadata?.stage_alias || '';
```

---

## Shared Prisma Includes as Constants

**DO THIS:**
```javascript
// api/src/constants/prismaIncludes.js
export const INCLUDES = {
  DATASET_WITH_FILES: {
    files: true,
    genomic_details: true,
  },
  PROJECT_WITH_DATASETS: {
    datasets: {
      include: {
        dataset: {
          include: { files: true },
        },
      },
    },
  },
};

// In route file
const dataset = await prisma.dataset.findUnique({
  where: { id: datasetId },
  include: INCLUDES.DATASET_WITH_FILES,
});
```

**NOT THIS:**
```javascript
// Repeating the same include in multiple route files
const dataset = await prisma.dataset.findUnique({
  where: { id: datasetId },
  include: {
    files: true,
    genomic_details: true,
  }
});
```

---

**Last Updated:** 2026-01-16
