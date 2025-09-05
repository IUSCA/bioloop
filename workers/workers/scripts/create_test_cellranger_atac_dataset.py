#!/usr/bin/env python3
"""
Script to create a test Raw Data dataset for the cellranger-atac pipeline.

This script:
1. Checks if a dataset with the given name already exists
2. Creates a minimal but valid 10X Genomics ATAC-seq dataset structure for Cell Ranger ATAC
3. Places it in the origin/raw_data directory
4. Uses the --localcores=1 flag as a test argument

Usage:
    python create_test_cellranger_atac_dataset.py [dataset_name]

Requirements:
    - Run from within celery_worker container
    - API must be accessible
    - Proper permissions to write to /opt/sca/data/origin/raw_data
"""

import os
import sys
import json
import gzip
from pathlib import Path
from datetime import datetime

from workers.api import APIServerSession
from workers.config import config


def check_dataset_exists(api_session, dataset_name, dataset_type="raw_data"):
    """Check if a dataset with the given name already exists."""
    try:
        response = api_session.get(f"/datasets/{dataset_type}/{dataset_name}/exists")
        if response.status_code == 200:
            data = response.json()
            return data.get('exists', False)
        return False
    except Exception as e:
        print(f"Error checking dataset existence: {e}")
        return False


def create_cellranger_atac_dataset_structure(base_path, dataset_name):
    """Create a minimal but valid 10X Genomics ATAC-seq dataset structure for Cell Ranger ATAC."""
    
    # Create the main dataset directory
    dataset_path = base_path / dataset_name
    dataset_path.mkdir(parents=True, exist_ok=True)
    
    # Create the standard 10X Genomics structure for ATAC
    fastq_path = dataset_path / "fastqs"
    fastq_path.mkdir(parents=True, exist_ok=True)
    
    # Create sample subdirectory for ATAC data
    atac_sample_path = fastq_path / "Sample_ATAC"
    atac_sample_path.mkdir(exist_ok=True)
    
    # Create ATAC FASTQ files (R1 - cell barcode, R2 and R3 - genomic DNA)
    atac_r1_content = """@atac_test_read_1_1
AAACCTGAGAAGGCCT
+
IIIIIIIIIIIIIIII
@atac_test_read_1_2
AAACCTGAGCAATGGA
+
IIIIIIIIIIIIIIII
@atac_test_read_1_3
AAACCTGCACATTAGC
+
IIIIIIIIIIIIIIII
@atac_test_read_1_4
AAACCTGTCGAACGGA
+
IIIIIIIIIIIIIIII
"""
    
    atac_r1_file = atac_sample_path / "ATAC_S1_L001_R1_001.fastq.gz"
    with gzip.open(atac_r1_file, 'wt') as f:
        f.write(atac_r1_content)
    
    # R2 (genomic DNA fragment - forward read)
    atac_r2_content = """@atac_test_read_2_1
ATGCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATC
+
IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIII
@atac_test_read_2_2
CGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGAT
+
IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIII
@atac_test_read_2_3
GATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATC
+
IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIII
@atac_test_read_2_4
TCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGA
+
IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIII
"""
    
    atac_r2_file = atac_sample_path / "ATAC_S1_L001_R2_001.fastq.gz"
    with gzip.open(atac_r2_file, 'wt') as f:
        f.write(atac_r2_content)
    
    # R3 (genomic DNA fragment - reverse read)
    atac_r3_content = """@atac_test_read_3_1
CGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGAT
+
IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIII
@atac_test_read_3_2
GATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATC
+
IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIII
@atac_test_read_3_3
ATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCG
+
IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIII
@atac_test_read_3_4
TCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGA
+
IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIII
"""
    
    atac_r3_file = atac_sample_path / "ATAC_S1_L001_R3_001.fastq.gz"
    with gzip.open(atac_r3_file, 'wt') as f:
        f.write(atac_r3_content)
    
    # I1 (sample index for multiplexing)
    i1_content = """@atac_test_index_1_1
ACGTACGT
+
IIIIIIII
@atac_test_index_1_2
CGATCGAT
+
IIIIIIII
@atac_test_index_1_3
TGCATGCA
+
IIIIIIII
@atac_test_index_1_4
ATCGATCG
+
IIIIIIII
"""
    
    i1_file = atac_sample_path / "ATAC_S1_L001_I1_001.fastq.gz"
    with gzip.open(i1_file, 'wt') as f:
        f.write(i1_content)
    
    # Create Cell Ranger ATAC specific configuration
    config_content = """[chemistry]
# Cell Ranger ATAC chemistry
chemistry = ATAC

[library]
# ATAC-seq library configuration
expect-cells = 5000
min-fragments-per-cell = 1000

[atac]
# ATAC-seq specific settings
reference = refdata-cellranger-atac-GRCh38-1.2.0
peak-calling = true

[analysis]
# Analysis options for ATAC
max-clusters = 15
dimensionality-reduction = lsa,umap
motif-analysis = true

[sample]
# Sample information for ATAC
id = Test_ATAC
description = Test ATAC-seq sample for Cell Ranger ATAC
"""
    
    config_path = dataset_path / "cellranger_atac_config.txt"
    with open(config_path, 'w') as f:
        f.write(config_content)
    
    # Create metadata.json file
    metadata = {
        "dataset_name": dataset_name,
        "dataset_type": "raw_data",
        "created_at": datetime.now().isoformat(),
        "description": "Test dataset for cellranger-atac pipeline validation",
        "pipeline": "cellranger-atac",
        "test_flags": ["--localcores=1"],
        "structure": {
            "has_fastqs": True,
            "has_config": True,
            "samples": ["ATAC"],
            "library_type": "Chromatin Accessibility",
            "chemistry": "ATAC",
            "format_version": "cellranger_atac_compatible",
            "expected_cells": 5000,
            "min_fragments_per_cell": 1000,
            "is_atac_only": True,
            "features": ["peak-calling", "motif-analysis", "dimensionality-reduction"],
            "read_structure": "R1: cell barcode, R2+R3: paired-end genomic DNA, I1: sample index"
        }
    }
    
    metadata_path = dataset_path / "metadata.json"
    with open(metadata_path, 'w') as f:
        json.dump(metadata, f, indent=2)
    
    print(f"Created Cell Ranger ATAC dataset structure at: {dataset_path}")
    return dataset_path


def main():
    """Main function to create the test dataset."""
    
    # Get dataset name from command line or use default
    if len(sys.argv) > 1:
        dataset_name = sys.argv[1]
    else:
        dataset_name = f"test_cellranger_atac_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    
    print(f"Creating test Cell Ranger ATAC dataset: {dataset_name}")
    
    # Initialize API session
    try:
        api_session = APIServerSession()
        print("✓ API session initialized")
    except Exception as e:
        print(f"✗ Failed to initialize API session: {e}")
        sys.exit(1)
    
    # Check if dataset already exists
    print(f"Checking if dataset '{dataset_name}' already exists...")
    if check_dataset_exists(api_session, dataset_name):
        print(f"✗ Dataset '{dataset_name}' already exists. Please choose a different name.")
        sys.exit(1)
    else:
        print(f"✓ Dataset '{dataset_name}' does not exist. Proceeding...")
    
    # Define the origin directory path
    origin_path = Path("/opt/sca/data/origin/raw_data")
    
    if not origin_path.exists():
        print(f"✗ Origin directory does not exist: {origin_path}")
        print("Make sure you're running this from within the celery_worker container")
        sys.exit(1)
    
    print(f"✓ Origin directory found: {origin_path}")
    
    # Create the dataset structure
    try:
        dataset_path = create_cellranger_atac_dataset_structure(origin_path, dataset_name)
        print(f"✓ Successfully created test dataset at: {dataset_path}")
        
        # Print summary
        print("\n" + "="*70)
        print("CELL RANGER ATAC TEST DATASET CREATION COMPLETED")
        print("="*70)
        print(f"Dataset Name: {dataset_name}")
        print(f"Location: {dataset_path}")
        print(f"Type: Raw Data (ATAC-seq)")
        print(f"Pipeline: cellranger-atac")
        print(f"Test Flag: --localcores=1")
        print(f"Chemistry: ATAC")
        print("\nKey Features:")
        print("✓ ATAC-seq specific dataset (Chromatin Accessibility)")
        print("✓ Cell Ranger ATAC compatible structure")
        print("✓ ATAC chemistry specification")
        print("✓ Peak calling and motif analysis enabled")
        print("✓ Dimensionality reduction (LSA, UMAP)")
        print("✓ Fragment filtering options")
        print("\nDataset Structure:")
        print("├── fastqs/")
        print("│   └── Sample_ATAC/")
        print("│       ├── ATAC_S1_L001_R1_001.fastq.gz (cell barcodes)")
        print("│       ├── ATAC_S1_L001_R2_001.fastq.gz (genomic DNA forward)")
        print("│       ├── ATAC_S1_L001_R3_001.fastq.gz (genomic DNA reverse)")
        print("│       └── ATAC_S1_L001_I1_001.fastq.gz (sample index)")
        print("├── cellranger_atac_config.txt")
        print("└── metadata.json")
        print("\nThis dataset is compatible with Cell Ranger ATAC")
        print("and supports chromatin accessibility analysis.")
        
    except Exception as e:
        print(f"✗ Failed to create dataset: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()

