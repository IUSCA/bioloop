---
title: Project Template
---

# Create a repository

Fork this repo IUSCA/<app_name> (only the org owners can do this, ask Charles.)

Turn on issues in the new repo (only repo owners can do this, ask Charles.)

Clone repository
```bash
git clone <url>
cd <project>
```

Add bioloop as remote
```bash
git remote add bioloop git@github.com:IUSCA/bioloop.git

# to merge updates from bioloop
# git fetch bioloop
# git merge bioloop/main
```

Replace the name "bioloop" with the new project name (<app_name>) in these files:
- docker-compose.yml and docker-compose-prod.yml: Change "name"
- ui/src/config.js - Change "appTitle"
- api/config/default.json and api/config/production.json: Change "app_id", "auth.jwt.iss"
- workers/workers/config/common.py: Change "app_id" and "service_user"
- workers/workers/config/production.py and workers/workers/scripts/start_worker.sh: Change "app_id" and "base_url"
- workers/ecosystem.config.js (line 7): change celery hostname and queues values
- README.md and workers/README.md: replace the references to bioloop with <app_name>
- Update content in `ui/src/pages/about.vue` 
- Create custom logo.svg

