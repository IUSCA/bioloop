# Get the base image of Node version 16
#FROM node:19

# Get the latest version of Playwright
# NOTE - playwright version in this image needs to be the same as that in tests/package.json
# for PLaywright running in Docker to be able to detect the test suite.
FROM mcr.microsoft.com/playwright:v1.43.0-jammy
 
# Set the work directory for the application
WORKDIR /opt/sca/app
 
# Set the environment path to node_modules/.bin
ENV PATH /app/node_modules/.bin:$PATH

# COPY the needed files to the app folder in Docker image
#COPY package.json /app/
COPY . /opt/sca/app/

# Get the needed libraries to run Playwright
RUN apt-get update && apt-get -y install libnss3 libatk-bridge2.0-0 libdrm-dev libxkbcommon-dev libgbm-dev libasound-dev libatspi2.0-0 libxshmfence-dev

# Install the dependencies in Node environment
RUN npm install
