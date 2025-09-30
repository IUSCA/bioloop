#!/bin/bash
set -e

# =============================================================================
# Bioloop Directory Initialization Script
# =============================================================================
#
# Purpose:
#   This script creates the required directory structure for the Bioloop
#   data processing pipeline inside the Docker-managed landing_volume.
#
# Usage:
#   This script is automatically executed by the init_data_dirs container
#   during docker-compose startup to ensure all required directories exist
#   before the watch and celery_worker containers start.
#
# Directory Structure and Workflow:
#   /opt/sca/data/
#   ├── origin/                    # Watch script monitors these for new datasets
#   │   ├── raw_data/             # RAW_DATA datasets waiting for processing
#   │   └── data_products/        # DATA_PRODUCT datasets waiting for processing
#   ├── archive/                  # Processed datasets archived by year
#   ├── staged/                   # Datasets staged for processing/validation
#   │   ├── raw_data/
#   │   └── data_products/
#   ├── bundle/                   # Bundle generation and staging areas
#   │   ├── raw_data/
#   │   │   ├── generation/       # Temporary files during bundle creation
#   │   │   └── staging/          # Bundles ready for distribution
#   │   └── data_products/
#   │       ├── generation/
#   │       └── staging/
#   ├── qc/                       # Quality control files and reports
#   │   └── raw_data/
#   ├── downloads/                # User-accessible download area
#   └── scratch/                  # Temporary files and working directories
#
# =============================================================================

echo "Initializing directory structure in /opt/sca/data..."

# Function to create directory and log if it already exists
# Args: $1 - directory path to create
create_dir() {
    local dir="$1"
    if [ -d "$dir" ]; then
        echo "Directory already exists: $dir"
    else
        mkdir -p "$dir"
        echo "Created directory: $dir"
    fi
}

# Create all directories required by the Bioloop worker framework

# Origin directories - where new Datasets are picked up from
create_dir "/opt/sca/data/origin/raw_data"        # RAW_DATA source directory
create_dir "/opt/sca/data/origin/data_products"   # DATA_PRODUCT source directory

create_dir "/opt/sca/data/register_ondemand/raw_data"        # RAW_DATA source directory
create_dir "/opt/sca/data/register_ondemand/data_products"   # DATA_PRODUCT source directory
create_dir "/opt/sca/logs/register_ondemand"

# Archive directory - Datasets's archival storage location
create_dir "/opt/sca/data/archive"                # Base archive directory 

# Staged directories - datasets prepared for processing
create_dir "/opt/sca/data/staged/raw_data"        # RAW_DATA staged for processing
create_dir "/opt/sca/data/staged/data_products"   # DATA_PRODUCT staged for processing

# Bundle directories - for creating and staging dataset bundles
create_dir "/opt/sca/data/bundle/raw_data/generation"      # RAW_DATA bundle creation workspace
create_dir "/opt/sca/data/bundle/raw_data/staging"         # RAW_DATA bundles ready for distribution
create_dir "/opt/sca/data/bundle/data_products/generation" # DATA_PRODUCT bundle creation workspace
create_dir "/opt/sca/data/bundle/data_products/staging"    # DATA_PRODUCT bundles ready for distribution

# Quality control directory
create_dir "/opt/sca/data/qc/raw_data"            # Quality control files's generation place

# User-facing directories
create_dir "/opt/sca/data/downloads"              # User-accessible download area
create_dir "/opt/sca/data/uploads"                # Temporary upload directory

create_dir "/opt/sca/data/scratch"                # Temporary files and working directories

echo "Directory structure initialization completed!"
