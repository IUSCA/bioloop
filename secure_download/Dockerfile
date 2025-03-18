FROM node:19

RUN groupadd -g 1001 scauser
RUN useradd -m -u 1001 -g 1001 scauser

WORKDIR /opt/sca/app

COPY package*.json ./
RUN npm ci

COPY . /opt/sca/app


EXPOSE 3080

USER scauser

CMD ["npm", "run", "start"]

