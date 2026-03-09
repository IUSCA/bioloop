# /etc/jupyter/jupyter_server_config.py
# Applied inside every notebook container.

import os

# --- Disable terminal access (no shell for users) ---
c.ServerApp.terminals_enabled = False

# --- Jail the file browser to the work directory ---
# Users cannot navigate outside /home/jovyan/work in the UI.
c.ServerApp.root_dir = '/home/jovyan/work'
c.ContentsManager.root_dir = '/home/jovyan/work'

# --- Do not allow hidden files (e.g. .bashrc, .ssh) to be visible ---
c.ContentsManager.allow_hidden = False

# --- Security headers ---
c.ServerApp.tornado_settings = {
    'headers': {
        'Content-Security-Policy': "frame-ancestors 'self' https://research-portal.com",
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'SAMEORIGIN',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
    }
}

# --- Remote access must be True so the JupyterHub proxy (on the Docker
#     bridge, e.g. 172.20.0.1) can reach this container at its bridge IP.
#     Setting this to False would bind the server to 127.0.0.1 only, making
#     it unreachable from the Hub and causing every spawn to time out.
c.ServerApp.allow_remote_access = True
c.ServerApp.allow_root = False

# --- Shut down the server if the Hub proxy goes away ---
c.ServerApp.hub_activity_url = ''   # Hub sets this dynamically; leave blank here

# --- Disable extensions that could be used to bypass restrictions ---
# Lab extensions are controlled at image build time; lock them here too.
c.LabServerApp.extra_labextensions_path = []
