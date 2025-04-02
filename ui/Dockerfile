FROM node:19

# Set the working directory
WORKDIR /opt/sca/app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy in the application code
COPY . /opt/sca/app

# Run user setup and prerqequisites
ENTRYPOINT ["bin/entrypoint.sh"]

# Run main command 
CMD ["npm", "run", "build"]