#!/usr/bin/env python3
"""
Script to create a test Raw Data dataset for the cellranger-arc-v2 pipeline.

This script:
1. Checks if a dataset with the given name already exists
2. Creates a minimal but valid 10X Genomics multiome dataset structure for Cell Ranger ARC v2
3. Places it in the origin/raw_data directory
4. Uses the --localcores=1 flag as a test argument

Usage:
    python create_test_cellranger_arc_v2_dataset.py [dataset_name]

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


def create_cellranger_arc_v2_dataset_structure(base_path, dataset_name):
    """Create a minimal but valid 10X Genomics multiome dataset structure for Cell Ranger ARC v2."""
    
    # Create the main dataset directory
    dataset_path = base_path / dataset_name
    dataset_path.mkdir(parents=True, exist_ok=True)
    
    # Create the standard 10X Genomics structure for ARC v2
    fastq_path = dataset_path / "fastqs"
    fastq_path.mkdir(parents=True, exist_ok=True)
    
    # Create sample subdirectory for GEX data
    gex_sample_path = fastq_path / "Sample_GEX_v2"
    gex_sample_path.mkdir(exist_ok=True)
    
    # Create sample subdirectory for ATAC data
    atac_sample_path = fastq_path / "Sample_ATAC_v2"
    atac_sample_path.mkdir(exist_ok=True)
    
    # Create GEX FASTQ files (Gene Expression) for v2
    gex_r1_content = """@arc_v2_gex_test_read_1_1
AAACCTGAGAAGGCCT
+
IIIIIIIIIIIIIIII
@arc_v2_gex_test_read_1_2
AAACCTGAGCAATGGA
+
IIIIIIIIIIIIIIII
@arc_v2_gex_test_read_1_3
AAACCTGCACATTAGC
+
IIIIIIIIIIIIIIII
"""
    
    gex_r1_file = gex_sample_path / "GEX_v2_S1_L001_R1_001.fastq.gz"
    with gzip.open(gex_r1_file, 'wt') as f:
        f.write(gex_r1_content)
    
    gex_r2_content = """@arc_v2_gex_test_read_2_1
ATGCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATC
+
IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIII
@arc_v2_gex_test_read_2_2
CGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGAT
+
IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIII
@arc_v2_gex_test_read_2_3
GATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATC
+
IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIII
"""
    
    gex_r2_file = gex_sample_path / "GEX_v2_S1_L001_R2_001.fastq.gz"
    with gzip.open(gex_r2_file, 'wt') as f:
        f.write(gex_r2_content)
    
    # Create ATAC FASTQ files (Chromatin Accessibility) for v2
    atac_r1_content = """@arc_v2_atac_test_read_1_1
AAACCTGAGAAGGCCT
+
IIIIIIIIIIIIIIII
@arc_v2_atac_test_read_1_2
AAACCTGAGCAATGGA
+
IIIIIIIIIIIIIIII
@arc_v2_atac_test_read_1_3
AAACCTGCACATTAGC
+
IIIIIIIIIIIIIIII
"""
    
    atac_r1_file = atac_sample_path / "ATAC_v2_S2_L001_R1_001.fastq.gz"
    with gzip.open(atac_r1_file, 'wt') as f:
        f.write(atac_r1_content)
    
    atac_r2_content = """@arc_v2_atac_test_read_2_1
ATGCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATC
+
IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIII
@arc_v2_atac_test_read_2_2
CGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGAT
+
IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIII
@arc_v2_atac_test_read_2_3
GATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATC
+
IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIII
"""
    
    atac_r2_file = atac_sample_path / "ATAC_v2_S2_L001_R2_001.fastq.gz"
    with gzip.open(atac_r2_file, 'wt') as f:
        f.write(atac_r2_content)
    
    atac_r3_content = """@arc_v2_atac_test_read_3_1
GATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATC
+
IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIII
@arc_v2_atac_test_read_3_2
TCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGA
+
IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIII
@arc_v2_atac_test_read_3_3
CGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGAT
+
IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIII
"""
    
    atac_r3_file = atac_sample_path / "ATAC_v2_S2_L001_R3_001.fastq.gz"
    with gzip.open(atac_r3_file, 'wt') as f:
        f.write(atac_r3_content)
    
    # Create libraries CSV file for ARC v2 (enhanced multimodal format)
    libraries_content = """fastqs,sample,library_type
{},GEX_v2,Gene Expression
{},ATAC_v2,Chromatin Accessibility
""".format(str(fastq_path), str(fastq_path))
    
    libraries_path = dataset_path / "libraries.csv"
    with open(libraries_path, 'w') as f:
        f.write(libraries_content)
    
    # Create Cell Ranger ARC v2 specific configuration
    config_content = """[chemistry]
# Cell Ranger ARC v2 chemistry (enhanced multiome)
chemistry = ARC-v2

[library]
# Enhanced multiome library configuration for v2
expect-cells = 10000
introns = include
include-introns = true

[gex]
# Gene expression specific settings for v2
reference = refdata-cellranger-arc-GRCh38-2020-A-2.0.0
create-bam = true

[atac]
# ATAC-seq specific settings for v2
reference = refdata-cellranger-arc-GRCh38-2020-A-2.0.0
min-fragments = 1000

[analysis]
# Enhanced analysis options for v2
max-clusters = 20
dimensionality-reduction = umap,tsne

[sample]
# Sample information for ARC v2
id = Test_Multiome_v2
description = Test multiome sample for Cell Ranger ARC v2
"""
    
    config_path = dataset_path / "cellranger_arc_v2_config.txt"
    with open(config_path, 'w') as f:
        f.write(config_content)
    
    # Create metadata.json file
    metadata = {
        "dataset_name": dataset_name,
        "dataset_type": "raw_data",
        "created_at": datetime.now().isoformat(),
        "description": "Test dataset for cellranger-arc-v2 pipeline validation",
        "pipeline": "cellranger-arc-v2",
        "test_flags": ["--localcores=1"],
        "structure": {
            "has_fastqs": True,
            "has_libraries_csv": True,
            "has_config": True,
            "samples": ["GEX_v2", "ATAC_v2"],
            "library_types": ["Gene Expression", "Chromatin Accessibility"],
            "chemistry": "ARC-v2",
            "format_version": "cellranger_arc_v2_compatible",
            "expected_cells": 10000,
            "is_multiome": True,
            "enhanced_features": ["create-bam", "min-fragments", "max-clusters", "dimensionality-reduction"],
            "read_structure": "GEX: R1+R2, ATAC: R1+R2+R3"
        }
    }
    
    metadata_path = dataset_path / "metadata.json"
    with open(metadata_path, 'w') as f:
        json.dump(metadata, f, indent=2)
    
    print(f"Created Cell Ranger ARC v2 dataset structure at: {dataset_path}")
    return dataset_path


def main():
    """Main function to create the test dataset."""
    
    # Get dataset name from command line or use default
    if len(sys.argv) > 1:
        dataset_name = sys.argv[1]
    else:
        dataset_name = f"test_cellranger_arc_v2_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    
    print(f"Creating test Cell Ranger ARC v2 dataset: {dataset_name}")
    
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
        dataset_path = create_cellranger_arc_v2_dataset_structure(origin_path, dataset_name)
        print(f"✓ Successfully created test dataset at: {dataset_path}")
        
        # Print summary
        print("\n" + "="*70)
        print("CELL RANGER ARC v2 TEST DATASET CREATION COMPLETED")
        print("="*70)
        print(f"Dataset Name: {dataset_name}")
        print(f"Location: {dataset_path}")
        print(f"Type: Raw Data (Enhanced Multiome)")
        print(f"Pipeline: cellranger-arc-v2")
        print(f"Test Flag: --localcores=1")
        print(f"Chemistry: ARC-v2")
        print("\nKey Features:")
        print("✓ Enhanced multiome dataset (Gene Expression + Chromatin Accessibility)")
        print("✓ Libraries CSV for advanced multimodal data")
        print("✓ Cell Ranger ARC v2 compatible structure")
        print("✓ ARC-v2 chemistry specification")
        print("✓ Enhanced analysis options (clustering, dimensionality reduction)")
        print("✓ BAM output and fragment filtering options")
        print("\nDataset Structure:")
        print("├── fastqs/")
        print("│   ├── Sample_GEX_v2/")
        print("│   │   ├── GEX_v2_S1_L001_R1_001.fastq.gz")
        print("│   │   └── GEX_v2_S1_L001_R2_001.fastq.gz")
        print("│   └── Sample_ATAC_v2/")
        print("│       ├── ATAC_v2_S2_L001_R1_001.fastq.gz")
        print("│       ├── ATAC_v2_S2_L001_R2_001.fastq.gz")
        print("│       └── ATAC_v2_S2_L001_R3_001.fastq.gz")
        print("├── libraries.csv")
        print("├── cellranger_arc_v2_config.txt")
        print("└── metadata.json")
        print("\nThis dataset is compatible with Cell Ranger ARC v2")
        print("and supports enhanced multiome (GEX + ATAC) analysis with v2 features.")
        
    except Exception as e:
        print(f"✗ Failed to create dataset: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()

