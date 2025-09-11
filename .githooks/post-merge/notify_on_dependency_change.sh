#!/bin/sh

# Collect changed files between the last merge base and current HEAD
changed_files=$(git diff-tree -r --name-only --no-commit-id HEAD@{1} HEAD)

notify_npm_root=false
notify_ui=false
notify_api=false
notify_secure=false
notify_workers=false
notify_prisma_migration=false

for file in $changed_files; do
  case "$file" in
    package.json|package-lock.json)
      notify_npm_root=true
      ;;
    ui/package.json|ui/package-lock.json)
      notify_ui=true
      ;;
    api/package.json|api/package-lock.json)
      notify_api=true
      ;;
    secure_download/package.json|secure_download/package-lock.json)
      notify_secure=true
      ;;
    workers/pyproject.toml|workers/poetry.lock)
      notify_workers=true
      ;;
  esac
  # Check for new or changed files in api/prisma/migrations subdirectories
  case "$file" in
    api/prisma/migrations/*/*)
      notify_prisma_migration=true
      ;;
  esac
done

echo ''
if $notify_npm_root; then
    echo "Detected changes to root package.json or package-lock.json"
    echo "→ Run: npm install"
    echo
fi

if $notify_ui; then
    echo "Detected changes to ui/package.json or ui/package-lock.json"
    echo "→ Run: cd ui && npm install"
    echo
fi

if $notify_api; then
    echo "Detected changes to api/package.json or api/package-lock.json"
    echo "→ Run: cd api && npm install"
    echo
fi

if $notify_prisma_migration; then
    echo "Detected new migration(s) in api/prisma/migrations"
    echo "→ Run: cd api && npx prisma migrate deploy"
    echo
fi

if $notify_secure; then
    echo "Detected changes to secure_download/package.json or package-lock.json"
    echo "→ Run: cd secure_download && npm install"
    echo
fi

if $notify_workers; then
    echo "Detected changes to workers/pyproject.toml or workers/poetry.lock"
    echo "→ Run: cd workers && poetry install --no-root"
    echo
fi
