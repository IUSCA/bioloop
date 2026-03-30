"""
Standalone Celery task that performs file-level comparison between a detected
duplicate dataset and its original.

The task is fired by inspect_dataset with a pre-assigned task ID which is
stored in dataset_duplication.comparison_process_id so UI can correlate logs.

Comparison categories (mirroring DATASET_INGESTION_CHECK_TYPE enum):
  EXACT_CONTENT_MATCHES      - same content hash (MD5), regardless of path
  SAME_PATH_SAME_CONTENT     - same path and same MD5
  SAME_PATH_DIFFERENT_CONTENT- same path but different MD5
  SAME_CONTENT_DIFFERENT_PATH- same MD5 but different path/name
  ONLY_IN_INCOMING           - unmatched files only in incoming
  ONLY_IN_ORIGINAL           - unmatched files only in original

Jaccard score = |exact_content_matches| / (|incoming| + |original| - |exact_content_matches|)
where |exact_content_matches| is path-agnostic and computed from MD5 overlap.

All results are persisted in a single API call (PUT /datasets/:id/duplication/comparison)
which writes to dataset_ingestion_check + dataset_ingestion_file_check inside a
single database transaction.
"""
from __future__ import annotations

import logging
import os
import socket
from collections import defaultdict

import workers.api as api
from workers.config import config

logger = logging.getLogger(__name__)

# Progress milestones reported to the API during the comparison phases.
_PROGRESS_START = 0.05
_PROGRESS_FILES_FETCHED = 0.40
_PROGRESS_COMPUTED = 0.80
_PROGRESS_SAVING = 0.95


def compare_datasets(celery_task, duplicate_dataset_id: int, original_dataset_id: int, **kwargs):
    """
    Entry point called from declarations.py.

    celery_task is the bound Celery task instance (self) for the standalone task.
    """
    task_id = celery_task.request.id
    logger.info(f'compare_duplicate_datasets[{task_id}]: starting comparison '
                f'duplicate={duplicate_dataset_id} original={original_dataset_id}')

    # Register this run in worker_process/log tables for UI traceability
    try:
        process = api.register_process({
            'pid': os.getpid(),
            'task_id': task_id,
            'step': 'compare_duplicate_datasets',
            'workflow_id': task_id,
            'tags': {
                'duplicate_dataset_id': duplicate_dataset_id,
                'original_dataset_id': original_dataset_id,
            },
            'hostname': socket.gethostname(),
        })
        process_id = process['id']
    except Exception as e:
        logger.warning(f'compare_duplicate_datasets[{task_id}]: failed to register process: {e}')
        process_id = None

    def log(level: str, message: str) -> None:
        logger.info(message) if level == 'INFO' else logger.error(message)
        if process_id:
            try:
                api.post_worker_logs(process_id, [{'level': level, 'message': message}])
            except Exception:
                pass

    def report_progress(fraction: float) -> None:
        """Silently update comparison_fraction_done; never raises on failure."""
        try:
            api.update_comparison_progress(duplicate_dataset_id, fraction)
        except Exception as exc:
            logger.debug(f'compare_duplicate_datasets[{task_id}]: progress update skipped: {exc}')

    report_progress(_PROGRESS_START)
    log('INFO', f'Fetching file lists for datasets {duplicate_dataset_id} and {original_dataset_id}')

    incoming_files: list[dict] = api.get_dataset_files(
        dataset_id=duplicate_dataset_id,
        filters={'filetype': 'file'},
    )
    original_files: list[dict] = api.get_dataset_files(
        dataset_id=original_dataset_id,
        filters={'filetype': 'file'},
    )

    log('INFO', f'Incoming files: {len(incoming_files)}, Original files: {len(original_files)}')
    report_progress(_PROGRESS_FILES_FETCHED)

    # Index by path for deterministic same-path classification.
    incoming_by_path: dict[str, dict] = {f['path']: f for f in incoming_files}
    original_by_path: dict[str, dict] = {f['path']: f for f in original_files}
    incoming_paths = set(incoming_by_path)
    original_paths = set(original_by_path)

    common_paths = incoming_paths & original_paths
    incoming_only_paths = incoming_paths - original_paths
    original_only_paths = original_paths - incoming_paths

    log('INFO', f'Common paths: {len(common_paths)}, '
                f'path-only incoming: {len(incoming_only_paths)}, '
                f'path-only original: {len(original_only_paths)}')

    # Disjoint detail buckets:
    # 1) same path + same content
    # 2) same path + different content
    # 3) among path-only files, same content + different path
    # 4) remaining unmatched are only-in-incoming/original
    same_path_same_content_pairs: list[tuple[dict, dict]] = []
    same_path_different_content_pairs: list[tuple[dict, dict]] = []

    for path in sorted(common_paths):
        inc_file = incoming_by_path[path]
        orig_file = original_by_path[path]
        if inc_file.get('md5') and inc_file['md5'] == orig_file.get('md5'):
            same_path_same_content_pairs.append((inc_file, orig_file))
        else:
            same_path_different_content_pairs.append((inc_file, orig_file))

    # Path-only files are candidates for "same content, different path" matching.
    incoming_only_files = [incoming_by_path[p] for p in sorted(incoming_only_paths)]
    original_only_files = [original_by_path[p] for p in sorted(original_only_paths)]

    incoming_only_by_md5: dict[str, list[dict]] = defaultdict(list)
    original_only_by_md5: dict[str, list[dict]] = defaultdict(list)
    for f in incoming_only_files:
        if f.get('md5'):
            incoming_only_by_md5[f['md5']].append(f)
    for f in original_only_files:
        if f.get('md5'):
            original_only_by_md5[f['md5']].append(f)

    same_content_different_path_pairs: list[tuple[dict, dict]] = []
    consumed_incoming_ids: set[int] = set()
    consumed_original_ids: set[int] = set()
    for md5 in sorted(set(incoming_only_by_md5) & set(original_only_by_md5)):
        inc_list = sorted(incoming_only_by_md5[md5], key=lambda x: x['path'])
        orig_list = sorted(original_only_by_md5[md5], key=lambda x: x['path'])
        pair_count = min(len(inc_list), len(orig_list))
        for i in range(pair_count):
            inc_file = inc_list[i]
            orig_file = orig_list[i]
            same_content_different_path_pairs.append((inc_file, orig_file))
            consumed_incoming_ids.add(inc_file['id'])
            consumed_original_ids.add(orig_file['id'])

    unmatched_only_in_incoming = [
        f for f in incoming_only_files if f['id'] not in consumed_incoming_ids
    ]
    unmatched_only_in_original = [
        f for f in original_only_files if f['id'] not in consumed_original_ids
    ]

    # Hash-only exact matches are path-agnostic and are used for Jaccard.
    # This summary intentionally overlaps with the stricter subsets:
    # SAME_PATH_SAME_CONTENT + SAME_CONTENT_DIFFERENT_PATH.
    exact_content_matches_incoming = [
        inc for inc, _orig in same_path_same_content_pairs
    ] + [
        inc for inc, _orig in same_content_different_path_pairs
    ]

    total_incoming = len(incoming_files)
    total_original = len(original_files)
    total_exact_content_matches = len(exact_content_matches_incoming)
    total_same_path_same_content = len(same_path_same_content_pairs)
    total_same_path_different_content = len(same_path_different_content_pairs)
    total_same_content_different_path = len(same_content_different_path_pairs)
    total_only_in_incoming = len(unmatched_only_in_incoming)
    total_only_in_original = len(unmatched_only_in_original)
    file_count_delta = total_incoming - total_original
    union = total_incoming + total_original - total_exact_content_matches
    # File-count Jaccard index over exact MD5 matches (path-agnostic).
    content_similarity_score = total_exact_content_matches / union if union > 0 else 0.0
    path_union = len(incoming_paths | original_paths)
    path_preserving_similarity = (
        total_same_path_same_content / path_union if path_union > 0 else 0.0
    )

    log('INFO',
        f'Exact content matches: {total_exact_content_matches}, '
        f'same-path/same-content: {total_same_path_same_content}, '
        f'same-path/different-content: {total_same_path_different_content}, '
        f'same-content/different-path: {total_same_content_different_path}, '
        f'only-in-incoming: {total_only_in_incoming}, '
        f'only-in-original: {total_only_in_original}, '
        f'file-count-delta: {file_count_delta}, '
        f'content_similarity_score (Jaccard): {content_similarity_score:.4f} '
        f'= {total_exact_content_matches} / ({total_incoming} + {total_original} - {total_exact_content_matches}), '
        f'path-preserving-similarity: {path_preserving_similarity:.4f} '
        f'= {total_same_path_same_content}/{path_union}')
    report_progress(_PROGRESS_COMPUTED)

    # Build ingestion_checks payload
    ingestion_checks = [
        {
            'type': 'EXACT_CONTENT_MATCHES',
            'label': 'Files with matching content (same MD5), regardless of path',
            'passed': True,
            'file_checks': [
                {'file_id': f['id'], 'source_dataset_id': duplicate_dataset_id}
                for f in exact_content_matches_incoming
            ],
        },
        {
            'type': 'SAME_PATH_SAME_CONTENT',
            'label': 'Files with the same path and same content',
            'passed': True,
            'file_checks': [
                {'file_id': inc['id'], 'source_dataset_id': duplicate_dataset_id}
                for inc, _orig in same_path_same_content_pairs
            ],
        },
        {
            'type': 'SAME_PATH_DIFFERENT_CONTENT',
            'label': 'Files with the same path but different content',
            'passed': len(same_path_different_content_pairs) == 0,
            'file_checks': (
                [{'file_id': inc['id'], 'source_dataset_id': duplicate_dataset_id}
                 for inc, _orig in same_path_different_content_pairs]
                + [{'file_id': orig['id'], 'source_dataset_id': original_dataset_id}
                   for _inc, orig in same_path_different_content_pairs]
            ),
        },
        {
            'type': 'SAME_CONTENT_DIFFERENT_PATH',
            'label': 'Files with matching content but different path/name',
            'passed': len(same_content_different_path_pairs) == 0,
            'file_checks': (
                [{'file_id': inc['id'], 'source_dataset_id': duplicate_dataset_id}
                 for inc, _orig in same_content_different_path_pairs]
                + [{'file_id': orig['id'], 'source_dataset_id': original_dataset_id}
                   for _inc, orig in same_content_different_path_pairs]
            ),
        },
        {
            'type': 'ONLY_IN_INCOMING',
            'label': 'Files only in the incoming duplicate dataset',
            'passed': len(unmatched_only_in_incoming) == 0,
            'file_checks': [
                {'file_id': f['id'], 'source_dataset_id': duplicate_dataset_id}
                for f in unmatched_only_in_incoming
            ],
        },
        {
            'type': 'ONLY_IN_ORIGINAL',
            'label': 'Files only in the original dataset',
            'passed': len(unmatched_only_in_original) == 0,
            'file_checks': [
                {'file_id': f['id'], 'source_dataset_id': original_dataset_id}
                for f in unmatched_only_in_original
            ],
        },
    ]

    comparison_result = {
        'content_similarity_score': content_similarity_score,
        'total_incoming_files': total_incoming,
        'total_original_files': total_original,
        'total_common_files': total_exact_content_matches,
        'exact_content_match_count': total_exact_content_matches,
        'same_path_same_content_count': total_same_path_same_content,
        'same_path_different_content_count': total_same_path_different_content,
        'same_content_different_path_count': total_same_content_different_path,
        'only_in_incoming_count': total_only_in_incoming,
        'only_in_original_count': total_only_in_original,
        'file_count_delta': file_count_delta,
        'path_union_file_count': path_union,
        'path_preserving_similarity': path_preserving_similarity,
        'ingestion_checks': ingestion_checks,
    }

    report_progress(_PROGRESS_SAVING)
    log('INFO', 'Saving comparison results via API (single transaction).')
    api.save_comparison_result(
        dataset_id=duplicate_dataset_id,
        comparison_result=comparison_result,
    )

    log('INFO',
        f'Comparison complete. Dataset {duplicate_dataset_id} is '
        f'{"a strong duplicate" if content_similarity_score >= config["enabled_features"]["duplicate_detection"]["jaccard_threshold"] else "similar but below threshold"} '
        f'of dataset {original_dataset_id} (content_similarity_score {content_similarity_score:.4f}).')

    return duplicate_dataset_id, original_dataset_id
