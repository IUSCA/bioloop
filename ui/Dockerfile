FROM node:19

WORKDIR /opt/sca/app

COPY package*.json /opt/sca/app
RUN npm ci

COPY . /opt/sca/app

VOLUME /opt/sca/app/dist

CMD ["npm", "run", "build"]