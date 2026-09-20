FROM node:24-alpine AS build

WORKDIR /opt/sca/app

COPY ui/package.json ui/package-lock.json ./
RUN npm ci --legacy-peer-deps

COPY ui/ ./
RUN npm run build

FROM nginx:1.31.3-alpine

RUN apk add --no-cache gettext

COPY nginx/conf/app.conf /etc/nginx/conf.d/default.conf
COPY --from=build /opt/sca/app/dist/ /opt/sca/ui/
COPY ui/docker/runtime-config.js.template /opt/sca/templates/runtime-config.js.template
COPY ui/bin/40-generate-runtime-config.sh /docker-entrypoint.d/40-generate-runtime-config.sh

RUN chmod +x /docker-entrypoint.d/40-generate-runtime-config.sh

ENV UPLOAD_ENABLED_ROLES=admin

EXPOSE 80 443
