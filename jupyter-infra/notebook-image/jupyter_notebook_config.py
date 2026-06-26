c.NotebookApp.allow_root = False
c.NotebookApp.terminals_enabled = False      # no shell terminals
c.NotebookApp.allow_remote_access = False
c.FileContentsManager.root_dir = '/home/jovyan/work'  # jail to work dir
c.ContentsManager.allow_hidden = False

# Disable extensions that could bypass restrictions
c.NotebookApp.nbserver_extensions = {}