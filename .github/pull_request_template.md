**Description**

Enable dataset ingestion and download flows in non-production by allowing workers to archive/stage datasets via the docker filesystem and letting secure-download stream bundles directly when not in production while keeping production behavior unchanged. Update service configs so API/UI talk to the secure-download service on localhost:3060.

**Related Issue(s)**

Closes #N/A

**Changes Made**

- Added mode-aware config/env wiring for secure_download, API, and UI so docker/local/test expose the download service on port 3060.
- Updated secure_download download route to stream files from the configured `download_path` outside production and fall back to nginx acceleration in production.
- Reworked worker archive and stage helpers to use local filesystem copies in docker mode while still using SDA in production.
- Exposed secure_download:3060 in docker-compose for browser downloads and created local/test/docker config stubs.

- [x] Feature added
- [ ] Bug fixed
- [x] Code refactored
- [ ] Tests changed
- [ ] Documentation updated
- [ ] Other changes: [describe]

**Screenshots (if applicable)**

Not applicable for service/config changes.

**Checklist**

- [ ] Your code passes linting and coding style checks.
- [ ] Documentation has been updated to reflect the changes.
- [ ] You have reviewed your own code and resolved any merge conflicts.
- [ ] You have requested a review from at least one team member.
- [ ] Any relevant issue(s) have been linked to this PR.

**Additional Information**

Production deployments continue to rely on SDA storage; docker/local/test modes now copy from the local filesystem rooted at `DOWNLOAD_PATH`/`paths.*.archive`.
