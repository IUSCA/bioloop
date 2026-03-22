#!/bin/bash
# =============================================================================
# create_test_datasets.sh
#
# Creates synthetic datasets in /opt/sca/data/duplicates_testing to exercise
# the duplicate-detection pipeline end-to-end.
#
# Usage (inside the celery_worker container):
#   bin/create_test_datasets.sh [--original-only | --duplicate-only | --partial]
#
# Modes:
#   (default)        Create both the original and the full duplicate.
#   --original-only  Create only the original dataset (first pass).
#   --duplicate-only Create only the duplicate dataset (second pass, after
#                    the original's integrated workflow has finished).
#   --partial        Create a partial duplicate (below the Jaccard threshold).
#
# After running, monitor the celery_worker logs and check the database:
#   docker compose exec celery_worker celery -A workers.celery_app inspect active
#   docker compose exec postgres psql -U appuser -d app -c \
#     "SELECT d.name, d.is_duplicate, dd.comparison_status, dd.metadata
#      FROM dataset d
#      LEFT JOIN dataset_duplication dd ON dd.duplicate_dataset_id = d.id
#      ORDER BY d.created_at DESC LIMIT 10;"
# =============================================================================

set -euo pipefail

BASE_DIR="/opt/sca/data/duplicates_testing"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
ORIGINAL_NAME="test_dataset_dup_${TIMESTAMP}"
DUPLICATE_NAME="${ORIGINAL_NAME}"  # same name triggers the rename-to-_DUPLICATE_ logic
PARTIAL_NAME="partial_similar_${TIMESTAMP}"

MODE="${1:-}"

# ---------------------------------------------------------------------------
create_original() {
    local dir="${BASE_DIR}/${ORIGINAL_NAME}"
    echo "Creating original dataset at ${dir} ..."
    mkdir -p "${dir}"

    # 5 files with deterministic content (checksums will be stable)
    echo "file1 content alpha" > "${dir}/file1.txt"
    echo "file2 content beta"  > "${dir}/file2.txt"
    echo "file3 content gamma" > "${dir}/file3.txt"
    echo "file4 content delta" > "${dir}/file4.txt"
    echo "file5 content epsilon" > "${dir}/file5.txt"

    echo "Original dataset created: ${ORIGINAL_NAME}"
    echo "  -> 5 files, ~100 bytes each"
    echo ""
    echo "Wait for the 'integrated' workflow to reach INSPECTED state before"
    echo "creating the duplicate.  Check with:"
    echo "  docker compose logs -f celery_worker | grep inspect_dataset"
}

create_duplicate() {
    local dir="${BASE_DIR}/${DUPLICATE_NAME}"
    if [ -d "${dir}" ]; then
        echo "ERROR: Directory ${dir} already exists. Choose a different name."
        exit 1
    fi
    echo "Creating full duplicate dataset at ${dir} ..."
    mkdir -p "${dir}"

    # Exact same content — Jaccard should be 1.0 (100%)
    echo "file1 content alpha" > "${dir}/file1.txt"
    echo "file2 content beta"  > "${dir}/file2.txt"
    echo "file3 content gamma" > "${dir}/file3.txt"
    echo "file4 content delta" > "${dir}/file4.txt"
    echo "file5 content epsilon" > "${dir}/file5.txt"

    echo "Full duplicate created: ${DUPLICATE_NAME}"
    echo "  -> 5 identical files (Jaccard = 1.0, threshold 0.85)"
    echo "  -> API will rename it to ${DUPLICATE_NAME}_DUPLICATE_<timestamp>"
    echo "  -> inspect_dataset will fire compare_duplicate_datasets"
    echo "  -> Dataset will reach DUPLICATE_READY after comparison finishes"
}

create_partial() {
    local dir="${BASE_DIR}/${PARTIAL_NAME}"
    echo "Creating partial duplicate at ${dir} ..."
    mkdir -p "${dir}"

    # 3 identical files + 2 different files -> Jaccard = 3/7 ≈ 0.43 (below 0.85)
    echo "file1 content alpha"   > "${dir}/file1.txt"
    echo "file2 content beta"    > "${dir}/file2.txt"
    echo "file3 content gamma"   > "${dir}/file3.txt"
    echo "file4 DIFFERENT zeta"  > "${dir}/file4.txt"
    echo "file5 DIFFERENT theta" > "${dir}/file5.txt"

    echo "Partial duplicate created: ${PARTIAL_NAME}"
    echo "  -> 3 identical + 2 different files (Jaccard ≈ 0.43, below 0.85 threshold)"
    echo "  -> Will be recorded as NOT_DUPLICATE with a near-miss alert"
}

# ---------------------------------------------------------------------------
case "${MODE}" in
    --original-only)
        create_original
        ;;
    --duplicate-only)
        create_duplicate
        ;;
    --partial)
        create_partial
        ;;
    *)
        # Default: create both (only useful if original is already INSPECTED)
        create_original
        echo ""
        echo "NOTE: Wait for the original's integrated workflow to finish before"
        echo "the duplicate shows up as a conflict."
        echo "Re-run with --duplicate-only to create the duplicate after inspection."
        ;;
esac

echo ""
echo "Monitor progress:"
echo "  docker compose logs -f celery_worker | grep -E 'inspect_dataset|duplicate|compare'"
echo ""
echo "Check DB state:"
cat <<'SQL'
  docker compose exec postgres psql -U appuser -d app -c "
    SELECT d.id, d.name, d.is_duplicate,
           array_agg(ds.state ORDER BY ds.timestamp DESC) FILTER (WHERE ds.state IS NOT NULL) AS states,
           dd.comparison_status,
           dd.metadata->>'jaccard_score' AS jaccard_score
    FROM dataset d
    LEFT JOIN dataset_state ds ON ds.dataset_id = d.id
    LEFT JOIN dataset_duplication dd ON dd.duplicate_dataset_id = d.id
    WHERE d.created_at > NOW() - INTERVAL '1 hour'
    GROUP BY d.id, d.name, d.is_duplicate, dd.comparison_status, dd.metadata
    ORDER BY d.created_at DESC;
  "
SQL
