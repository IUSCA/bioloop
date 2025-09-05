#!/usr/bin/env python3
"""
Script to create a test Raw Data dataset for the cellranger-arc pipeline.

This script:
1. Checks if a dataset with the given name already exists
2. Creates a minimal but valid 10X Genomics multiome dataset structure for Cell Ranger ARC
3. Places it in the origin/raw_data directory
4. Uses the --localcores=1 flag as a test argument

Usage:
    python create_test_cellranger_arc_dataset.py [dataset_name]

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


def create_cellranger_arc_dataset_structure(base_path, dataset_name):
    """Create a minimal but valid 10X Genomics multiome dataset structure for Cell Ranger ARC."""
    
    # Create the main dataset directory
    dataset_path = base_path / dataset_name
    dataset_path.mkdir(parents=True, exist_ok=True)
    
    # Create the standard 10X Genomics structure for ARC
    fastq_path = dataset_path / "fastqs"
    fastq_path.mkdir(parents=True, exist_ok=True)
    
    # Create sample subdirectory for GEX data
    gex_sample_path = fastq_path / "Sample_GEX"
    gex_sample_path.mkdir(exist_ok=True)
    
    # Create sample subdirectory for ATAC data
    atac_sample_path = fastq_path / "Sample_ATAC"
    atac_sample_path.mkdir(exist_ok=True)
    
    # Create GEX FASTQ files (Gene Expression)
    gex_r1_content = """@arc_gex_test_read_1_1
AAACCTGAGAAGGCCT
+
IIIIIIIIIIIIIIII
@arc_gex_test_read_1_2
AAACCTGAGCAATGGA
+
IIIIIIIIIIIIIIII
"""
    
    gex_r1_file = gex_sample_path / "GEX_S1_L001_R1_001.fastq.gz"
    with gzip.open(gex_r1_file, 'wt') as f:
        f.write(gex_r1_content)
    
    gex_r2_content = """@arc_gex_test_read_2_1
ATGCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATC
+
IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIII
@arc_gex_test_read_2_2
CGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGAT
+
IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIII
"""
    
    gex_r2_file = gex_sample_path / "GEX_S1_L001_R2_001.fastq.gz"
    with gzip.open(gex_r2_file, 'wt') as f:
        f.write(gex_r2_content)
    
    # Create ATAC FASTQ files (Chromatin Accessibility)
    atac_r1_content = """@arc_atac_test_read_1_1
AAACCTGAGAAGGCCT
+
IIIIIIIIIIIIIIII
@arc_atac_test_read_1_2
AAACCTGAGCAATGGA
+
IIIIIIIIIIIIIIII
"""
    
    atac_r1_file = atac_sample_path / "ATAC_S2_L001_R1_001.fastq.gz"
    with gzip.open(atac_r1_file, 'wt') as f:
        f.write(atac_r1_content)
    
    atac_r2_content = """@arc_atac_test_read_2_1
ATGCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATC
+
IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIII
@arc_atac_test_read_2_2
CGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGAT
+
IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIII
"""
    
    atac_r2_file = atac_sample_path / "ATAC_S2_L001_R2_001.fastq.gz"
    with gzip.open(atac_r2_file, 'wt') as f:
        f.write(atac_r2_content)
    
    atac_r3_content = """@arc_atac_test_read_3_1
GATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATC
+
IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIII
@arc_atac_test_read_3_2
TCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGA
+
IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIII
"""
    
    atac_r3_file = atac_sample_path / "ATAC_S2_L001_R3_001.fastq.gz"
    with gzip.open(atac_r3_file, 'wt') as f:
        f.write(atac_r3_content)
    
    # Create libraries CSV file for ARC (multimodal)
    libraries_content = """fastqs,sample,library_type
{},GEX,Gene Expression
{},ATAC,Chromatin Accessibility
""".format(str(fastq_path), str(fastq_path))
    
    libraries_path = dataset_path / "libraries.csv"
    with open(libraries_path, 'w') as f:
        f.write(libraries_content)
    
    # Create Cell Ranger ARC specific configuration
    config_content = """[chemistry]
# Cell Ranger ARC chemistry (multiome)
chemistry = ARC-v1

[library]
# Multiome library configuration
expect-cells = 5000
introns = include

[gex]
# Gene expression specific settings
reference = refdata-cellranger-arc-GRCh38-2020-A-2.0.0

[atac]
# ATAC-seq specific settings
reference = refdata-cellranger-arc-GRCh38-2020-A-2.0.0

[sample]
# Sample information for ARC
id = Test_Multiome
description = Test multiome sample for Cell Ranger ARC
"""
    
    config_path = dataset_path / "cellranger_arc_config.txt"
    with open(config_path, 'w') as f:
        f.write(config_content)
    
    # Create metadata.json file
    metadata = {
        "dataset_name": dataset_name,
        "dataset_type": "raw_data",
        "created_at": datetime.now().isoformat(),
        "description": "Test dataset for cellranger-arc pipeline validation",
        "pipeline": "cellranger-arc",
        "test_flags": ["--localcores=1"],
        "structure": {
            "has_fastqs": True,
            "has_libraries_csv": True,
            "has_config": True,
            "samples": ["GEX", "ATAC"],
            "library_types": ["Gene Expression", "Chromatin Accessibility"],
            "chemistry": "ARC-v1",
            "format_version": "cellranger_arc_compatible",
            "expected_cells": 5000,
            "is_multiome": True,
            "read_structure": "GEX: R1+R2, ATAC: R1+R2+R3"
        }
    }
    
    metadata_path = dataset_path / "metadata.json"
    with open(metadata_path, 'w') as f:
        json.dump(metadata, f, indent=2)
    
    print(f"Created Cell Ranger ARC dataset structure at: {dataset_path}")
    return dataset_path


def main():
    """Main function to create the test dataset."""
    
    # Get dataset name from command line or use default
    if len(sys.argv) > 1:
        dataset_name = sys.argv[1]
    else:
        dataset_name = f"test_cellranger_arc_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    
    print(f"Creating test Cell Ranger ARC dataset: {dataset_name}")
    
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
        dataset_path = create_cellranger_arc_dataset_structure(origin_path, dataset_name)
        print(f"✓ Successfully created test dataset at: {dataset_path}")
        
        # Print summary
        print("\n" + "="*70)
        print("CELL RANGER ARC TEST DATASET CREATION COMPLETED")
        print("="*70)
        print(f"Dataset Name: {dataset_name}")
        print(f"Location: {dataset_path}")
        print(f"Type: Raw Data (Multiome)")
        print(f"Pipeline: cellranger-arc")
        print(f"Test Flag: --localcores=1")
        print(f"Chemistry: ARC-v1")
        print("\nKey Features:")
        print("✓ Multiome dataset (Gene Expression + Chromatin Accessibility)")
        print("✓ Libraries CSV for multimodal data")
        print("✓ Cell Ranger ARC compatible structure")
        print("✓ ARC-v1 chemistry specification")
        print("✓ Separate GEX and ATAC samples")
        print("\nDataset Structure:")
        print("├── fastqs/")
        print("│   ├── Sample_GEX/")
        print("│   │   ├── GEX_S1_L001_R1_001.fastq.gz")
        print("│   │   └── GEX_S1_L001_R2_001.fastq.gz")
        print("│   └── Sample_ATAC/")
        print("│       ├── ATAC_S2_L001_R1_001.fastq.gz")
        print("│       ├── ATAC_S2_L001_R2_001.fastq.gz")
        print("│       └── ATAC_S2_L001_R3_001.fastq.gz")
        print("├── libraries.csv")
        print("├── cellranger_arc_config.txt")
        print("└── metadata.json")
        print("\nThis dataset is compatible with Cell Ranger ARC")
        print("and supports multiome (GEX + ATAC) analysis.")
        
    except Exception as e:
        print(f"✗ Failed to create dataset: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()

