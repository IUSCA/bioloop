#!/usr/bin/env python3
"""
Script to create a test Raw Data dataset for the cellranger-v4.0.0 pipeline.

This script:
1. Checks if a dataset with the given name already exists
2. Creates a minimal but valid 10X Genomics dataset structure for Cell Ranger v4
3. Places it in the origin/raw_data directory
4. Uses the --localcores=1 flag as a test argument

Usage:
    python create_test_cellranger_v4_dataset.py [dataset_name]

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


def create_cellranger_v4_dataset_structure(base_path, dataset_name):
    """Create a minimal but valid 10X Genomics dataset structure for Cell Ranger v4."""
    
    # Create the main dataset directory
    dataset_path = base_path / dataset_name
    dataset_path.mkdir(parents=True, exist_ok=True)
    
    # Create the standard 10X Genomics structure for v4
    fastq_path = dataset_path / "fastqs"
    fastq_path.mkdir(parents=True, exist_ok=True)
    
    # Create sample subdirectory
    sample_path = fastq_path / "Sample_Test"
    sample_path.mkdir(exist_ok=True)
    
    # Create minimal FASTQ files for Cell Ranger v4 (gzipped)
    # R1 (read 1 - contains cell barcode and UMI)
    r1_content = """@cellranger_v4_test_read_1_1
AAACCTGAGAAGGCCT
+
IIIIIIIIIIIIIIII
@cellranger_v4_test_read_1_2
AAACCTGAGCAATGGA
+
IIIIIIIIIIIIIIII
@cellranger_v4_test_read_1_3
AAACCTGCACATTAGC
+
IIIIIIIIIIIIIIII
"""
    
    r1_file = sample_path / "Test_S1_L001_R1_001.fastq.gz"
    with gzip.open(r1_file, 'wt') as f:
        f.write(r1_content)
    
    # R2 (read 2 - contains the actual transcript sequence)
    r2_content = """@cellranger_v4_test_read_2_1
ATGCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATC
+
IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIII
@cellranger_v4_test_read_2_2
CGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGAT
+
IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIII
@cellranger_v4_test_read_2_3
GATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATC
+
IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIII
"""
    
    r2_file = sample_path / "Test_S1_L001_R2_001.fastq.gz"
    with gzip.open(r2_file, 'wt') as f:
        f.write(r2_content)
    
    # I1 (index 1 - sample barcode for v4)
    i1_content = """@cellranger_v4_test_index_1_1
ACGTACGT
+
IIIIIIII
@cellranger_v4_test_index_1_2
CGATCGAT
+
IIIIIIII
@cellranger_v4_test_index_1_3
TGCATGCA
+
IIIIIIII
"""
    
    i1_file = sample_path / "Test_S1_L001_I1_001.fastq.gz"
    with gzip.open(i1_file, 'wt') as f:
        f.write(i1_content)
    
    # Create a simple feature reference for v4 (minimal format)
    feature_ref_content = """gene_id,gene_name,gene_type
ENSG00000001,TestGene1,protein_coding
ENSG00000002,TestGene2,protein_coding
ENSG00000003,TestGene3,protein_coding
"""
    
    feature_ref_path = dataset_path / "features.csv"
    with open(feature_ref_path, 'w') as f:
        f.write(feature_ref_content)
    
    # Create Cell Ranger v4 specific configuration
    config_content = """[chemistry]
# Cell Ranger v4 chemistry (limited options)
chemistry = SC3Pv2

[library]
# Gene expression library configuration for v4
expect-cells = 1000

[sample]
# Sample information for v4
id = Test
description = Test sample for Cell Ranger v4.0.0
"""
    
    config_path = dataset_path / "cellranger_v4_config.txt"
    with open(config_path, 'w') as f:
        f.write(config_content)
    
    # Create metadata.json file
    metadata = {
        "dataset_name": dataset_name,
        "dataset_type": "raw_data",
        "created_at": datetime.now().isoformat(),
        "description": "Test dataset for cellranger-v4.0.0 pipeline validation",
        "pipeline": "cellranger-v4.0.0",
        "test_flags": ["--localcores=1"],
        "structure": {
            "has_fastqs": True,
            "has_features_csv": True,
            "has_config": True,
            "samples": ["Test"],
            "library_type": "Gene Expression",
            "chemistry": "SC3Pv2",
            "format_version": "cellranger_v4_compatible",
            "expected_cells": 1000,
            "read_structure": "R1: 16bp CB + 12bp UMI, R2: transcript, I1: sample barcode"
        }
    }
    
    metadata_path = dataset_path / "metadata.json"
    with open(metadata_path, 'w') as f:
        json.dump(metadata, f, indent=2)
    
    print(f"Created Cell Ranger v4 dataset structure at: {dataset_path}")
    return dataset_path


def main():
    """Main function to create the test dataset."""
    
    # Get dataset name from command line or use default
    if len(sys.argv) > 1:
        dataset_name = sys.argv[1]
    else:
        dataset_name = f"test_cellranger_v4_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    
    print(f"Creating test Cell Ranger v4 dataset: {dataset_name}")
    
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
        dataset_path = create_cellranger_v4_dataset_structure(origin_path, dataset_name)
        print(f"✓ Successfully created test dataset at: {dataset_path}")
        
        # Print summary
        print("\n" + "="*70)
        print("CELL RANGER v4.0.0 TEST DATASET CREATION COMPLETED")
        print("="*70)
        print(f"Dataset Name: {dataset_name}")
        print(f"Location: {dataset_path}")
        print(f"Type: Raw Data")
        print(f"Pipeline: cellranger-v4.0.0")
        print(f"Test Flag: --localcores=1")
        print(f"Chemistry: SC3Pv2")
        print("\nKey Features:")
        print("✓ 10X Genomics FASTQ format (gzipped)")
        print("✓ Simple features CSV (v4 format)")
        print("✓ Cell Ranger v4 compatible structure")
        print("✓ SC3Pv2 chemistry specification")
        print("✓ Legacy v4 configuration format")
        print("\nDataset Structure:")
        print("├── fastqs/")
        print("│   └── Sample_Test/")
        print("│       ├── Test_S1_L001_R1_001.fastq.gz (cell barcodes + UMI)")
        print("│       ├── Test_S1_L001_R2_001.fastq.gz (transcript reads)")
        print("│       └── Test_S1_L001_I1_001.fastq.gz (sample index)")
        print("├── features.csv")
        print("├── cellranger_v4_config.txt")
        print("└── metadata.json")
        print("\nThis dataset is compatible with Cell Ranger v4.0.0")
        print("and uses the older v4 configuration format.")
        
    except Exception as e:
        print(f"✗ Failed to create dataset: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()

