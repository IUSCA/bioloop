**Description**

This PR refactors and enhances the dataset registration script from `rename_and_register_ondemand.py` to `register_ondemand.py`, introducing improved hard-linking capabilities, parallel verification, and enhanced error handling for dataset registration workflows in the Bioloop system.

**Functionality Overview:**
1. Input Processing: Scans input directory for candidate subdirectories
2. Considers whether the provided directory or its top-level subdirectories are to be ingested as Datasets, based on `--ingest-subdirs` flag
3. Dataset Type Registration: Register as Raw Data or Data Product
4. Naming: Add suffixes or prefixes via args
5. Metadata: Add description via arg
6. Project Linking: Link to project via arg
7. Hard-link Creation: Creates renamed hard-linked directories when renaming is needed (prefix/suffix)
8. Parallel Verification: Verifies hard-link integrity using configurable parallel workers
9. Dataset Registration: Registers datasets via bulk API endpoint with workflow kickoff
10. Cleanup: Automatically cleans up hard-link artifacts based on workflow initiation status
11. Idempotent Operation: Safe to run multiple times with automatic recovery from partial failures
12. Checksum Verification: Optional verification of data integrity between source and hard-linked directories
13. Dry Run Mode: Simulate the process without making changes


**Changes Made**

List the main changes made in this PR. Be as specific as possible.

- [x] Feature added
- [ ] Bug fixed
- [x] Code refactored
- [ ] Tests changed
- [ ] Documentation updated
- [ ] Other changes: [describe]


**Checklist**

Before submitting this PR, please make sure that:

- [x] Your code passes linting and coding style checks.
- [ ] Documentation has been updated to reflect the changes.
- [x] You have reviewed your own code and resolved any merge conflicts.
- [x] You have requested a review from at least one team member.
- [ ] Any relevant issue(s) have been linked to this PR.

**Additional Information**

Added the features below:

- [x] **Hard-linking enhancement**: Use hard-link creation with automatic cleanup and verification
- [x] **Parallel verification**: Added configurable parallel processing for checksum verification
- [x] **Bulk API integration**: Always use `/datasets/bulk` endpoint for registration
- [x] **Idempotent operations**: Safe to run multiple times with automatic recovery

**Configuration**:
- Worker limits configurable via `workers/workers/config/common.py`
- Default: 4 workers, Max: 8 workers (admin-controlled)
