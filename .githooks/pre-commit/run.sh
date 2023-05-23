#!/bin/bash
set -e
set -o pipefail

(
  cd api &&
    npm run lint
)

(
  cd ui &&
    npm run lint
)
