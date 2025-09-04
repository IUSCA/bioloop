#!/bin/bash

# Script to test bcl2fastq conversion with a given dataset path
# Usage: ./test_bcl2fastq_conversion.sh <dataset_path>

set -e  # Exit on any error

# Check if dataset path is provided
if [ $# -ne 1 ]; then
    echo "Usage: $0 <dataset_path>"
    echo "Example: $0 /opt/sca/data/origin/raw_data/test_bcl2fast_20250903_041527"
    echo "Example: $0 /opt/sca/data/staged/raw_data/9a2c8e5560cced6c460f64c8f9be74c0/test_bcl2fast_20250903_034754"
    exit 1
fi

DATASET_DIR="$1"
DATASET_NAME=$(basename "${DATASET_DIR}")
OUTPUT_DIR="${DATASET_DIR}/output"
SAMPLE_SHEET="${DATASET_DIR}/SampleSheet.csv"
BCL2FASTQ_BIN="/opt/sca/data/conversion/bcl2fastq/bin/bcl2fastq"

echo "=================================================="
echo "BCL2FASTQ CONVERSION TEST SCRIPT"
echo "=================================================="
echo "Dataset Path: ${DATASET_DIR}"
echo "Dataset Name: ${DATASET_NAME}"
echo "Sample Sheet: ${SAMPLE_SHEET}"
echo "Output Directory: ${OUTPUT_DIR}"
echo "=================================================="

# Check if dataset directory exists
if [ ! -d "${DATASET_DIR}" ]; then
    echo "❌ Error: Dataset directory does not exist: ${DATASET_DIR}"
    echo "Please ensure the dataset exists in the origin/raw_data directory."
    exit 1
fi

# Check if sample sheet exists
if [ ! -f "${SAMPLE_SHEET}" ]; then
    echo "❌ Error: Sample sheet does not exist: ${SAMPLE_SHEET}"
    echo "Please ensure the dataset contains a SampleSheet.csv file."
    exit 1
fi

# Create output directory if it doesn't exist
echo "Creating output directory..."
mkdir -p "${OUTPUT_DIR}"
echo "✓ Output directory created: ${OUTPUT_DIR}"

# Check if bcl2fastq binary exists
if [ ! -f "${BCL2FASTQ_BIN}" ]; then
    echo "❌ Error: bcl2fastq binary not found: ${BCL2FASTQ_BIN}"
    echo "Please ensure bcl2fastq is properly installed."
    exit 1
fi

# Display the command that will be executed
echo ""
echo "Command to execute:"
echo "${BCL2FASTQ_BIN} \\"
echo "  --sample-sheet=${SAMPLE_SHEET} \\"
echo "  --runfolder-dir=${DATASET_DIR} \\"
echo "  --output-dir=${OUTPUT_DIR} \\"
echo "  --ignore-missing-bcls \\"
echo "  --ignore-missing-filter \\"
echo "  --ignore-missing-positions \\"
echo "  --no-lane-splitting"
echo ""

# Prompt for confirmation
read -p "Do you want to proceed with the conversion? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Conversion cancelled."
    exit 0
fi

echo ""
echo "Starting bcl2fastq conversion..."
echo "=================================================="

# Execute bcl2fastq command
"${BCL2FASTQ_BIN}" \
    --sample-sheet="${SAMPLE_SHEET}" \
    --runfolder-dir="${DATASET_DIR}" \
    --output-dir="${OUTPUT_DIR}" \
    --ignore-missing-bcls \
    --ignore-missing-filter \
    --ignore-missing-positions \
    --no-lane-splitting

# Check exit code
if [ $? -eq 0 ]; then
    echo ""
    echo "=================================================="
    echo "✅ BCL2FASTQ CONVERSION COMPLETED SUCCESSFULLY!"
    echo "=================================================="
    echo "Output files created in: ${OUTPUT_DIR}"
    echo ""
    echo "Summary of output:"
    ls -la "${OUTPUT_DIR}"
    
    if [ -d "${OUTPUT_DIR}/Reports" ]; then
        echo ""
        echo "Reports generated:"
        find "${OUTPUT_DIR}/Reports" -type f | head -10
    fi
    
    if [ -d "${OUTPUT_DIR}/Stats" ]; then
        echo ""
        echo "Stats generated:"
        find "${OUTPUT_DIR}/Stats" -type f | head -10
    fi
    
    echo ""
    echo "FASTQ files generated:"
    find "${OUTPUT_DIR}" -name "*.fastq.gz" | head -10
    
else
    echo ""
    echo "=================================================="
    echo "❌ BCL2FASTQ CONVERSION FAILED!"
    echo "=================================================="
    echo "Please check the error messages above."
    exit 1
fi
