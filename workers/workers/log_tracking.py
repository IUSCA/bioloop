"""Stream a task's own log records to the `log` table so the UI can show them.

`cmd.execute_with_log_tracking` does this for an external command by reading its
stdout and stderr pipes. A task that does its work in Python has no pipes to
read, so this attaches a logging handler instead. Both routes end at the same
`workflows/processes/<id>/logs` endpoint and the same UI panels.

@see docs/reference/features/dataset-upload.md — Verification
"""

from __future__ import annotations

import logging
import os
import threading
import time
from contextlib import contextmanager

from workers import api, cmd, utils

logger = logging.getLogger(__name__)

# Each flush is one HTTP round trip, so records are batched. Fifty records keeps
# a chatty task to roughly one request per second. Five seconds bounds how long
# the last line of a quiet task waits before the UI can display it. Both are
# legibility choices about the log panel, not correctness constraints, and
# either may be changed freely.
FLUSH_AFTER_RECORDS = 50
FLUSH_AFTER_SECONDS = 5.0


class WorkerProcessLogHandler(logging.Handler):
    """Posts batched log records to a registered worker process.

    Log delivery is best effort. A record that cannot be posted is dropped and
    the work carries on, because a task must not fail over its own logging.
    """

    def __init__(self, worker_process_id: int):
        super().__init__()
        self.worker_process_id = worker_process_id
        self._buffer: list[dict] = []
        self._lock = threading.Lock()
        self._last_flush = time.monotonic()
        # Set while inside api.post_worker_logs. Without it a warning raised by
        # a failed post would re-enter emit and recurse.
        self._flushing = False

    def emit(self, record: logging.LogRecord) -> None:
        try:
            entry = {
                'timestamp': utils.current_time_iso8601(),
                'level': record.levelname.lower(),
                'message': self.format(record),
            }
        except Exception:
            self.handleError(record)
            return

        with self._lock:
            self._buffer.append(entry)
            due = (len(self._buffer) >= FLUSH_AFTER_RECORDS
                   or time.monotonic() - self._last_flush >= FLUSH_AFTER_SECONDS)

        if due:
            self.flush()

    def flush(self) -> None:
        with self._lock:
            if self._flushing or not self._buffer:
                return
            pending, self._buffer = self._buffer, []
            self._last_flush = time.monotonic()
            self._flushing = True

        try:
            api.post_worker_logs(self.worker_process_id, pending)
        except Exception as e:
            logger.warning('Unable to post worker logs', exc_info=e)
        finally:
            self._flushing = False

    def close(self) -> None:
        self.flush()
        super().close()


@contextmanager
def track_task_logs(celery_task, tag: str, logger_name: str = 'workers'):
    """Send everything logged under `logger_name` to the UI for this block.

    Registers a worker process for the running interpreter and yields its id, so
    the caller can record the id somewhere the UI will look. Yields None when
    registration fails; the block still runs, it just has no logs in the UI.

    Args:
        celery_task: the bound Celery task, read for its task id and name.
        tag: short description stored as the process's args tag.
        logger_name: logger whose records are captured, descendants included.
    """
    worker_process_id = cmd.register_process(
        celery_task,
        pid=os.getpid(),
        args=[tag],
        process_start_time=utils.current_time_iso8601(),
    )
    if worker_process_id is None:
        yield None
        return

    target = logging.getLogger(logger_name)
    handler = WorkerProcessLogHandler(worker_process_id)
    handler.setFormatter(logging.Formatter('%(message)s'))

    # Celery configures the root logger, and a level above INFO would drop the
    # progress lines this exists to capture. Lowered only for the block.
    original_level = target.level
    if target.getEffectiveLevel() > logging.INFO:
        target.setLevel(logging.INFO)

    target.addHandler(handler)
    try:
        yield worker_process_id
    finally:
        target.removeHandler(handler)
        target.setLevel(original_level)
        handler.close()
