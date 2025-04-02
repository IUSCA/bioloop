FROM node:19

# Set the working directory
WORKDIR /opt/sca/app

COPY package*.json ./
RUN npm ci

COPY . /opt/sca/app

EXPOSE 3080


# Default command to run
CMD ["npm", "run", "start"]
