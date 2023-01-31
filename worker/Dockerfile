FROM python:3.10.6

# From Google Cloud Run Tutorials
# Allow statements and log messages to immediately appear in the Knative logs
ENV PYTHONUNBUFFERED True

RUN pip install --upgrade pip

# create scauser and sca group with the same ids as in the production VM.
RUN groupadd --gid 1302 sca
RUN useradd -ms /bin/bash --uid 1558638 --gid 1302 scauser 

WORKDIR /opt/sca/app
RUN chown -R scauser:sca /opt/sca/app

# set user
USER scauser:sca



RUN pip install --user pipenv
ENV PATH="/home/scauser/.local/bin:${PATH}"

# Adds Pipfile and Pipefile.lock into the image in the /opt/sca/app/ folder.
# Run these commands to generate Pipfile and Pipfile.lock in local machine
# pip install pipenv
# pipenv install
# pipenv lock
COPY --chown=scauser:sca Pipfile*  /opt/sca/app/

# In conjuction with copying the Pipfile & Pipefile.lock above
# this will install the pipenv tool, and then install all of the
# defined dependencies for this application as part of the image.
RUN pipenv requirements > requirements.txt
RUN pip install --user -r requirements.txt

# The app folder is copied towards the end of the image creation
# since it tends to change more often than the previous steps,
# and therefore we can take advantage of Docker's caching to speed
# up subsequent builds which leads to a faster build/rebuild cycle.

# COPY scaworkers $APP_HOME/app
# COPY --chown=scauser:sca run.sh /opt/sca/app/run.sh

# From Google Cloud Run Tutorials
# Run the web service on container startup. Here we use the gunicorn
# webserver, with one worker process and 8 threads.
# For environments with multiple CPU cores, increase the number of workers
# to be equal to the cores available.

CMD gunicorn -p app.pid --bind :$PORT --workers 1 --threads 1 --timeout 0 workers.app:app
# HEALTHCHECK --interval=30s --timeout=30s --start-period=60s --retries=3 CMD curl -f http://localhost:$PORT/health
