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