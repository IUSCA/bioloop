# Datasets Feature

**Feature Scope:** Core data management for raw data and data products in the Bioloop platform.

**Status:** Core Platform Feature

---

## Overview

Datasets are the fundamental data organization unit in Bioloop. They represent collections of files with associated metadata.

---

## Dataset Types

### raw_data
- **Purpose:** Original, unprocessed data files
- **Examples:** FASTQ files from sequencers, raw images, instrument output
- **Characteristics:**
  - Cannot be derived from other datasets
  - Input to workflows and conversions
  - Typically large file sizes

### data_product
- **Purpose:** Processed, analysis-ready data files
- **Examples:** BAM files, VCF files, BigWig files, analysis results
- **Characteristics:**
  - Derived from raw_data or other data_products
  - Output from workflows and conversions
  - May have genomic attributes (genome type, genome value)

---

## Database Schema

### dataset
```prisma
model dataset {
  id                       Int                          @id @default(autoincrement())
  name                     String
  type                     String                       // "raw_data", "data_product"
  is_staged                Boolean                      @default(false)
  metadata                 Json?                        // {stage_alias: "path/to/staged"}
  files                    dataset_file[]
  genomic_details          dataset_genomic_attributes?
  user_id                  Int
  user                     user                         @relation(fields: [user_id], references: [id])
  projects                 project_dataset[]
}
```

### dataset_file
```prisma
model dataset_file {
  id         Int      @id @default(autoincrement())
  path       String   // Relative path within dataset
  name       String?
  size       BigInt?
  filetype   String?  // e.g., "BAM", "BIGWIG", "FASTQ"
  dataset_id Int
  dataset    dataset  @relation(fields: [dataset_id], references: [id], onDelete: Cascade)
}
```

### dataset_genomic_attributes
```prisma
model dataset_genomic_attributes {
  dataset_id   Int     @id
  dataset      dataset @relation(fields: [dataset_id], references: [id], onDelete: Cascade)
  genome_type  String? // e.g., "human", "mouse"
  genome_value String? // e.g., "hg38", "mm10"
}
```

---

## Staging and Archival

### Staging
- **Purpose:** Make files accessible for processing and serving
- **Process:** Copy files from storage to staging area
- **Status:** `is_staged = true` when complete
- **Metadata:** `stage_alias` contains path to staged files

### Archival
- **Purpose:** Remove staged files to free up space
- **Process:** Delete files from staging area
- **Status:** `is_staged = false` when complete
- **Constraint:** Cannot archive if dataset is in active use

---

## API Endpoints

- `GET /datasets` - List datasets
- `GET /datasets/:id` - Get dataset details
- `POST /datasets` - Create new dataset
- `PUT /datasets/:id` - Update dataset
- `DELETE /datasets/:id` - Delete dataset
- `POST /datasets/:id/stage` - Stage dataset files
- `POST /datasets/:id/archive` - Archive staged files

---

## Key Patterns

### Dataset Creation
1. User uploads files or submits metadata
2. System creates dataset record
3. System creates dataset_file records for each file
4. Optional: Add genomic_details if applicable
5. Link to project(s) via project_dataset

### File Path Construction
- Absolute path: `data_root + stage_alias + file.path`
- Relative path: `stage_alias + file.path`
- Used for serving files via API

---

**Last Updated:** 2026-01-16

