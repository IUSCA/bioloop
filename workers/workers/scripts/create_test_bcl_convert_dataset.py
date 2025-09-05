#!/usr/bin/env python3
"""
Script to create a test Raw Data dataset for the bcl-convert pipeline.

This script:
1. Checks if a dataset with the given name already exists
2. Creates a minimal but valid BCL dataset structure compatible with bcl-convert
3. Places it in the origin/raw_data directory
4. Uses the --force flag as a test argument

Usage:
    python create_test_bcl_convert_dataset.py [dataset_name]

Requirements:
    - Run from within celery_worker container
    - API must be accessible
    - Proper permissions to write to /opt/sca/data/origin/raw_data
"""

import os
import sys
import json
import shutil
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


def create_bcl_convert_dataset_structure(base_path, dataset_name):
    """Create a minimal but valid BCL dataset structure for bcl-convert."""
    
    # Create the main dataset directory
    dataset_path = base_path / dataset_name
    dataset_path.mkdir(parents=True, exist_ok=True)
    
    # Create the standard BCL structure for bcl-convert
    bcl_path = dataset_path / "Data" / "Intensities" / "BaseCalls"
    bcl_path.mkdir(parents=True, exist_ok=True)
    
    # Create a bcl-convert compatible sample sheet file
    sample_sheet_content = """[Header]
IEMFileVersion,5
Investigator Name,TestUser
Project Name,TestProject
Experiment Name,TestExperiment
Date,2025-01-20
Workflow,GenerateFASTQ
Application,FASTQ Only
Assay,TruSeq HT
Description,Test dataset for bcl-convert pipeline
Chemistry,Amplicon

[Reads]
151
8
8
151

[BCLConvert_Settings]
SoftwareVersion,4.0.3
AdapterRead1,AGATCGGAAGAGCACACGTCTGAACTCCAGTCA
AdapterRead2,AGATCGGAAGAGCGTCGTGTAGGGAAAGAGTGT
MinimumTrimmedReadLength,8
MaskShortReads,8
CreateFastqForIndexReads,0

[BCLConvert_Data]
Sample_ID,index,index2,Sample_Name,Sample_Project
Sample1,ACGTACGT,TGCATGCA,Sample1,TestProject
Sample2,CGATCGAT,ATGCATGC,Sample2,TestProject
"""
    
    sample_sheet_path = dataset_path / "SampleSheet.csv"
    with open(sample_sheet_path, 'w') as f:
        f.write(sample_sheet_content)
    
    # Create a bcl-convert compatible RunInfo.xml file
    run_info_content = """<?xml version="1.0"?>
<RunInfo xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" Version="6">
  <Run Id="TestRun_BclConvert" Number="1">
    <Flowcell>TestFlowcell_BclConvert</Flowcell>
    <Instrument>NovaSeq6000</Instrument>
    <Date>2025-01-20T00:00:00</Date>
    <Reads>
      <Read Number="1" NumCycles="151" IsIndexedRead="N" />
      <Read Number="2" NumCycles="8" IsIndexedRead="Y" />
      <Read Number="3" NumCycles="8" IsIndexedRead="Y" />
      <Read Number="4" NumCycles="151" IsIndexedRead="N" />
    </Reads>
    <FlowcellLayout LaneCount="2" SurfaceCount="2" SwathCount="4" TileCount="78">
      <TileSet TileNaming="FourDigit">
        <Tile>1_1101</Tile>
        <Tile>1_1102</Tile>
        <Tile>2_1101</Tile>
        <Tile>2_1102</Tile>
      </TileSet>
    </FlowcellLayout>
  </Run>
</RunInfo>
"""
    
    run_info_path = dataset_path / "RunInfo.xml"
    with open(run_info_path, 'w') as f:
        f.write(run_info_content)
    
    # Create a RunParameters.xml file  
    run_params_content = """<?xml version="1.0"?>
<RunParameters xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <RunParametersVersion>5</RunParametersVersion>
  <Setup>
    <SupportMultipleSurfacesInExperiment>true</SupportMultipleSurfacesInExperiment>
    <ReagentKit>TruSeq HT</ReagentKit>
    <ExperimentName>TestExperiment_BclConvert</ExperimentName>
    <Read1NumberOfCycles>151</Read1NumberOfCycles>
    <IndexRead1NumberOfCycles>8</IndexRead1NumberOfCycles>
    <IndexRead2NumberOfCycles>8</IndexRead2NumberOfCycles>
    <Read2NumberOfCycles>151</Read2NumberOfCycles>
    <FlowcellType>NovaSeq6000_SP</FlowcellType>
    <pe>true</pe>
  </Setup>
</RunParameters>
"""
    
    run_params_path = dataset_path / "RunParameters.xml"
    with open(run_params_path, 'w') as f:
        f.write(run_params_content)
    
    # Create BCL file structure for bcl-convert (simplified)
    total_cycles = 151 + 8 + 8 + 151  # Read1 + Index1 + Index2 + Read2
    lanes = ["L001", "L002"]
    tiles = ["1101", "1102"]
    
    for lane in lanes:
        lane_path = bcl_path / lane
        lane_path.mkdir(exist_ok=True)
        
        for cycle in range(1, total_cycles + 1):
            cycle_path = lane_path / f"C{cycle:03d}.1"
            cycle_path.mkdir(exist_ok=True)
            
            # Create files for each tile
            for tile in tiles:
                # Create minimal BCL files
                bcl_file = cycle_path / f"s_{lane[-1]}_{tile}.bcl"
                bcl_header = b'\x02\x00\x00\x00'  # 2 clusters count
                cluster_data = b'\x41\x43' * 2  # Simple base calls
                bcl_file.write_bytes(bcl_header + cluster_data)
                
                # Create LOCs file
                locs_file = cycle_path / f"s_{lane[-1]}_{tile}.locs"
                locs_header = b'\x01\x00\x00\x00'  # Version 1
                cluster_count = b'\x02\x00\x00\x00'  # 2 clusters
                positions = b'\x00\x10\x00\x00\x00\x10\x00\x00\x00\x20\x00\x00\x00\x20\x00\x00'
                locs_file.write_bytes(locs_header + cluster_count + positions)
                
                # Create FILTER file
                filter_file = cycle_path / f"s_{lane[-1]}_{tile}.filter"
                filter_header = b'\x00\x00\x00\x00'  # Version 0
                cluster_count = b'\x02\x00\x00\x00'  # 2 clusters
                filter_data = b'\x01\x01'  # Both pass filter
                filter_file.write_bytes(filter_header + cluster_count + filter_data)
    
    # Create InterOp directory
    interop_path = dataset_path / "InterOp"
    interop_path.mkdir(exist_ok=True)
    
    # Create minimal quality metrics file
    quality_metrics = interop_path / "QualityMetricsOut.bin"
    quality_metrics.write_bytes(b'\x06\x00' + b'\x00' * 100)  # Version 6 + data
    
    # Create metadata.json file
    metadata = {
        "dataset_name": dataset_name,
        "dataset_type": "raw_data",
        "created_at": datetime.now().isoformat(),
        "description": "Test dataset for bcl-convert pipeline validation",
        "pipeline": "bcl-convert",
        "test_flags": ["--force"],
        "structure": {
            "has_sample_sheet": True,
            "has_run_info": True,
            "has_run_parameters": True,
            "has_interop": True,
            "lanes": 2,
            "tiles": 2,
            "tile_numbers": ["1101", "1102"],
            "cycles": 318,
            "reads": 4,
            "read_structure": "151bp + 8bp(I1) + 8bp(I2) + 151bp",
            "format_version": "bcl_convert_compatible",
            "instrument": "NovaSeq6000"
        }
    }
    
    metadata_path = dataset_path / "metadata.json"
    with open(metadata_path, 'w') as f:
        json.dump(metadata, f, indent=2)
    
    print(f"Created BCL-Convert dataset structure at: {dataset_path}")
    return dataset_path


def main():
    """Main function to create the test dataset."""
    
    # Get dataset name from command line or use default
    if len(sys.argv) > 1:
        dataset_name = sys.argv[1]
    else:
        dataset_name = f"test_bclconvert_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    
    print(f"Creating test BCL-Convert dataset: {dataset_name}")
    
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
        dataset_path = create_bcl_convert_dataset_structure(origin_path, dataset_name)
        print(f"✓ Successfully created test dataset at: {dataset_path}")
        
        # Print summary
        print("\n" + "="*70)
        print("BCL-CONVERT TEST DATASET CREATION COMPLETED")
        print("="*70)
        print(f"Dataset Name: {dataset_name}")
        print(f"Location: {dataset_path}")
        print(f"Type: Raw Data")
        print(f"Pipeline: bcl-convert")
        print(f"Test Flag: --force")
        print(f"Instrument: NovaSeq6000")
        print("\nKey Features:")
        print("✓ BCL-Convert compatible sample sheet with [BCLConvert_Settings] and [BCLConvert_Data]")
        print("✓ RunInfo.xml version 6 format")
        print("✓ Multi-lane structure (2 lanes)")
        print("✓ Multi-tile structure (2 tiles per lane)")
        print("✓ InterOp directory included")
        print("\nDataset Structure:")
        print("├── SampleSheet.csv (bcl-convert compatible)")
        print("├── RunInfo.xml (version 6)")
        print("├── RunParameters.xml")
        print("├── InterOp/ (quality metrics)")
        print("├── Data/Intensities/BaseCalls/")
        print("│   ├── L001/ (Lane 1)")
        print("│   │   └── C001.1/ to C318.1/ (318 cycles)")
        print("│   └── L002/ (Lane 2)")
        print("│       └── C001.1/ to C318.1/ (318 cycles)")
        print("└── metadata.json (dataset metadata)")
        
    except Exception as e:
        print(f"✗ Failed to create dataset: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()

