


# Bioloop
Data Management Portal and Pipeline Application for Research Teams

## Overview
Bioloop is a web-based portal to simplify the management of large-scale datasets shared among research teams in scientific domains. This platform optimizes data handling by effectively utilizing both cold and hot storage solutions, like tape and disk storage, to reduce overall storage costs.

**Key Features:**

1. **Project-Based Organization:** Data is assigned to projects, allowing collaborators to work within specific project environments, ensuring data isolation and efficient collaboration.

2. **Data Ingestion:** Bioloop simplifies data ingestion by offering automated triggers for instrument-based data ingestion and supports manual uploads for datasets.

3. **Data Provenance Tracking:** Bioloop tracks data lineage, recording the origin of raw datasets and their subsequent derived data products, promoting data transparency and accountability.

4. **Custom Pipelines:** Bioloop allows custom data processing pipelines, leveraging [Python's Celery](https://docs.celeryq.dev/en/stable/getting-started/introduction.html) task queue system to efficiently scale processing workers as needed.

5. **Secure Downloads:** Bioloop ensures data security with token-based access mechanisms for downloading data, restricting access to authorized users.

6. **Microservice Architecture:** Bioloop utilizes Docker containers for effortless deployment, allowing flexibility between local infrastructure and public cloud environments."


## Getting started
- [Create a new project from this template](docs/new_project.md)

- [API](api/README.md)
- [UI](ui/README.md)
- [Workers](workers/README.md)

- [Docker](README-docker.md)


## Architecture
<img src="../architecture.png" >
<br />
<img src="../app-celery-communication-diagram.png" >
