FROM node:19

RUN useradd -m -u 1000 -g 1000 scauser

WORKDIR /opt/sca/app

COPY package*.json ./
RUN npm ci

COPY . /opt/sca/app


EXPOSE 3080

USER scauser

CMD ["npm", "run", "start"]

