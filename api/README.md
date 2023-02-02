### Prisma Setup
```bash
pnpm init
pnpm install prisma --save-dev
pnpx prisma init

# add datasource
echo 'DATABASE_URL="postgresql://johndoe:randompassword@localhost:5432/mydb?schema=public"' > .env

# Introspect
npx prisma db pull

# Generate client
pnpm install @prisma/client
npx prisma generate
```

### Express API Setup
```bash
pnpm install express cookie-parser http-errors
pnpm install nodemon --save-dev
```

create
- `app.js`, `routes/index.js`, `middleware.js`


- `pnpm install`



create a docker image to run the server
- create network and run on static IP
- listen on 0.0.0.0 and expose port
- send PORT, NODE_ENV as env var to the process - should the env variables be configured from docker-compose or .env file?
- run service as specified user - deploy.sh?
- mount node_modules docker volume as the app user
- copy / mount .env with required data
- copy / mount just the application code, not the entire directory
- pnpm with prod flags - install from lock file
- prisma db push? - manual or automatic? - prisma is a dev-dependency and is not available in prod
- run server - can docker restart on server failure? if so, should it run install and prisma db push commands againa and again
- or run server with pm2? - this allows to add concurrency (start a cluster)
- where to log?
- keep everything pretty much the same in dev docker, execpt we run the server using nodemon - should we do this?
- or copy app code and install node_modules during build, instead of mounting them?, if we copy, we need to build the image everytime we change the code or config.

read: https://docs.docker.com/compose/production/


```
  api:
    container_name: dgl_api
    build:
      context: ./api/
      dockerfile: Dockerfile
      args:
        - UID=${APP_UID}
        - GID=${APP_GID}
    environment:
      - NODE_ENV=production
    volumes:
      - ./api/:/opt/sca/app/
      - dgl_api_modules:/opt/sca/app/node_modules
    expose:
      - 3030
    # command: sh -c "pnpm install --frozen-lockfile --prod && node index.js"
    command: sh -c "tail -f /dev/null"
    # restart: unless-stopped
    networks:
      dgl_network:
        ipv4_address: 172.19.0.2
```