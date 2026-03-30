const { post, put, patch } = require('./index');
const { createDataset } = require('./dataset');

/**
 * Registers a dataset as a duplicate of another by calling the API endpoint
 * that the inspect worker task would normally call.
 *
 * @returns {Promise<Object>} The created dataset_duplication record
 */
const registerDuplicate = async ({
  token,
  requestContext,
  datasetId,
  originalDatasetId,
  comparisonStatus = 'PENDING',
}) => {
  const response = await post({
    requestContext,
    token,
    url: `/datasets/duplication/${datasetId}`,
    data: {
      original_dataset_id: originalDatasetId,
      comparison_status: comparisonStatus,
    },
  });
  return response.json();
};

/**
 * Saves comparison results for a registered duplicate, advancing its state to
 * DUPLICATE_READY.  Mimics the compare_duplicate_datasets Celery task.
 *
 * Defaults to a "perfect match" payload (content_similarity_score = 1.0, 3 exact-content matches,
 * no modified/extra files) with empty file_checks arrays so no real
 * dataset_file records are required.
 */
const saveComparisonResult = async ({
  token,
  requestContext,
  datasetId,
  data = {},
}) => {
  return put({
    requestContext,
    token,
    url: `/datasets/duplication/${datasetId}/comparison`,
    data: {
      content_similarity_score:
        data.content_similarity_score ?? data.jaccard_score ?? 1.0,
      total_incoming_files: data.total_incoming_files ?? 3,
      total_original_files: data.total_original_files ?? 3,
      total_common_files: data.total_common_files ?? 3,
      exact_content_match_count: data.exact_content_match_count ?? (data.total_common_files ?? 3),
      same_path_same_content_count: data.same_path_same_content_count ?? (data.total_common_files ?? 3),
      same_path_different_content_count: data.same_path_different_content_count ?? 0,
      same_content_different_path_count: data.same_content_different_path_count ?? 0,
      only_in_incoming_count: data.only_in_incoming_count ?? 0,
      only_in_original_count: data.only_in_original_count ?? 0,
      file_count_delta:
        data.file_count_delta ?? ((data.total_incoming_files ?? 3) - (data.total_original_files ?? 3)),
      path_union_file_count:
        data.path_union_file_count ?? (
          (data.total_incoming_files ?? 3) + (data.total_original_files ?? 3) - (data.same_path_same_content_count ?? (data.total_common_files ?? 3))
        ),
      path_preserving_similarity:
        data.path_preserving_similarity ?? (
          ((data.same_path_same_content_count ?? (data.total_common_files ?? 3))
            / (((data.total_incoming_files ?? 3) + (data.total_original_files ?? 3)
              - (data.same_path_same_content_count ?? (data.total_common_files ?? 3))) || 1))
        ),
      ingestion_checks: data.ingestion_checks ?? [
        { type: 'EXACT_CONTENT_MATCHES', label: 'All 3 files have matching content', passed: true, file_checks: [] },
        { type: 'SAME_PATH_SAME_CONTENT', label: 'All 3 files match by path and content', passed: true, file_checks: [] },
        { type: 'SAME_PATH_DIFFERENT_CONTENT', label: 'No same-path content mismatches', passed: true, file_checks: [] },
        { type: 'SAME_CONTENT_DIFFERENT_PATH', label: 'No moved/renamed content matches', passed: true, file_checks: [] },
        { type: 'ONLY_IN_INCOMING', label: 'No files only in incoming', passed: true, file_checks: [] },
        { type: 'ONLY_IN_ORIGINAL', label: 'No files only in original', passed: true, file_checks: [] },
      ],
    },
  });
};

const acceptDuplicate = async ({ token, requestContext, datasetId }) => {
  const response = await post({
    requestContext,
    token,
    url: `/datasets/duplication/${datasetId}/accept`,
    data: {},
  });
  return response.json();
};

const rejectDuplicate = async ({ token, requestContext, datasetId }) => {
  const response = await post({
    requestContext,
    token,
    url: `/datasets/duplication/${datasetId}/reject`,
    data: {},
  });
  return response.json();
};

/**
 * Creates a pair of datasets (original + duplicate) and advances the duplicate
 * to DUPLICATE_READY by calling registerDuplicate then saveComparisonResult.
 *
 * This is the standard setup for most duplication e2e tests — it reproduces
 * the state the worker pipeline produces, without requiring workers to run.
 *
 * @returns {{ original: Object, duplicate: Object }}
 */
const setupDuplicatePair = async ({ token, requestContext } = {}) => {
  const original = await createDataset({ token, requestContext, data: { type: 'RAW_DATA' } });
  const duplicate = await createDataset({ token, requestContext, data: { type: 'RAW_DATA' } });
  await registerDuplicate({
    token, requestContext, datasetId: duplicate.id, originalDatasetId: original.id,
  });
  await saveComparisonResult({ token, requestContext, datasetId: duplicate.id });
  return { original, duplicate };
};

/**
 * Creates a partially-matching duplicate pair (content similarity score = 0.5).
 *
 * Stats: 3 incoming files, 3 original files, 2 common files.
 * File-count Jaccard index = 2 / (3 + 3 - 2) = 2/4 = 0.5 → UI shows "50%".
 *
 * One check section is marked failed (SAME_PATH_DIFFERENT_CONTENT) so tests can assert
 * both passed and failed check rendering in the same report.
 *
 * @returns {{ original: Object, duplicate: Object }}
 */
const setupDuplicatePairWithPartialMatch = async ({ token, requestContext } = {}) => {
  const original = await createDataset({ token, requestContext, data: { type: 'RAW_DATA' } });
  const duplicate = await createDataset({ token, requestContext, data: { type: 'RAW_DATA' } });
  await registerDuplicate({
    token, requestContext, datasetId: duplicate.id, originalDatasetId: original.id,
  });
  await saveComparisonResult({
    token,
    requestContext,
    datasetId: duplicate.id,
    data: {
      content_similarity_score: 0.5,
      total_incoming_files: 3,
      total_original_files: 3,
      total_common_files: 2,
      exact_content_match_count: 2,
      same_path_same_content_count: 2,
      same_path_different_content_count: 1,
      same_content_different_path_count: 0,
      only_in_incoming_count: 0,
      only_in_original_count: 0,
      file_count_delta: 0,
      path_union_file_count: 3,
      path_preserving_similarity: 2 / 3,
      ingestion_checks: [
        { type: 'EXACT_CONTENT_MATCHES', label: '2 of 3 files have matching content', passed: true, file_checks: [] },
        { type: 'SAME_PATH_SAME_CONTENT', label: '2 files match by path and content', passed: true, file_checks: [] },
        { type: 'SAME_PATH_DIFFERENT_CONTENT', label: '1 file changed at same path', passed: false, file_checks: [] },
        { type: 'SAME_CONTENT_DIFFERENT_PATH', label: 'No moved/renamed same-content files', passed: true, file_checks: [] },
        { type: 'ONLY_IN_INCOMING', label: 'No files only in incoming', passed: true, file_checks: [] },
        { type: 'ONLY_IN_ORIGINAL', label: 'No files only in original', passed: true, file_checks: [] },
      ],
    },
  });
  return { original, duplicate };
};

/**
 * Creates a duplicate pair where SAME_CONTENT_DIFFERENT_PATH is failed.
 * This models moved/renamed files that still match by content hash.
 */
const setupDuplicatePairWithMovedContent = async ({ token, requestContext } = {}) => {
  const original = await createDataset({ token, requestContext, data: { type: 'RAW_DATA' } });
  const duplicate = await createDataset({ token, requestContext, data: { type: 'RAW_DATA' } });
  await registerDuplicate({
    token, requestContext, datasetId: duplicate.id, originalDatasetId: original.id,
  });
  await saveComparisonResult({
    token,
    requestContext,
    datasetId: duplicate.id,
    data: {
      content_similarity_score: 0.66,
      total_incoming_files: 3,
      total_original_files: 3,
      total_common_files: 2,
      exact_content_match_count: 2,
      same_path_same_content_count: 1,
      same_path_different_content_count: 0,
      same_content_different_path_count: 1,
      only_in_incoming_count: 0,
      only_in_original_count: 0,
      file_count_delta: 0,
      path_union_file_count: 5,
      path_preserving_similarity: 0.2,
      ingestion_checks: [
        { type: 'EXACT_CONTENT_MATCHES', label: '2 files match by content', passed: true, file_checks: [] },
        { type: 'SAME_PATH_SAME_CONTENT', label: '1 file matches by path+content', passed: true, file_checks: [] },
        { type: 'SAME_PATH_DIFFERENT_CONTENT', label: 'No same-path content mismatches', passed: true, file_checks: [] },
        { type: 'SAME_CONTENT_DIFFERENT_PATH', label: '1 file moved/renamed with same content', passed: false, file_checks: [] },
        { type: 'ONLY_IN_INCOMING', label: 'No files only in incoming', passed: true, file_checks: [] },
        { type: 'ONLY_IN_ORIGINAL', label: 'No files only in original', passed: true, file_checks: [] },
      ],
    },
  });
  return { original, duplicate };
};

/**
 * Sets up a duplicate pair where the comparison task has FAILED.
 *
 * The duplicate is in DUPLICATE_REGISTERED state (not DUPLICATE_READY) because
 * save_comparison_result was never called.  The comparison_status is set to
 * FAILED via a direct DB update through the progress endpoint (which only updates
 * fraction_done), so we register with comparison_status='FAILED' directly.
 *
 * @returns {{ original: Object, duplicate: Object }}
 */
const setupDuplicatePairWithFailedComparison = async ({ token, requestContext } = {}) => {
  const original = await createDataset({ token, requestContext, data: { type: 'RAW_DATA' } });
  const duplicate = await createDataset({ token, requestContext, data: { type: 'RAW_DATA' } });
  await registerDuplicate({
    token,
    requestContext,
    datasetId: duplicate.id,
    originalDatasetId: original.id,
    comparisonStatus: 'FAILED',
  });
  return { original, duplicate };
};

module.exports = {
  registerDuplicate,
  saveComparisonResult,
  acceptDuplicate,
  rejectDuplicate,
  setupDuplicatePair,
  setupDuplicatePairWithPartialMatch,
  setupDuplicatePairWithMovedContent,
  setupDuplicatePairWithFailedComparison,
};
