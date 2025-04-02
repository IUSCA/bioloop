FROM node:19 

# Install dependencies
COPY package*.json ./
RUN npm ci
RUN npm install -g pm2

# Set the working directory
WORKDIR /opt/sca/app

# Expose the application port
EXPOSE 3030

# Copy in the application code
COPY . /opt/sca/app

# Run prerqequisite commands
ENTRYPOINT ["bin/entrypoint.sh"]

# Run main command 
CMD ["exec", "pm2", "ecosystem.config.js"]