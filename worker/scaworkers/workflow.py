import datetime
import itertools
import json
import uuid
from collections import Counter

import celery
import celery.states
from celery import Task


def duplicates(items):
    return list((Counter(items) - Counter(set(items))).keys())


class Workflow:
    def __init__(self, celery_app, workflow_id=None, steps=None):
        self.app = celery_app
        db = self.app.backend.database
        self.wf_col = db.get_collection('workflow_meta')

        if workflow_id is not None:
            # load from db
            res = self.wf_col.find_one({'_id': workflow_id})
            if res:
                self.workflow = res
            else:
                raise Exception(f'Workflow with id {workflow_id} is not found')
        elif steps is not None:
            # create workflow object and save to db
            assert len(steps) > 0, 'steps is empty'
            for i, step in enumerate(steps):
                assert 'name' in step, f'step - {i} does not have "name" key'
                assert len(step['name']) > 0, f'step - {i} name is empty'
                assert 'task' in step, f'step - {i} does not have "task" key'
                assert step['task'] in self.app.tasks, \
                    f'step - {i} Task {step["task"]} is not registered in the celery application'
            names = [step['name'] for step in steps]
            duplicate_names = duplicates(names)
            assert len(duplicate_names) == 0, f'Steps with duplicate names: {duplicate_names}'

            self.workflow = {
                '_id': str(uuid.uuid4()),
                'created_at': datetime.datetime.utcnow(),
                'steps': steps,
            }
            self.wf_col.insert_one(self.workflow)
        else:
            raise Exception('Either workflow_id or steps should not be None')

    def update(self):
        """
        Update the workflow object in mongo db
        :return: None
        """
        self.workflow['updated_at'] = datetime.datetime.utcnow()
        self.wf_col.update_one({'_id': self.workflow['_id']}, {'$set': self.workflow})

    def start(self, *args, **kwargs):
        first_step = self.workflow['steps'][0]
        task = self.app.tasks[first_step['task']]

        kwargs['workflow_id'] = self.workflow['_id']
        kwargs['step'] = first_step['name']
        task.apply_async(args, kwargs)

    def get_step(self, step_name):
        it = itertools.dropwhile(lambda step: step['name'] != step_name, self.workflow['steps'])
        return next(it, None)

    def get_next_step(self, step_name):
        it = itertools.dropwhile(lambda step: step['name'] != step_name, self.workflow['steps'])
        skip_one_it = itertools.islice(it, 1, None)
        return next(skip_one_it, None)

    def get_task_instance(self, task_id, date_start=None):
        col = self.app.backend.collection
        task = col.find_one({'_id': task_id})
        if task is not None:
            task['date_start'] = date_start
            if 'result' in task and task['result'] is not None:
                try:
                    task['result'] = json.loads(task['result'])
                except Exception as e:
                    print('unable to parse result json', e, task['_id'], task['result'])

        return task

    def get_last_run_task_instance(self, step):
        """
        returns the latest task instance (task object) from the step object
        """
        task_runs = step.get('task_runs', [])
        if task_runs is not None and len(task_runs) > 0:
            task_id = task_runs[-1]['task_id']
            date_start = task_runs[-1].get('date_start', None)
            return self.get_task_instance(task_id, date_start)

    def pause(self):
        # find running task
        # revoke it
        res = self.get_pending_step()
        if res:
            i, status = res
            if status not in [celery.states.SUCCESS, celery.states.FAILURE]:
                step = self.workflow['steps'][i]
                task_runs = step.get('task_runs', [])
                if task_runs is not None and len(task_runs) > 0:
                    task_id = task_runs[-1]['task_id']
                    self.app.control.revoke(task_id, terminate=True)
                    print(f'revoked task: {task_id} in step-{i + 1} {step["name"]}')
                    return {
                        'paused': True,
                        'revoked_step': {
                            'task_id': task_id,
                            'task': step['task'],
                            'name': step['name']
                        }

                    }
        return {
            'paused': False
        }

    def resume(self):
        # find failed / revoked task
        # submit a new task with arguments
        res = self.get_pending_step()
        if res:
            i, status = res
            if status in [celery.states.FAILURE, celery.states.REVOKED]:
                step = self.workflow['steps'][i]
                task = self.app.tasks[step['task']]

                # failed / revoked task instance
                task_inst = self.get_last_run_task_instance(step)

                kwargs = {
                    'workflow_id': self.workflow['_id'],
                    'step': step['name']
                }
                task.apply_async(task_inst['args'], kwargs)
                print(f'resuming step {step["name"]}')
                return {
                    'resumed': True,
                    'restarted_step': {
                        'name': step['name'],
                        'task': step['task']
                    }
                }
        return {
            'resumed': False
        }

    def on_step_start(self, step_name, task_id):
        step = self.get_step(step_name)
        step['task_runs'] = step.get('task_runs', [])
        step['task_runs'].append({
            'date_start': datetime.datetime.utcnow(),
            'task_id': task_id
        })
        self.update()
        print(f'starting {step_name} with task id: {task_id}')

    def on_step_success(self, retval, step_name):
        # self.update_step_end_time(step_name)
        next_step = self.get_next_step(step_name)

        # apply next task with retval
        if next_step:
            next_task = self.app.tasks[next_step['task']]

            kwargs = {
                'workflow_id': self.workflow['_id'],
                'step': next_step['name']
            }
            next_task.apply_async((retval[0],), kwargs)
            print(f'starting next step {next_step["name"]}')

    def get_step_status(self, step):
        """
        celery.states.FAILURE
        celery.states.PENDING
        celery.states.RETRY
        celery.states.REVOKED
        celery.states.STARTED
        celery.states.SUCCESS

        """
        task_runs = step.get('task_runs', [])
        if len(task_runs) > 0:
            task_id = task_runs[-1]['task_id']
            task_status = self.app.backend.get_status(task_id)
            return task_status
        else:
            return celery.states.PENDING

    def get_pending_step(self):
        """
        finds the index of the first step whose status is not celery.states.SUCCESS
        if all steps have succeeded, it returns None
        :return: (index:int, CELERY.states.STATE)
        """
        statuses = [(i, self.get_step_status(step)) for i, step in enumerate(self.workflow['steps'])]
        return next((s for s in statuses if s[1] != celery.states.SUCCESS), None)

    def get_workflow_status(self):
        last_step_not_succeeded = self.get_pending_step()
        if last_step_not_succeeded:
            step_idx, task_status = last_step_not_succeeded
            if step_idx == 0 and task_status == celery.states.PENDING:
                return celery.states.PENDING
            if task_status in [celery.states.STARTED, celery.states.RETRY, celery.states.PENDING]:
                return celery.states.STARTED
            else:
                return task_status
        else:
            return celery.states.SUCCESS

    def update_step_end_time(self, step_name):
        step = self.get_step(step_name)
        task_runs = step.get('task_runs', [])
        if len(task_runs) > 0:
            last_task_run = task_runs[-1]
            last_task_run['end_time'] = datetime.datetime.utcnow()
        self.update()

    def refresh(self):
        workflow_id = self.workflow['_id']
        res = self.wf_col.find_one({'_id': workflow_id})
        if res:
            self.workflow = res
        else:
            raise Exception(f'Workflow with id {workflow_id} is not found')

    def get_embellished_workflow(self, last_task_run=True, prev_task_runs=False):
        self.refresh()
        status = self.get_workflow_status()
        pending_step_idx, pending_step_status = self.get_pending_step() or (None, None)
        steps = []
        for step in self.workflow['steps']:
            emb_step = {
                'name': step['name'],
                'task': step['task'],
                'status': self.get_step_status(step)
            }
            if last_task_run:
                emb_step['last_task_run'] = self.get_last_run_task_instance(step)
            if prev_task_runs:
                emb_step['prev_task_runs'] = [
                    self.get_task_instance(t['task_id'], t.get('date_start', None)) for t in
                    step.get('task_runs', [])[:-1]
                ]
            steps.append(emb_step)

        # number of steps done is same of index of the pending step
        # if all steps are complete pending_step_idx is None, then steps_done is len(steps)
        return {
            'id': self.workflow['_id'],
            'created_at': self.workflow.get('created_at', None),
            'updated_at': self.workflow.get('created_at', None),
            'status': status,
            'steps_done': pending_step_idx if pending_step_idx is not None else len(steps),
            'total_steps': len(steps),
            'steps': steps
        }


class WorkflowTask(Task):  # noqa
    # autoretry_for = (Exception,)  # retry for all exceptions
    # max_retries = 3
    # default_retry_delay = 5  # wait for n seconds before adding the task back to the queue
    add_to_parent = True
    trail = True

    def __init__(self):
        self.workflow = None

    def before_start(self, task_id, args, kwargs):
        print(f'before_start, task_id:{task_id}, kwargs:{kwargs} name:{self.name}')

        if 'workflow_id' in kwargs and 'step' in kwargs:
            workflow_id = kwargs['workflow_id']
            self.workflow = Workflow(self.app, workflow_id)
            self.workflow.on_step_start(kwargs['step'], task_id)

    def on_success(self, retval, task_id, args, kwargs):
        print(f'on_success, task_id: {task_id}, kwargs: {kwargs}')

        if 'workflow_id' in kwargs and 'step' in kwargs:
            self.workflow.on_step_success(retval, kwargs['step'])

    def update_progress(self, progress_obj):
        # called_directly: This flag is set to true if the task was not executed by the worker.
        if not self.request.called_directly:
            print(f'updating progress for {self.name}', progress_obj)
            self.update_state(state='PROGRESS',
                              meta=progress_obj
                              )


def resubmit_task(app, task_id):
    col = app.backend.collection
    task_rec = col.find_one({'_id': task_id})

    assert task_rec, f'Task with id "{task_id}" is not found in the database'

    task = app.tasks[task_rec['name']]

    task.apply_async(args=task_rec['args'], kwargs=task_rec['kwargs'])
