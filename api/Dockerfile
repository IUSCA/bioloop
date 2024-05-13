FROM node:19

WORKDIR /opt/sca/app

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

RUN npx prisma generate



COPY . /opt/sca/app





EXPOSE 3030


CMD ["npm", "run", "start"]

