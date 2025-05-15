FROM python:3.10-bookworm

# System deps
RUN apt-get update && apt-get install -y curl coreutils && apt-get clean

# Install Poetry
ENV POETRY_VERSION=1.8.3
RUN curl -sSL https://install.python-poetry.org | python3 - && \
    ln -s ~/.local/bin/poetry /usr/local/bin/poetry

# Copy dependency files
WORKDIR /app
COPY pyproject.toml poetry.lock ./

# Install deps (without venv)
ENV POETRY_VIRTUALENVS_CREATE=false
RUN poetry install --no-root 
