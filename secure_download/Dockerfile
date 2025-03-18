FROM node:19


WORKDIR /opt/sca/app

COPY package*.json ./
RUN npm ci

COPY . /opt/sca/app


EXPOSE 3080


# Set the entrypoint
# ENTRYPOINT ["bin/entrypoint.sh"]

# Default command to run
CMD ["npm", "run", "start"]

