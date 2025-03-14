# Use the official Python image from the Docker Hub
FROM python:3.10-slim

# Create a non-privileged user
RUN useradd -m nonroot

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
RUN chown -R nonroot:nonroot /opt/sca

# Switch to the non-privileged user
USER nonroot

# Install Node.js and npm
RUN apt-get update && apt-get install -y nodejs npm

# Install pm2 globally
RUN npm install -g pm2

# Default command to run
CMD ["pm2-runtime", "start", "ecosystem.config.js"]