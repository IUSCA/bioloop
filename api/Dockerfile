FROM node:22-bookworm

ARG APP_GID=10001
ARG APP_UID=10001

RUN groupadd -o --gid "${APP_GID}" appgroup \
    && useradd -o --create-home --uid "${APP_UID}" --gid "${APP_GID}" appuser \
    && mkdir -p /opt/sca/app /opt/sca/data/uploads \
    && chown -R appuser:appgroup /opt/sca/app /opt/sca/data

WORKDIR /opt/sca/app
USER appuser:appgroup

COPY --chown=appuser:appgroup package.json package-lock.json .npmrc ./
RUN npm ci --no-audit --no-fund

# Keep source and Prisma migrations in the image. Runtime secrets and keys are
# excluded from the build context and supplied by the deployment instead.
COPY --chown=appuser:appgroup .env.default ecosystem.config.js ./
COPY --chown=appuser:appgroup config/ ./config/
COPY --chown=appuser:appgroup prisma/ ./prisma/
COPY --chown=appuser:appgroup src/ ./src/
COPY --chown=appuser:appgroup keys/genkeys.sh ./keys/genkeys.sh

RUN npx prisma generate

ENV NODE_ENV=production

EXPOSE 3030
CMD ["node", "src/index.js"]
