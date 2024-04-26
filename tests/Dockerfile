# Get the latest version of Playwright
FROM mcr.microsoft.com/playwright:v1.43.0-jammy
# NOTE - playwright version in this image needs to be the same as that in tests/package.json
# for PLaywright running in Docker to be able to detect the test suite.

# Set the work directory for the application
WORKDIR /opt/sca/app
 
# COPY the tests/ subdirectory to /opt/sca/app within the container
COPY package.json /opt/sca/app/

# Install dependencies
RUN npm install
