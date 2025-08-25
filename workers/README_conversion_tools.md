# Conversion Tools Setup

This document explains how conversion tools (bcl2fastq, bcl-convert, cellranger, spaceranger) are automatically set up in the Bioloop system using Docker Compose.

## Overview

The conversion tools are automatically installed into the shared volume structure at `/opt/sca/data/conversion/` during Docker Compose startup. This ensures all worker containers have access to the same executables without downloading them to the host machine.

## How It Works

1. **Directory Structure**: The `init_data_dirs` service creates the required directory structure
2. **Tool Installation**: Dedicated setup services extract executables from official Docker images
3. **Shared Access**: All worker containers mount the same volume and can access the tools

## Setup Services

### bcl2fastq_setup
- **Image**: `zymoresearch/bcl2fastq:latest`
- **Installs**: bcl2fastq executable to `/opt/sca/data/conversion/bcl2fastq/bin/`
- **Dependencies**: Waits for `init_data_dirs` to complete

*Note: Other conversion tools (bcl-convert, cellranger, spaceranger) are commented out for now and can be enabled later as needed.*

## Worker Dependencies

The following services wait for bcl2fastq to be installed before starting:
- `celery_worker`
- `watch`
- `conversion_worker`

## Usage

### Starting the System
```bash
docker-compose up -d
```

The setup service will run automatically and install bcl2fastq. You can monitor the progress with:

```bash
docker-compose logs -f bcl2fastq_setup
```

### Verifying Installation
Once setup is complete, you can verify bcl2fastq is available in any worker container:

```bash
docker-compose exec celery_worker ls -la /opt/sca/data/conversion/bcl2fastq/bin/
docker-compose exec conversion_worker ls -la /opt/sca/data/conversion/bcl2fastq/bin/
```

### Running bcl2fastq
The bcl2fastq tool is available for all worker containers:

```bash
docker-compose exec conversion_worker /opt/sca/data/conversion/bcl2fastq/bin/bcl2fastq --version
```

## Benefits

1. **No Host Downloads**: Tools are extracted from Docker images, not downloaded to host
2. **Shared Access**: All containers access the same executables
3. **Automatic Setup**: No manual installation required
4. **Version Control**: Specific versions are pinned for reproducibility
5. **Isolation**: Tools run in their intended container environments

## Troubleshooting

### Tools Not Available
If tools are not available, check the setup service logs:
```bash
docker-compose logs bcl2fastq_setup
```

### Permission Issues
The setup services automatically set executable permissions. If you encounter permission issues, restart the setup services:
```bash
docker-compose restart bcl2fastq_setup
```

### Adding New Tools
To add new conversion tools:
1. Add a new setup service to `docker-compose.yml`
2. Update the directory structure in `init_dirs.sh` if needed
3. Add the service as a dependency for worker services
