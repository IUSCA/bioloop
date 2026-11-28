import argparse

from celery import Celery

from workers.config import celeryconfig

app = Celery("tasks")
app.config_from_object(celeryconfig)


def revoke_active_tasks(hostname: str) -> None:
    i = app.control.inspect([hostname])
    result = i.active()
    if result:
        active_tasks = result.get(hostname, [])

        for task in active_tasks:
            app.control.revoke(task_id=task['id'], terminate=True)
        print(f'Revoked {len(active_tasks)} tasks')


def shutdown(hostname: str, queues: tuple[str] = tuple(), immediate: bool = True):
    if immediate:
        assert len(queues) > 0, 'queues cannot be empty'
        # # Tell all workers to stop consuming from queues
        for queue in queues:
            app.control.cancel_consumer(queue=queue, destination=(hostname,))
        print('stopped worker consuming from queues', queues)

        # revoke all active tasks
        revoke_active_tasks(hostname)

    # send shutdown command
    app.control.broadcast('shutdown', destination=(hostname,))
    print(f'sent command to shutdown {hostname} worker')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--hostname', type=str, required=False, help='hostname of the worker ')
    parser.add_argument('--queues', type=str, nargs='+', required=True, help='task queues')
    parser.add_argument('--immediate', type=bool, action=argparse.BooleanOptionalAction,
                        help='revokes all active tasks and shuts down the worker. '
                             'Otherwise, waits for the active tasks to complete '
                             '(but stop accepting new tasks) and shuts down.', default=False)

    args = parser.parse_args()
    # print(args.hostname, args.queues, args.immediate)

    # hostname = 'app-celery-w1@local'
    shutdown(hostname=args.hostname, queues=args.queues, immediate=args.immediate)
