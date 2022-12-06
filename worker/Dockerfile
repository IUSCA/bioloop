FROM ubuntu:22.04

# python docker image often seems like a good place to start, 
# however, it's built with a fairly old version of debian / ubuntu
# if you need access to newer versions of tools (e.g. ffmpeg)
# it may be better to start with a distribution of your choosing
# FROM python:3

# may require `docker-compose build --no-cache`
RUN apt-get update

# only needed when running ubuntu:22.04 as base image
RUN apt-get install -y pip
RUN apt-get install -y git
RUN apt-get install -y curl
RUN apt-get install -y wget

WORKDIR /opt/sca/gpdb/worker

# RUN pip install -r [module]

# Anti-pattern?
# Seems better to run pip commands here instead
# COPY requirements.txt /srv/python/requirements.txt
# RUN pip install -r requirements.txt
