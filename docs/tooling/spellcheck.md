---
title: Spellcheck
---

# Spellcheck

This project uses **cspell** for spell checking. Below is a guide to help developers understand and use the spellcheck tooling effectively.

## Tool: cspell

- Website: [https://cspell.org/](https://cspell.org/)
- Usage: `npx cspell .` (checks all files recursively)

## Configuration
The configuration for cspell is located in the `cspell.json` file. This file contains settings for word lists, dictionaries, and other options.

## Additional Dictionaries

The project uses the following additional dictionaries, as defined in `package.json`:
- `@cspell/dict-docker`
- `@cspell/dict-python`
- `@cspell/dict-sql`

These contain common terms and phrases used in their respective domains. You can add more dictionaries as needed.

## VSCode Extension

To enable spell checking in your editor, install the following extension:
- **Code Spell Checker**: `streetsidesoftware.code-spell-checker`

## Pre-Commit Hook

A pre-commit hook is configured to spell check staged files automatically. This ensures that typos are caught before committing changes. The hook uses the command:

```bash
npx cspell --no-progress --no-summary <staged_files>
```

## Best Practices

### Handling False Positives

If a word gets flagged as a typo but you believe it is valid:
1. If the word is likely to appear elsewhere in the project, add it to the `words` list in `cspell.json`. This can be done through "Quick Fix" menu in vscode. Hover over the word in VSCode, click on "Quick Fix" (`cmd + .`) and select "Add: "&lt;word&gt;" to config: bioloop/cspell.json".
2. If the word is specific to a file, add an inline comment to ignore it:
   - For JavaScript/TypeScript: `// cspell:ignore <word1> <word2>`
   - For Python: `# cspell:ignore <word1> <word2>`
   - For HTML: `<!-- cspell:ignore <word1> <word2> -->`

### Disabling Spell Check

- To disable spell check for a specific line:
```
// cspell:disable-line
```


- To disable spell check for the next line:
```
// cspell:disable-next-line
```

By following these practices, you can maintain a clean and typo-free codebase while minimizing unnecessary interruptions.
