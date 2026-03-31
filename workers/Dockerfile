# Use the official Python image from the Docker Hub
FROM python:3.10

# Set the working directory
WORKDIR /opt/sca/app

# Set environment variables
ENV POETRY_VERSION=1.8.2

# Install Poetry
RUN pip install poetry==$POETRY_VERSION

# Copy only the necessary files
COPY pyproject.toml poetry.lock ./

# Install dependencies from the lock file only (--no-root: application code is
# mounted or copied afterward; installing the project package here would fail
# before the rest of the tree exists.)
RUN poetry config virtualenvs.create false && poetry install --no-root

# Copy the rest of the application code
COPY . /opt/sca/app

# Set the entrypoint
# ENTRYPOINT ["bin/entrypoint.sh"]
