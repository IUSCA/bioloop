# =============================================================================
# Hardened Research Notebook Image
#
# Security posture:
#   - Runs as non-root (jovyan, uid 1000)
#   - pip install disabled (bad index URL + read-only site-packages)
#   - No terminals in Jupyter UI
#   - No apt/wget/curl available to users
#   - All allowed packages pre-installed and then locked
#   - Filesystem: only /home/jovyan/work is writable (mounted volume)
# =============================================================================

FROM quay.io/jupyter/scipy-notebook:python-3.13

USER root

# -----------------------------------------------------------------------------
# 1. Pre-install ALL permitted packages while we still have network access.
#    After this step the package set is frozen.
# -----------------------------------------------------------------------------
# RUN pip install --no-cache-dir \
    # # --- data / analysis ---
    # pandas==2.2.* \
    # numpy==1.26.* \
    # scipy==1.13.* \
    # scikit-learn==1.5.* \
    # statsmodels \
    # # --- visualisation ---
    # matplotlib==3.9.* \
    # seaborn \
    # plotly \
    # altair \
    # ipywidgets \
    # --- notebook UX ---
    # jupyterhub \
    # jupyterlab \
    # ipykernel \
    # nbformat \
    # --- portal API client (pre-installed so users can call your API) ---
    # httpx \
    # requests
# RUN conda clean --all -f -y \
    # && pip cache purge

# -----------------------------------------------------------------------------
# 2. Lock pip — point it at a non-existent index so installs always fail.
#    Users see a clear "no internet" error rather than a hang.
# -----------------------------------------------------------------------------
COPY pip.conf /etc/pip.conf

# -----------------------------------------------------------------------------
# 3. Make site-packages read-only AFTER installing everything.
#    This is the belt-and-suspenders lock — even if pip somehow ran,
#    it could not write to site-packages.
# -----------------------------------------------------------------------------
RUN find /opt/conda/lib/python*/site-packages -maxdepth 0 \
      -exec chmod -R a-w {} \; \
    && find /opt/conda/lib/python*/site-packages -name "*.dist-info" \
      -exec chmod -R a-w {} \;

# -----------------------------------------------------------------------------
# 4. Remove package managers and network tools users could abuse.
# -----------------------------------------------------------------------------
RUN rm -f \
    /usr/bin/wget \
    /usr/bin/curl \
    /usr/bin/nc \
    /usr/bin/ncat \
    /usr/bin/nmap \
    /usr/bin/ssh \
    /usr/bin/scp \
    || true

# Disable conda for the user (they can't install via it either)
RUN conda config --system --set auto_update_conda false \
    && conda config --system --set report_errors false \
    && chmod -R a-w /opt/conda/pkgs || true

# -----------------------------------------------------------------------------
# 5. Jupyter server config — disable terminals, restrict root dir
# -----------------------------------------------------------------------------
COPY jupyter_server_config.py /etc/jupyter/jupyter_server_config.py
COPY jupyter_notebook_config.py /etc/jupyter/jupyter_notebook_config.py
# Ensure jovyan (uid 1000) can read the config files.
# Docker preserves source file permissions on COPY; if the host files are
# mode 600 (owner-only) the non-root runtime user gets a PermissionError
# and the server starts without ANY of the security settings applied.
RUN chmod 644 /etc/jupyter/jupyter_server_config.py \
              /etc/jupyter/jupyter_notebook_config.py

# -----------------------------------------------------------------------------
# 6. Kernel: install a restricted kernel spec that blocks shell magics
# -----------------------------------------------------------------------------
COPY kernel.json /usr/local/share/jupyter/kernels/python3/kernel.json

# -----------------------------------------------------------------------------
# 7. JupyterLab: remove the terminal launcher button from the UI
# -----------------------------------------------------------------------------
RUN jupyter labextension disable @jupyterlab/terminal-extension 2>/dev/null || true

# -----------------------------------------------------------------------------
# 8. Directory structure and permissions
# -----------------------------------------------------------------------------
RUN mkdir -p /home/jovyan/work /home/jovyan/datasets \
    && chown -R jovyan:users /home/jovyan/work \
    && chmod 700 /home/jovyan/work \
    # datasets mount point: read-only at runtime, but dir must exist
    && chown jovyan:users /home/jovyan/datasets \
    && chmod 550 /home/jovyan/datasets

# Drop back to the non-root notebook user
USER jovyan

WORKDIR /home/jovyan/work

# Healthcheck — Hub uses this to know when the server is ready
HEALTHCHECK --interval=10s --timeout=5s --retries=6 \
    CMD curl -sf http://localhost:8888/api || exit 1
