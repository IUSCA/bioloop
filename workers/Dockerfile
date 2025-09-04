# Use the official Python image from the Docker Hub
FROM python:3.10

# Set the working directory
WORKDIR /opt/sca/app

# Set environment variables
ENV POETRY_VERSION=1.8.2

# Install Poetry and libraries for bcl2fastq (glibc + musl compatibility)
# Also install Java for FastQC and QC tools
RUN pip install poetry==$POETRY_VERSION && \
    apt-get update && \
    apt-get install -y libstdc++6 g++ libc6-dev musl musl-dev default-jre wget unzip && \
    # Create the musl linker symlink for bcl2fastq binary compatibility \
    mkdir -p /lib && \
    ln -sf /usr/lib/x86_64-linux-musl/libc.so /lib/ld-musl-x86_64.so.1 && \
    # Install FastQC \
    wget -q https://www.bioinformatics.babraham.ac.uk/projects/fastqc/fastqc_v0.11.9.zip && \
    unzip fastqc_v0.11.9.zip && \
    chmod +x FastQC/fastqc && \
    mv FastQC /opt/fastqc && \
    ln -s /opt/fastqc/fastqc /usr/local/bin/fastqc && \
    # Install MultiQC via pip \
    pip install multiqc==1.15 && \
    # Cleanup \
    rm fastqc_v0.11.9.zip && \
    rm -rf /var/lib/apt/lists/*

# Copy only the necessary files
COPY pyproject.toml poetry.lock ./

# Install dependencies
RUN poetry config virtualenvs.create false && poetry install --no-dev

# Copy the rest of the application code
COPY . /opt/sca/app

# Set the entrypoint
# ENTRYPOINT ["bin/entrypoint.sh"]
