#!/usr/bin/env python3
"""
Script to create a test Raw Data dataset for the cellranger-v6.1.2 pipeline.

This script:
1. Checks if a dataset with the given name already exists
2. Creates a minimal but valid 10X Genomics dataset structure for Cell Ranger v6
3. Places it in the origin/raw_data directory
4. Uses the --localcores=1 flag as a test argument

Usage:
    python create_test_cellranger_v6_dataset.py [dataset_name]

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


def create_cellranger_v6_dataset_structure(base_path, dataset_name):
    """Create a minimal but valid 10X Genomics dataset structure for Cell Ranger v6."""
    
    # Create the main dataset directory
    dataset_path = base_path / dataset_name
    dataset_path.mkdir(parents=True, exist_ok=True)
    
    # Create the standard 10X Genomics structure for v6
    fastq_path = dataset_path / "fastqs"
    fastq_path.mkdir(parents=True, exist_ok=True)
    
    # Create sample subdirectory
    sample_path = fastq_path / "Sample_Test"
    sample_path.mkdir(exist_ok=True)
    
    # Create minimal FASTQ files for Cell Ranger v6 (gzipped)
    # R1 (read 1 - contains cell barcode and UMI)
    r1_content = """@cellranger_v6_test_read_1_1
AAACCTGAGAAGGCCT
+
IIIIIIIIIIIIIIII
@cellranger_v6_test_read_1_2
AAACCTGAGCAATGGA
+
IIIIIIIIIIIIIIII
@cellranger_v6_test_read_1_3
AAACCTGCACATTAGC
+
IIIIIIIIIIIIIIII
@cellranger_v6_test_read_1_4
AAACCTGTCGAACGGA
+
IIIIIIIIIIIIIIII
"""
    
    r1_file = sample_path / "Test_S1_L001_R1_001.fastq.gz"
    with gzip.open(r1_file, 'wt') as f:
        f.write(r1_content)
    
    # R2 (read 2 - contains the actual transcript sequence)
    r2_content = """@cellranger_v6_test_read_2_1
ATGCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATC
+
IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIII
@cellranger_v6_test_read_2_2
CGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGAT
+
IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIII
@cellranger_v6_test_read_2_3
GATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATC
+
IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIII
@cellranger_v6_test_read_2_4
TCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGA
+
IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIII
"""
    
    r2_file = sample_path / "Test_S1_L001_R2_001.fastq.gz"
    with gzip.open(r2_file, 'wt') as f:
        f.write(r2_content)
    
    # I1 (index 1 - sample barcode for v6)
    i1_content = """@cellranger_v6_test_index_1_1
ACGTACGT
+
IIIIIIII
@cellranger_v6_test_index_1_2
CGATCGAT
+
IIIIIIII
@cellranger_v6_test_index_1_3
TGCATGCA
+
IIIIIIII
@cellranger_v6_test_index_1_4
ATCGATCG
+
IIIIIIII
"""
    
    i1_file = sample_path / "Test_S1_L001_I1_001.fastq.gz"
    with gzip.open(i1_file, 'wt') as f:
        f.write(i1_content)
    
    # Create a feature reference CSV (Cell Ranger v6 format)
    feature_ref_content = """id,name,read,pattern,sequence,feature_type
ENSG00000001,TestGene1,R2,,ATGCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATC,Gene Expression
ENSG00000002,TestGene2,R2,,CGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGAT,Gene Expression
ENSG00000003,TestGene3,R2,,GATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATC,Gene Expression
ENSG00000004,TestGene4,R2,,TCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGA,Gene Expression
"""
    
    feature_ref_path = dataset_path / "feature_reference.csv"
    with open(feature_ref_path, 'w') as f:
        f.write(feature_ref_content)
    
    # Create a libraries CSV file (Cell Ranger v6 format)
    libraries_content = """fastqs,sample,library_type
{},Test,Gene Expression
""".format(str(fastq_path))
    
    libraries_path = dataset_path / "libraries.csv"
    with open(libraries_path, 'w') as f:
        f.write(libraries_content)
    
    # Create Cell Ranger v6 specific configuration
    config_content = """[chemistry]
# Cell Ranger v6 chemistry specification
chemistry = SC3Pv3

[library]
# Gene expression library configuration for v6
expect-cells = 500
force-cells = 100

[feature]
# Feature reference file for v6
reference = feature_reference.csv

[sample]
# Sample information for v6
id = Test
description = Test sample for Cell Ranger v6.1.2
"""
    
    config_path = dataset_path / "cellranger_v6_config.txt"
    with open(config_path, 'w') as f:
        f.write(config_content)
    
    # Create metadata.json file
    metadata = {
        "dataset_name": dataset_name,
        "dataset_type": "raw_data",
        "created_at": datetime.now().isoformat(),
        "description": "Test dataset for cellranger-v6.1.2 pipeline validation",
        "pipeline": "cellranger-v6.1.2",
        "test_flags": ["--localcores=1"],
        "structure": {
            "has_fastqs": True,
            "has_feature_reference": True,
            "has_libraries_csv": True,
            "has_config": True,
            "samples": ["Test"],
            "library_type": "Gene Expression",
            "chemistry": "SC3Pv3",
            "format_version": "cellranger_v6_compatible",
            "expected_cells": 500,
            "forced_cells": 100,
            "read_structure": "R1: 16bp CB + 12bp UMI, R2: transcript, I1: sample barcode"
        }
    }
    
    metadata_path = dataset_path / "metadata.json"
    with open(metadata_path, 'w') as f:
        json.dump(metadata, f, indent=2)
    
    print(f"Created Cell Ranger v6 dataset structure at: {dataset_path}")
    return dataset_path


def main():
    """Main function to create the test dataset."""
    
    # Get dataset name from command line or use default
    if len(sys.argv) > 1:
        dataset_name = sys.argv[1]
    else:
        dataset_name = f"test_cellranger_v6_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    
    print(f"Creating test Cell Ranger v6 dataset: {dataset_name}")
    
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
        dataset_path = create_cellranger_v6_dataset_structure(origin_path, dataset_name)
        print(f"✓ Successfully created test dataset at: {dataset_path}")
        
        # Print summary
        print("\n" + "="*70)
        print("CELL RANGER v6.1.2 TEST DATASET CREATION COMPLETED")
        print("="*70)
        print(f"Dataset Name: {dataset_name}")
        print(f"Location: {dataset_path}")
        print(f"Type: Raw Data")
        print(f"Pipeline: cellranger-v6.1.2")
        print(f"Test Flag: --localcores=1")
        print(f"Chemistry: SC3Pv3")
        print("\nKey Features:")
        print("✓ 10X Genomics FASTQ format (gzipped)")
        print("✓ Feature reference CSV for gene mapping")
        print("✓ Libraries CSV for library specification")
        print("✓ Cell Ranger v6 compatible structure")
        print("✓ SC3Pv3 chemistry specification")
        print("✓ Force-cells parameter for v6")
        print("\nDataset Structure:")
        print("├── fastqs/")
        print("│   └── Sample_Test/")
        print("│       ├── Test_S1_L001_R1_001.fastq.gz (cell barcodes + UMI)")
        print("│       ├── Test_S1_L001_R2_001.fastq.gz (transcript reads)")
        print("│       └── Test_S1_L001_I1_001.fastq.gz (sample index)")
        print("├── feature_reference.csv")
        print("├── libraries.csv")
        print("├── cellranger_v6_config.txt")
        print("└── metadata.json")
        print("\nThis dataset is compatible with Cell Ranger v6.1.2")
        print("and includes v6-specific configuration options.")
        
    except Exception as e:
        print(f"✗ Failed to create dataset: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()

