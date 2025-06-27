# Development Tooling

## Linting

This project uses ESLint for code quality and consistency, extending rules from `eslint-config-airbnb-base` and the [Lodash-fp plugin](https://www.npmjs.com/package/eslint-plugin-lodash-fp).

- **Configuration:** Rules are defined in the `.eslintrc` file.
- **Run all files:**  
  ```bash
  npm run lint
  ```
  Lints all JavaScript files and automatically fixes issues where possible.
- **Run on a specific file:**  
  ```bash
  npm run lint:fix <file_path>
  ```
  Lints and fixes a specific file.

## Module Aliasing

To simplify imports and avoid complex relative paths, the project uses [module-alias](https://www.npmjs.com/package/module-alias).

**Example configuration in `package.json`:**
```json
{
  "_moduleAliases": {
    "@": "src"
  }
}
```
This allows you to import modules from the `src` directory using the `@` alias:
```js
import { someFunction } from '@/services/user';
```
This resolves to `src/services/user`, regardless of the importing file's location.

**IDE Support:**  
Add a `jsconfig.json` file to enable absolute imports in your editor:
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src/**/*"]
}
```

**ESLint Integration:**  
Update `.eslintrc` to support module aliases:
```json
{
  "settings": {
    "import/resolver": {
      "node": {
        "extensions": [".js", ".json"]
      },
      "module-alias": {
        "alias": {
          "@": "./src"
        },
        "extensions": [".js", ".json"]
      }
    }
  }
}
```
**Required ESLint resolver packages:**
- `eslint-import-resolver-module-alias`
- `eslint-import-resolver-node`


## ESLint Local Rules
To enforce specific coding practices, custom ESLint rules are defined in `eslint-local-rules.js`. These rules can be used to catch common mistakes or enforce project-specific conventions.

### Example Rule: No Original Prisma Client Inside Transaction
This rule prevents using the original Prisma client inside a transaction, ensuring that the transaction context is used instead.

```javascript
async function main() {
  prisma.$transaction(async (tx) => {
    await prisma.user.findFirst(); // ❌ incorrect, should use `tx`
    await tx.user.findFirst(); // ✅ correct
  });
}
```

Test the rule with:
```bash
cd api/
npx eslint src/ --rule 'local-rules/no-original-prisma-inside-tx: error'
```

## EditorConfig

Consistent Coding styles with .editorconfig


## Auto reload

[nodemon](https://nodemon.io/) - Monitor for any changes in your node.js application and automatically restart the server - perfect for development.