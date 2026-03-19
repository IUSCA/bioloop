from datetime import datetime, timedelta

from workers.constants.upload import UPLOAD_STATUS
from workers.scripts import manage_upload_workflows as upload_manager


class _FakeAsyncResult:
    def __init__(self, state, info=None):
        self.state = state
        self.info = info


class _FakeVerifyTask:
    def __init__(self):
        self.calls = []

    def apply_async(self, args, task_id):
        self.calls.append({"args": args, "task_id": task_id})


def test_handle_uploaded_status_persists_task_id_before_enqueue(monkeypatch):
    updates = []
    fake_task = _FakeVerifyTask()

    def _update_dataset_upload_log(dataset_id, log_data, workflow_id=None):
        updates.append(
            {"dataset_id": dataset_id, "log_data": log_data, "workflow_id": workflow_id}
        )

    monkeypatch.setattr(upload_manager.api, "update_dataset_upload_log", _update_dataset_upload_log)

    result = upload_manager.handle_uploaded_status(
        dataset_id=2001,
        dataset_name="upload-a",
        upload_log={"status": UPLOAD_STATUS["UPLOADED"]},
        metadata={},
        dry_run=False,
        verify_task=fake_task,
    )

    assert result == "verification_spawned"
    assert len(updates) == 1
    assert updates[0]["log_data"]["status"] == UPLOAD_STATUS["VERIFYING"]
    assert "verification_task_id" in updates[0]["log_data"]["metadata"]

    assert len(fake_task.calls) == 1
    assert fake_task.calls[0]["args"] == [2001]
    assert (
        fake_task.calls[0]["task_id"]
        == updates[0]["log_data"]["metadata"]["verification_task_id"]
    )


def test_handle_verifying_status_failure_applies_fallback_update(monkeypatch):
    updates = []

    monkeypatch.setattr(
        upload_manager.celery_app,
        "AsyncResult",
        lambda task_id: _FakeAsyncResult("FAILURE", info="boom"),
    )
    monkeypatch.setattr(
        upload_manager.api,
        "get_dataset_upload_log",
        lambda dataset_id: {"status": UPLOAD_STATUS["VERIFYING"]},
    )
    monkeypatch.setattr(
        upload_manager.api,
        "update_dataset_upload_log",
        lambda dataset_id, log_data, workflow_id=None: updates.append(
            {"dataset_id": dataset_id, "log_data": log_data, "workflow_id": workflow_id}
        ),
    )

    result = upload_manager.handle_verifying_status(
        dataset_id=2002,
        dataset_name="upload-b",
        upload_log={
            "status": UPLOAD_STATUS["VERIFYING"],
            "updated_at": datetime.utcnow() - timedelta(minutes=2),
        },
        metadata={
            "verification_task_id": "task-123",
            "verification_started_at": datetime.utcnow().isoformat(),
        },
        dry_run=False,
        verify_task=_FakeVerifyTask(),
    )

    assert result == "verification_failed"
    assert len(updates) == 1
    assert updates[0]["log_data"]["status"] == UPLOAD_STATUS["VERIFICATION_FAILED"]
