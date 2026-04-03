"""
Runner for duplicate-detection manual test cases.

Cases run concurrently by default (bounded worker pool) to keep total runtime
reasonable without overloading the local Celery worker. Pass --sequential to
run them one at a time.

Usage (inside the celery_worker container):

    # Run all cases concurrently (default)
    python -m workers.scripts.duplicate_testing.simulate_all_test_cases

    # Run specific cases concurrently
    python -m workers.scripts.duplicate_testing.simulate_all_test_cases 1 5 9

    # Run all cases sequentially
    python -m workers.scripts.duplicate_testing.simulate_all_test_cases --sequential

    # Run a single case
    python -m workers.scripts.duplicate_testing.simulate_all_test_cases 10

Case index
----------
Cases that produce a DUPLICATE_REGISTERED dataset and a viewable comparison report:

  1  case_01_before_inspection        — Jaccard 1.00 (100%)
  2  case_02_after_inspection         — Jaccard 1.00 (100%)
  4  case_04_multiple_duplicates      — Jaccard 1.00 (100%)
  5  case_05_partial_match            — Jaccard 0.90 (90%)
  6  case_06_modified_files           — Jaccard 0.90 (90%)
  7  case_07_all_failures             — Jaccard ≈0.862 (86%)
  8  case_08_same_content_different_path — Jaccard >= threshold
  9  case_09_same_path_same_content   — baseline for EXACT_CONTENT_MATCHES and
                                        SAME_PATH_SAME_CONTENT positive counts
 10  case_10_exact_content_subset     — EXACT_CONTENT_MATCHES > SAME_PATH_SAME_CONTENT
                                        with SAME_CONTENT_DIFFERENT_PATH failure

Case that tests below-threshold NOT_DUPLICATE path (no viewable report):

  3  case_03_near_miss                — Jaccard 0.27 (27%)

If a case raises an exception the runner logs the error and continues to the
remaining cases.
"""

import argparse
import importlib
import logging
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed

from workers.scripts.duplicate_testing._common import purge_duplicate_testing_artifacts, setup_logging

logger = logging.getLogger(__name__)

# Ordered map of case number -> module name within this package.
CASES: dict[int, str] = {
    1: 'workers.scripts.duplicate_testing.case_01_before_inspection',
    2: 'workers.scripts.duplicate_testing.case_02_after_inspection',
    3: 'workers.scripts.duplicate_testing.case_03_near_miss',
    4: 'workers.scripts.duplicate_testing.case_04_multiple_duplicates',
    5: 'workers.scripts.duplicate_testing.case_05_partial_match',
    6: 'workers.scripts.duplicate_testing.case_06_modified_files',
    7: 'workers.scripts.duplicate_testing.case_07_all_failures',
    8: 'workers.scripts.duplicate_testing.case_08_same_content_different_path',
    9: 'workers.scripts.duplicate_testing.case_09_same_path_same_content',
    10: 'workers.scripts.duplicate_testing.case_10_exact_content_subset',
}


def run_case(number: int) -> bool:
    """Import and run a single case by number. Returns True on success."""
    module_path = CASES.get(number)
    if module_path is None:
        logger.error(f'Unknown case number: {number}. Valid cases: {sorted(CASES)}')
        return False

    logger.info(f'{"=" * 70}')
    logger.info(f'Running case {number}: {module_path.split(".")[-1]}')
    logger.info(f'{"=" * 70}')

    try:
        module = importlib.import_module(module_path)
        module.run()
        return True
    except Exception as exc:
        logger.error(f'Case {number} raised an exception: {exc}', exc_info=True)
        return False


def run_cases_concurrent(selected: list[int]) -> dict[int, bool]:
    """Run selected cases in parallel threads; return {case_number: success}."""
    results: dict[int, bool] = {}
    max_workers = min(3, len(selected))
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_case = {
            executor.submit(run_case, number): number
            for number in selected
        }
        for future in as_completed(future_to_case):
            number = future_to_case[future]
            results[number] = future.result()
    return results


def run_cases_sequential(selected: list[int]) -> dict[int, bool]:
    """Run selected cases one at a time; return {case_number: success}."""
    results: dict[int, bool] = {}
    for number in selected:
        results[number] = run_case(number)
    return results


def main() -> None:
    setup_logging()

    parser = argparse.ArgumentParser(
        description='Run duplicate-detection test cases.',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='\n'.join(
            f'  {n}  {CASES[n].split(".")[-1]}' for n in sorted(CASES)
        ),
    )
    parser.add_argument(
        'cases',
        nargs='*',
        type=int,
        metavar='CASE',
        help=(
            'Case number(s) to run (e.g. 1 3 10). '
            'Omit to run all cases.'
        ),
    )
    parser.add_argument(
        '--sequential',
        action='store_true',
        help='Run cases one at a time instead of using the bounded concurrent pool.',
    )
    args = parser.parse_args()

    selected = args.cases if args.cases else sorted(CASES.keys())

    # Full-suite runs should start from a clean duplicate-testing state.
    if not args.cases:
        logger.info('Cleaning prior duplicate-testing artifacts before full run...')
        purge_duplicate_testing_artifacts()

    invalid = [n for n in selected if n not in CASES]
    if invalid:
        parser.error(f'Invalid case number(s): {invalid}. Valid: {sorted(CASES)}')

    if not args.sequential and len(selected) > 1:
        logger.info(f'Running {len(selected)} cases concurrently: {selected}')
        results = run_cases_concurrent(selected)
    else:
        results = run_cases_sequential(selected)

    logger.info('')
    logger.info('=' * 70)
    logger.info('Run summary')
    logger.info('=' * 70)
    for number in sorted(results):
        status = 'OK' if results[number] else 'FAILED'
        logger.info(f'  Case {number}: {status}')

    if not all(results.values()):
        sys.exit(1)


if __name__ == '__main__':
    main()
