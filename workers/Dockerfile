# Use the official Python image from the Docker Hub
FROM python:3.10-slim

# Use build arguments for UID and GID
ARG UID=1001
ARG GID=1001

# Create a non-privileged user
RUN groupadd -g $GID scauser
RUN useradd -m -u $UID -g $GID scauser

# Set the working directory
RUN mkdir -p /opt/sca
WORKDIR /opt/sca

# Set environment variables
ENV POETRY_VERSION=1.8.2

# Install Poetry
RUN pip install poetry==$POETRY_VERSION

# Copy only the necessary files
COPY pyproject.toml poetry.lock ./

# Install dependencies
RUN poetry config virtualenvs.create false && poetry install --no-dev

# Copy the rest of the application code
COPY . .

# Change ownership of the working directory to the non-privileged user
RUN chown -R scauser:scauser /opt/sca

# Switch to the non-privileged user
USER scauser

# Set the entrypoint
ENTRYPOINT ["bin/entrypoint.sh"]

# Default command to run
CMD ["workers/scripts/start_worker.sh"]