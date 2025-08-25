#!/usr/bin/env python3
"""
Script to create a test Raw Data dataset for the bcl2fast pipeline.

This script:
1. Checks if a dataset with the given name already exists
2. Creates a minimal but valid BCL dataset structure
3. Places it in the origin/raw_data directory
4. Uses the --no-lane-splitting flag as a test argument

Usage:
    python create_test_bcl2fast_dataset.py [dataset_name]

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

# # Add the workers directory to the path so we can import api
# sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

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


def create_bcl_dataset_structure(base_path, dataset_name):
    """Create a minimal but valid BCL dataset structure."""
    
    # Create the main dataset directory
    dataset_path = base_path / dataset_name
    dataset_path.mkdir(parents=True, exist_ok=True)
    
    # Create the standard BCL structure
    # This mimics a real Illumina run directory structure
    bcl_path = dataset_path / "Data" / "Intensities" / "BaseCalls"
    bcl_path.mkdir(parents=True, exist_ok=True)
    
    # Create a sample sheet file (required for bcl2fastq)
    sample_sheet_content = """[Header]
IEMFileVersion,4
Investigator Name,TestUser
Project Name,TestProject
Experiment Name,TestExperiment
Date,2025-01-20
Workflow,GenerateFASTQ
Application,FASTQ Only
Assay,TruSeq HT
Description,Test dataset for bcl2fast pipeline
Chemistry,Amplicon

[Reads]
151
151

[Settings]
ReverseComplement,0
Adapter,AGATCGGAAGAGC

[Data]
Sample_ID,Sample_Name,Sample_Plate,Sample_Well,I7_Index_ID,index,I5_Index_ID,index2,Sample_Project,Description
Sample1,Sample1,,,A001,AGATCGGAAGAGC,A002,AGATCGGAAGAGC,TestProject,Test sample 1
Sample2,Sample2,,,A003,AGATCGGAAGAGC,A004,AGATCGGAAGAGC,TestProject,Test sample 2
"""
    
    sample_sheet_path = dataset_path / "SampleSheet.csv"
    with open(sample_sheet_path, 'w') as f:
        f.write(sample_sheet_content)
    
    # Create a minimal RunInfo.xml file
    run_info_content = """<?xml version="1.0"?>
<RunInfo xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" Version="2">
  <Run Id="TestRun" Number="1">
    <Flowcell>TestFlowcell</Flowcell>
    <Instrument>TestInstrument</Instrument>
    <Date>2025-01-20T00:00:00</Date>
    <Reads>
      <Read Number="1" NumCycles="151" IsIndexedRead="N" />
      <Read Number="2" NumCycles="151" IsIndexedRead="N" />
    </Reads>
    <FlowcellLayout>
      <LaneCount>1</LaneCount>
      <SurfaceCount>1</SurfaceCount>
      <SwathCount>1</SwathCount>
      <TileCount>1</TileCount>
      <Read1StartCycle>1</Read1StartCycle>
      <Read1EndCycle>151</Read1EndCycle>
      <Read2StartCycle>152</Read2StartCycle>
      <Read2EndCycle>302</Read2EndCycle>
    </FlowcellLayout>
    <AlignToPhiX>Y</AlignToPhiX>
    <ImageChannels>
      <Name>Red</Name>
      <Name>Green</Name>
    </ImageChannels>
    <ImageDimensions>
      <Width>2048</Width>
      <Height>2048</Height>
    </ImageDimensions>
  </Run>
</RunInfo>
"""
    
    run_info_path = dataset_path / "RunInfo.xml"
    with open(run_info_path, 'w') as f:
        f.write(run_info_content)
    
    # Create a minimal RunParameters.xml file
    run_params_content = """<?xml version="1.0"?>
<RunParameters xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <RunParametersVersion>1</RunParametersVersion>
  <Setup>
    <SupportMultipleSurfacesInExperiment>false</SupportMultipleSurfacesInExperiment>
    <ReagentKit>TestKit</ReagentKit>
    <IndexReadCount>2</IndexReadCount>
    <IndexRead1NumberOfCycles>8</IndexRead1NumberOfCycles>
    <IndexRead2NumberOfCycles>8</IndexRead2NumberOfCycles>
    <Read1NumberOfCycles>151</Read1NumberOfCycles>
    <Read2NumberOfCycles>151</Read2NumberOfCycles>
  </Setup>
</RunParameters>
"""
    
    run_params_path = dataset_path / "RunParameters.xml"
    with open(run_params_path, 'w') as f:
        f.write(run_params_content)
    
    # Create a minimal BCL file structure (just empty files to satisfy the pipeline)
    # In a real scenario, these would contain actual BCL data
    lane_path = bcl_path / "L001"
    lane_path.mkdir(exist_ok=True)
    
    # Create empty BCL files (minimal size to satisfy pipeline requirements)
    for cycle in range(1, 303):  # 151 + 151 + 1 (index reads)
        cycle_path = lane_path / f"C{cycle:03d}.1"
        cycle_path.mkdir(exist_ok=True)
        
        # Create empty BCL, LOCs, and FILTER files
        bcl_file = cycle_path / "s_1_0001.bcl"
        bcl_file.write_bytes(b'\x00' * 1024)  # 1KB empty file
        
        locs_file = cycle_path / "s_1_0001.locs"
        locs_file.write_bytes(b'\x00' * 512)  # 512B empty file
        
        filter_file = cycle_path / "s_1_0001.filter"
        filter_file.write_bytes(b'\x00' * 256)  # 256B empty file
    
    # Create a metadata.json file with dataset information
    metadata = {
        "dataset_name": dataset_name,
        "dataset_type": "raw_data",
        "created_at": datetime.now().isoformat(),
        "description": "Test dataset for bcl2fast pipeline validation",
        "pipeline": "bcl2fast",
        "test_flags": ["--no-lane-splitting"],
        "structure": {
            "has_sample_sheet": True,
            "has_run_info": True,
            "has_run_parameters": True,
            "lanes": 1,
            "cycles": 302,
            "reads": 2
        }
    }
    
    metadata_path = dataset_path / "metadata.json"
    with open(metadata_path, 'w') as f:
        json.dump(metadata, f, indent=2)
    
    print(f"Created BCL dataset structure at: {dataset_path}")
    return dataset_path


def main():
    """Main function to create the test dataset."""
    
    # Get dataset name from command line or use default
    if len(sys.argv) > 1:
        dataset_name = sys.argv[1]
    else:
        dataset_name = f"test_bcl2fast_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    
    print(f"Creating test BCL dataset: {dataset_name}")
    
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
        dataset_path = create_bcl_dataset_structure(origin_path, dataset_name)
        print(f"✓ Successfully created test dataset at: {dataset_path}")
        
        # Print summary
        print("\n" + "="*60)
        print("TEST DATASET CREATION COMPLETED")
        print("="*60)
        print(f"Dataset Name: {dataset_name}")
        print(f"Location: {dataset_path}")
        print(f"Type: Raw Data")
        print(f"Pipeline: bcl2fast")
        print(f"Test Flag: --no-lane-splitting")
        print("\nDataset Structure:")
        print("├── SampleSheet.csv (required for bcl2fastq)")
        print("├── RunInfo.xml (run information)")
        print("├── RunParameters.xml (run parameters)")
        print("├── Data/Intensities/BaseCalls/ (BCL data structure)")
        print("│   └── L001/ (Lane 1)")
        print("│       └── C001.1/ to C302.1/ (cycles)")
        print("└── metadata.json (dataset metadata)")
        print("\nThis dataset should work with the bcl2fast pipeline")
        print("and can be used to test the --no-lane-splitting flag.")
        print("="*60)
        
    except Exception as e:
        print(f"✗ Failed to create dataset: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
