# Bioloop Development Setup

## Quick Start

1. **Start the services**:
   ```bash
   docker-compose up
   ```

That's it! The system will automatically:
- Create a Docker-managed persistent volume (`landing_volume`)
- Create the data directory structure inside the volume
- Set up all required directories
- Start the watch and worker services

## How It Works

1. **Shared Volume**: The `landing_volume` is shared between all worker containers
2. **Automatic Directory Creation**: The `init_data_dirs` container creates all required directories on startup
3. **Persistence**: Data persists between container restarts

## Data Persistence

The system uses Docker-managed volumes for data persistence:
- **Volume name**: `landing_volume`
- **Container mount**: `/opt/sca/data`
- **Persistence**: Data persists between container restarts
- **Management**: Docker handles volume lifecycle

## Accessing Data

To access the data stored in the volume:

```bash
# List volumes
docker volume ls | grep landing_volume

# Inspect volume details
docker volume inspect landing_volume

# Access data from host (if needed)
docker run --rm -v landing_volume:/data alpine ls -la /data
```

## Directory Structure

The following directory structure will be created automatically:

```
data/
├── origin/                    # Watch script monitors these directories
│   ├── raw_data/             # For RAW_DATA datasets
│   └── data_products/        # For DATA_PRODUCT datasets
├── archive/                  # Archived datasets by year (created dynamically)
├── staged/                   # Staged datasets for processing
│   ├── raw_data/
│   └── data_products/
├── bundle/                   # Bundle generation and staging
│   ├── raw_data/
│   │   ├── generation/
│   │   └── staging/
│   └── data_products/
│       ├── generation/
│       └── staging/
├── qc/                       # Quality control files
│   └── raw_data/
├── downloads/                # Download directory
└── scratch/                  # Temporary files
```

## Services

- **watch**: Monitors directories for new datasets
- **celery_worker**: Processes background tasks
- **init_data_dirs**: Creates directory structure (runs automatically)

## Troubleshooting

### Volume Already Exists
If you get an error about the volume already existing:
```bash
# Check existing volumes
docker volume ls | grep landing_volume

# Remove if needed (WARNING: This will delete data!)
docker volume rm landing_volume

# Then run setup again
./bin/dev-setup.sh
```

### Permission Issues
If you encounter permission issues with the data directory:
```bash
# Make sure the directory is writable
chmod 755 ./data
``` 