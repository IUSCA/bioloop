FROM node:19

WORKDIR /opt/sca/app

COPY package*.json ./
RUN npm ci

COPY . /opt/sca/app


EXPOSE 3030


CMD ["npm", "run", "start"]

