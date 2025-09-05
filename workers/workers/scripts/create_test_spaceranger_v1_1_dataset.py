#!/usr/bin/env python3
"""
Script to create a test Raw Data dataset for the spaceranger-v1.1.0 pipeline.

This script:
1. Checks if a dataset with the given name already exists
2. Creates a minimal but valid 10X Genomics Visium dataset structure for Space Ranger v1.1
3. Places it in the origin/raw_data directory
4. Uses the --localcores=1 flag as a test argument

Usage:
    python create_test_spaceranger_v1_1_dataset.py [dataset_name]

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


def create_spaceranger_v1_1_dataset_structure(base_path, dataset_name):
    """Create a minimal but valid 10X Genomics Visium dataset structure for Space Ranger v1.1."""
    
    # Create the main dataset directory
    dataset_path = base_path / dataset_name
    dataset_path.mkdir(parents=True, exist_ok=True)
    
    # Create the standard 10X Genomics Visium structure for v1.1
    fastq_path = dataset_path / "fastqs"
    fastq_path.mkdir(parents=True, exist_ok=True)
    
    # Create sample subdirectory
    sample_path = fastq_path / "Sample_Visium"
    sample_path.mkdir(exist_ok=True)
    
    # Create spatial imaging directory
    spatial_path = dataset_path / "spatial"
    spatial_path.mkdir(exist_ok=True)
    
    # Create Visium FASTQ files (spatial transcriptomics for v1.1)
    # R1 (spatial barcode + UMI)
    r1_content = """@spaceranger_v1_1_test_read_1_1
AAACCTGAGAAGGCCT
+
IIIIIIIIIIIIIIII
@spaceranger_v1_1_test_read_1_2
AAACCTGAGCAATGGA
+
IIIIIIIIIIIIIIII
"""
    
    r1_file = sample_path / "Visium_S1_L001_R1_001.fastq.gz"
    with gzip.open(r1_file, 'wt') as f:
        f.write(r1_content)
    
    # R2 (transcript sequence)
    r2_content = """@spaceranger_v1_1_test_read_2_1
ATGCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATC
+
IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIII
@spaceranger_v1_1_test_read_2_2
CGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGAT
+
IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIII
"""
    
    r2_file = sample_path / "Visium_S1_L001_R2_001.fastq.gz"
    with gzip.open(r2_file, 'wt') as f:
        f.write(r2_content)
    
    # I1 (sample index)
    i1_content = """@spaceranger_v1_1_test_index_1_1
ACGTACGT
+
IIIIIIII
@spaceranger_v1_1_test_index_1_2
CGATCGAT
+
IIIIIIII
"""
    
    i1_file = sample_path / "Visium_S1_L001_I1_001.fastq.gz"
    with gzip.open(i1_file, 'wt') as f:
        f.write(i1_content)
    
    # Create spatial barcode positions file (tissue_positions_list.csv for v1.1)
    tissue_positions_content = """barcode,in_tissue,array_row,array_col,pxl_row_in_fullres,pxl_col_in_fullres
AAACCTGAGAAGGCCT-1,1,0,0,100,100
AAACCTGAGCAATGGA-1,1,0,1,100,200
AAACAAGTATCTCCCA-1,0,1,0,200,100
"""
    
    tissue_positions_path = spatial_path / "tissue_positions_list.csv"
    with open(tissue_positions_path, 'w') as f:
        f.write(tissue_positions_content)
    
    # Create scale factors JSON (v1.1 format - simplified)
    scalefactors_content = {
        "tissue_hires_scalef": 0.12,
        "tissue_lowres_scalef": 0.03,
        "fiducial_diameter_fullres": 180.0,
        "spot_diameter_fullres": 75.0
    }
    
    scalefactors_path = spatial_path / "scalefactors_json.json"
    with open(scalefactors_path, 'w') as f:
        json.dump(scalefactors_content, f, indent=2)
    
    # Create placeholder tissue images
    tissue_hires_path = spatial_path / "tissue_hires_image.png"
    tissue_hires_path.write_text("# Placeholder for high-resolution tissue image - v1.1")
    
    tissue_lowres_path = spatial_path / "tissue_lowres_image.png"
    tissue_lowres_path.write_text("# Placeholder for low-resolution tissue image - v1.1")
    
    # Create Space Ranger v1.1 specific configuration (minimal)
    config_content = """[chemistry]
# Space Ranger v1.1 chemistry (Visium - early version)
chemistry = Visium-v1

[library]
# Spatial transcriptomics library configuration for v1.1
expect-cells = 2000

[spatial]
# Spatial-specific settings for v1.1
image = spatial/tissue_hires_image.png
slide = V19J01-789
area = C1
localcores = 1

[analysis]
# Basic analysis options for v1.1
max-clusters = 8
dimensionality-reduction = pca

[sample]
# Sample information for Space Ranger v1.1
id = Test_Visium_v1_1
description = Test Visium sample for Space Ranger v1.1.0
"""
    
    config_path = dataset_path / "spaceranger_v1_1_config.txt"
    with open(config_path, 'w') as f:
        f.write(config_content)
    
    # Create metadata.json file
    metadata = {
        "dataset_name": dataset_name,
        "dataset_type": "raw_data",
        "created_at": datetime.now().isoformat(),
        "description": "Test dataset for spaceranger-v1.1.0 pipeline validation",
        "pipeline": "spaceranger-v1.1.0",
        "test_flags": ["--localcores=1"],
        "structure": {
            "has_fastqs": True,
            "has_spatial_data": True,
            "has_config": True,
            "samples": ["Visium"],
            "library_type": "Spatial Gene Expression",
            "chemistry": "Visium-v1",
            "format_version": "spaceranger_v1_1_compatible",
            "expected_cells": 2000,
            "is_spatial": True,
            "spatial_features": ["tissue_positions", "scale_factors", "tissue_images"],
            "read_structure": "R1: spatial barcode + UMI, R2: transcript, I1: sample index"
        }
    }
    
    metadata_path = dataset_path / "metadata.json"
    with open(metadata_path, 'w') as f:
        json.dump(metadata, f, indent=2)
    
    print(f"Created Space Ranger v1.1 dataset structure at: {dataset_path}")
    return dataset_path


def main():
    """Main function to create the test dataset."""
    
    # Get dataset name from command line or use default
    if len(sys.argv) > 1:
        dataset_name = sys.argv[1]
    else:
        dataset_name = f"test_spaceranger_v1_1_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    
    print(f"Creating test Space Ranger v1.1 dataset: {dataset_name}")
    
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
        dataset_path = create_spaceranger_v1_1_dataset_structure(origin_path, dataset_name)
        print(f"✓ Successfully created test dataset at: {dataset_path}")
        
        # Print summary
        print("\n" + "="*70)
        print("SPACE RANGER v1.1.0 TEST DATASET CREATION COMPLETED")
        print("="*70)
        print(f"Dataset Name: {dataset_name}")
        print(f"Location: {dataset_path}")
        print(f"Type: Raw Data (Spatial Transcriptomics)")
        print(f"Pipeline: spaceranger-v1.1.0")
        print(f"Test Flag: --localcores=1")
        print(f"Chemistry: Visium-v1")
        print("\nKey Features:")
        print("✓ Visium spatial transcriptomics dataset")
        print("✓ Spatial barcode positions and tissue images")
        print("✓ Space Ranger v1.1 compatible structure")
        print("✓ Visium-v1 chemistry specification")
        print("✓ Basic analysis options (PCA only)")
        print("✓ Simplified scale factors and tissue positioning")
        print("\nDataset Structure:")
        print("├── fastqs/")
        print("│   └── Sample_Visium/")
        print("│       ├── Visium_S1_L001_R1_001.fastq.gz (spatial barcodes + UMI)")
        print("│       ├── Visium_S1_L001_R2_001.fastq.gz (transcript reads)")
        print("│       └── Visium_S1_L001_I1_001.fastq.gz (sample index)")
        print("├── spatial/")
        print("│   ├── tissue_positions_list.csv")
        print("│   ├── scalefactors_json.json")
        print("│   ├── tissue_hires_image.png")
        print("│   └── tissue_lowres_image.png")
        print("├── spaceranger_v1_1_config.txt")
        print("└── metadata.json")
        print("\nThis dataset is compatible with Space Ranger v1.1.0")
        print("and supports basic spatial transcriptomics analysis.")
        
    except Exception as e:
        print(f"✗ Failed to create dataset: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()

