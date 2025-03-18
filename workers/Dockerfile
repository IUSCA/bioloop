# Use the official Python image from the Docker Hub
FROM python:3.10-slim

# Set the working directory
WORKDIR /opt/sca/app

# Set environment variables
ENV POETRY_VERSION=1.8.2

# Install Poetry
RUN pip install poetry==$POETRY_VERSION

# Copy only the necessary files
COPY pyproject.toml poetry.lock ./

# Install dependencies
RUN poetry config virtualenvs.create false && poetry install --no-dev

# Copy the rest of the application code
COPY . /opt/sca/app

# Set the entrypoint
ENTRYPOINT ["bin/entrypoint.sh"]

# Default command to run
CMD ["workers/scripts/start_worker.sh"]