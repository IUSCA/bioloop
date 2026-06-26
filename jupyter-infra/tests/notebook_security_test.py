"""
notebook_security_test.py
=========================
Security regression test suite for the hardened JupyterHub notebook environment.

PURPOSE
  Run this inside a spawned notebook container (as the jovyan user) to verify
  that all security controls are in place. Use it after any change to:
    - The notebook Docker image
    - jupyterhub_config.py (spawner settings, resource limits, volumes)
    - network-setup.sh (iptables / Docker network)
    - jupyter_server_config.py

USAGE
  Option A — from a notebook cell:
    import subprocess, sys
    result = subprocess.run(
        [sys.executable, 'notebook_security_test.py'],
        capture_output=True, text=True
    )
    print(result.stdout)
    print(result.stderr)

  Option B — paste the whole file into a notebook cell and run it.

  Option C — from the Hub admin panel, open a terminal on the container
    (if terminals are enabled for testing) and run:
      python notebook_security_test.py

ENVIRONMENT VARIABLES (optional overrides)
  PORTAL_API_URL   URL of your portal API (default: from container env)
  PYPI_URL         PyPI URL to confirm is blocked (default: https://pypi.org)
  INTERNET_URL     General internet URL to confirm is blocked (default: https://google.com)
  TEST_TIMEOUT     Per-test network timeout in seconds (default: 5)

EXIT CODE
  0  — all tests passed
  1  — one or more tests failed
"""

import os
import sys
import pwd
import grp
import stat
import socket
import subprocess
import resource
import tempfile
import importlib
import traceback
from pathlib import Path
from datetime import datetime

# ---------------------------------------------------------------------------
# Config (override via environment variables if needed)
# ---------------------------------------------------------------------------
PORTAL_API_URL = os.environ.get("PORTAL_API_URL", "https://research-portal.com/api")
PYPI_URL       = os.environ.get("PYPI_URL",       "https://pypi.org")
INTERNET_URL   = os.environ.get("INTERNET_URL",   "https://google.com")
TEST_TIMEOUT   = int(os.environ.get("TEST_TIMEOUT", "5"))


# ===========================================================================
# Minimal test framework (no external dependencies — stdlib only)
# ===========================================================================

class _Result:
    PASS  = "PASS"
    FAIL  = "FAIL"
    SKIP  = "SKIP"
    WARN  = "WARN"

_results: list[dict] = []

def _record(name: str, status: str, detail: str = ""):
    _results.append({"name": name, "status": status, "detail": detail})
    icon = {"PASS": "✓", "FAIL": "✗", "SKIP": "~", "WARN": "!"}.get(status, "?")
    line = f"  [{icon}] {name}"
    if detail:
        line += f"\n        → {detail}"
    print(line)

def assert_true(name: str, condition: bool, detail_pass: str = "", detail_fail: str = ""):
    if condition:
        _record(name, _Result.PASS, detail_pass)
    else:
        _record(name, _Result.FAIL, detail_fail)

def assert_false(name: str, condition: bool, detail_pass: str = "", detail_fail: str = ""):
    assert_true(name, not condition, detail_pass, detail_fail)

def skip(name: str, reason: str):
    _record(name, _Result.SKIP, reason)

def warn(name: str, detail: str):
    _record(name, _Result.WARN, detail)

def section(title: str):
    print(f"\n{'─' * 60}")
    print(f"  {title}")
    print(f"{'─' * 60}")


def _try_network(url: str, timeout: int = TEST_TIMEOUT) -> tuple[bool, str]:
    """
    Attempt an HTTP(S) GET using only stdlib (no requests/httpx dependency).
    Returns (reachable: bool, detail: str).
    """
    import urllib.request
    import urllib.error
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "security-test/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return True, f"HTTP {resp.status}"
    except urllib.error.HTTPError as e:
        # HTTPError means we got a response — the host is reachable.
        return True, f"HTTP {e.code}"
    except urllib.error.URLError as e:
        reason = str(e.reason)
        return False, reason
    except OSError as e:
        return False, str(e)
    except Exception as e:
        return False, f"{type(e).__name__}: {e}"


# ===========================================================================
# TEST GROUPS
# ===========================================================================

def test_process_identity():
    section("1. Process Identity")

    # Running as jovyan (uid 1000), not root
    uid  = os.getuid()
    euid = os.geteuid()
    assert_true(
        "Not running as root (uid != 0)",
        uid != 0,
        f"uid={uid}",
        f"uid={uid} — RUNNING AS ROOT"
    )
    assert_true(
        "Effective uid is not root",
        euid != 0,
        f"euid={euid}",
        f"euid={euid} — EFFECTIVE UID IS ROOT"
    )

    try:
        pw = pwd.getpwuid(uid)
        assert_true(
            "Username is 'jovyan'",
            pw.pw_name == "jovyan",
            f"username={pw.pw_name}",
            f"username={pw.pw_name} — expected 'jovyan'"
        )
    except KeyError:
        warn("Username check", f"uid {uid} not in passwd — cannot verify username")

    # Not in sudo / wheel / root groups
    try:
        user_groups = [grp.getgrgid(g).gr_name for g in os.getgroups()]
        privileged  = {"sudo", "wheel", "root", "admin"} & set(user_groups)
        assert_false(
            "Not a member of privileged groups (sudo/wheel/root)",
            bool(privileged),
            f"groups={user_groups}",
            f"member of: {privileged}"
        )
    except Exception as e:
        warn("Group membership check", str(e))

    # Cannot escalate to root via su
    result = subprocess.run(
        ["su", "-c", "id", "root"],
        capture_output=True, timeout=5
    )
    assert_true(
        "su to root fails",
        result.returncode != 0,
        "su returned non-zero as expected",
        "su to root succeeded — privilege escalation possible"
    )


def test_filesystem():
    section("2. Filesystem Permissions")

    # /home/jovyan/work is writable (user's own directory)
    work = Path("/home/jovyan/work")
    assert_true("Work directory exists", work.exists(), str(work))

    try:
        test_file = work / ".security_test_write"
        test_file.write_text("ok")
        test_file.unlink()
        assert_true("Work directory is writable", True, str(work))
    except OSError as e:
        _record("Work directory is writable", _Result.FAIL, str(e))

    # /home/jovyan/datasets is read-only
    datasets = Path("/home/jovyan/datasets")
    if datasets.exists():
        try:
            probe = datasets / ".security_test_write"
            probe.write_text("bad")
            probe.unlink()
            _record(
                "Datasets directory is read-only",
                _Result.FAIL,
                "Was able to write to /home/jovyan/datasets"
            )
        except OSError:
            assert_true("Datasets directory is read-only", True, "/home/jovyan/datasets")
    else:
        skip("Datasets directory is read-only", "/home/jovyan/datasets not mounted")

    # site-packages is read-only
    sp_paths = list(Path("/opt/conda/lib").glob("python*/site-packages"))
    if sp_paths:
        sp = sp_paths[0]
        try:
            probe = sp / ".security_test_write"
            probe.write_text("bad")
            probe.unlink()
            _record(
                "site-packages is read-only",
                _Result.FAIL,
                f"Was able to write to {sp}"
            )
        except OSError:
            assert_true("site-packages is read-only", True, str(sp))
    else:
        skip("site-packages is read-only", "Could not find site-packages path")

    # Cannot write to /etc
    try:
        probe = Path("/etc/.security_test_write")
        probe.write_text("bad")
        probe.unlink()
        _record("Cannot write to /etc", _Result.FAIL, "Write to /etc succeeded")
    except OSError:
        assert_true("Cannot write to /etc", True)

    # Cannot write to /usr
    try:
        probe = Path("/usr/.security_test_write")
        probe.write_text("bad")
        probe.unlink()
        _record("Cannot write to /usr", _Result.FAIL, "Write to /usr succeeded")
    except OSError:
        assert_true("Cannot write to /usr", True)

    # /tmp exists and is writable (needed by Python/kernels) but tmpfs-limited
    try:
        with tempfile.NamedTemporaryFile(dir="/tmp", delete=True) as f:
            f.write(b"ok")
        assert_true("Can write to /tmp (required by kernel)", True)
    except OSError as e:
        _record("Can write to /tmp (required by kernel)", _Result.FAIL, str(e))


def test_network_egress():
    section("3. Network Egress")

    # PyPI must be unreachable (blocks pip install)
    reachable, detail = _try_network(PYPI_URL)
    assert_false(
        f"PyPI is unreachable ({PYPI_URL})",
        reachable,
        "Connection refused/timed out as expected",
        f"PyPI is REACHABLE ({detail}) — pip install may work"
    )

    # General internet must be unreachable
    reachable, detail = _try_network(INTERNET_URL)
    assert_false(
        f"General internet is unreachable ({INTERNET_URL})",
        reachable,
        "Blocked as expected",
        f"Internet is REACHABLE ({detail})"
    )

    # Raw TCP to external addresses should fail
    for host, port in [("8.8.8.8", 53), ("1.1.1.1", 443)]:
        try:
            sock = socket.create_connection((host, port), timeout=TEST_TIMEOUT)
            sock.close()
            _record(
                f"Raw TCP to {host}:{port} is blocked",
                _Result.FAIL,
                "Connection succeeded — iptables rule may be missing"
            )
        except (OSError, socket.timeout):
            assert_true(f"Raw TCP to {host}:{port} is blocked", True)

    # Portal API should be reachable
    if PORTAL_API_URL and "research-portal.com" not in PORTAL_API_URL:
        reachable, detail = _try_network(PORTAL_API_URL)
        assert_true(
            f"Portal API is reachable ({PORTAL_API_URL})",
            reachable,
            detail,
            f"Portal API NOT reachable: {detail}"
        )
    else:
        skip(
            "Portal API reachability",
            "PORTAL_API_URL not configured — set env var to test"
        )


def test_package_install():
    section("4. Package Installation Lockdown")

    # pip install must fail
    result = subprocess.run(
        [sys.executable, "-m", "pip", "install", "--quiet", "httpbin"],
        capture_output=True, text=True, timeout=30
    )
    assert_true(
        "pip install fails (no index / read-only site-packages)",
        result.returncode != 0,
        "pip returned non-zero as expected",
        f"pip install SUCCEEDED — lockdown broken\nstdout: {result.stdout[:200]}"
    )

    # pip install with --index-url override must also fail
    result = subprocess.run(
        [sys.executable, "-m", "pip", "install",
         "--index-url", "https://pypi.org/simple", "httpbin"],
        capture_output=True, text=True, timeout=30
    )
    assert_true(
        "pip install with explicit --index-url also fails",
        result.returncode != 0,
        "Failed as expected (no network egress)",
        f"pip install with explicit index SUCCEEDED\nstdout: {result.stdout[:200]}"
    )

    # conda install must fail or be unavailable
    conda_path = subprocess.run(
        ["which", "conda"], capture_output=True, text=True
    ).stdout.strip()
    if conda_path:
        result = subprocess.run(
            ["conda", "install", "--yes", "--quiet", "httpbin"],
            capture_output=True, text=True, timeout=30
        )
        assert_true(
            "conda install fails",
            result.returncode != 0,
            "conda install returned non-zero",
            f"conda install SUCCEEDED\nstdout: {result.stdout[:200]}"
        )
    else:
        skip("conda install fails", "conda not in PATH")

    # Confirm pre-approved packages are importable (regression: lockdown shouldn't break them)
    required_packages = [
        "pandas", "numpy", "scipy", "sklearn",
        "matplotlib", "seaborn", "plotly",
        "requests", "httpx",
    ]
    for pkg in required_packages:
        try:
            importlib.import_module(pkg)
            assert_true(f"Pre-approved package importable: {pkg}", True)
        except ImportError as e:
            _record(
                f"Pre-approved package importable: {pkg}",
                _Result.FAIL,
                str(e)
            )


def test_shell_and_tools():
    section("5. Shell Access and Network Tools")

    # Dangerous tools should not exist
    blocked_tools = ["wget", "curl", "nc", "ncat", "nmap", "ssh", "scp"]
    for tool in blocked_tools:
        result = subprocess.run(
            ["which", tool], capture_output=True, text=True
        )
        found = result.returncode == 0
        assert_false(
            f"'{tool}' is not available",
            found,
            "Not found in PATH",
            f"Found at: {result.stdout.strip()} — should be removed from image"
        )

    # Shell escape via Python subprocess should be limited (no sudo, no su to root)
    result = subprocess.run(
        ["sudo", "id"],
        capture_output=True, text=True, timeout=5
    )
    assert_true(
        "sudo is not available or fails",
        result.returncode != 0,
        "sudo returned non-zero",
        f"sudo succeeded: {result.stdout.strip()}"
    )

    # Verify GRANT_SUDO env is not set to '1'
    grant_sudo = os.environ.get("GRANT_SUDO", "0")
    assert_false(
        "GRANT_SUDO env var is not '1'",
        grant_sudo == "1",
        f"GRANT_SUDO={grant_sudo}",
        "GRANT_SUDO=1 is set — user has sudo inside container"
    )


def test_linux_capabilities():
    section("6. Linux Capabilities (cap_drop ALL)")

    # We test for capabilities indirectly — if cap_drop ALL worked,
    # operations that require specific caps will fail.

    # CAP_NET_BIND_SERVICE — bind to privileged port < 1024
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        s.bind(("", 80))
        s.close()
        _record(
            "Cannot bind to privileged port 80 (CAP_NET_BIND_SERVICE dropped)",
            _Result.FAIL,
            "Binding to port 80 succeeded"
        )
    except OSError:
        assert_true(
            "Cannot bind to privileged port 80 (CAP_NET_BIND_SERVICE dropped)",
            True
        )

    # CAP_CHOWN — changing file ownership
    try:
        with tempfile.NamedTemporaryFile(dir="/tmp", delete=False) as f:
            fname = f.name
        os.chown(fname, 0, 0)   # try to chown to root
        os.unlink(fname)
        _record(
            "Cannot chown files to root (CAP_CHOWN dropped)",
            _Result.FAIL,
            "chown to root succeeded"
        )
    except (OSError, PermissionError):
        assert_true("Cannot chown files to root (CAP_CHOWN dropped)", True)
    finally:
        try:
            os.unlink(fname)
        except Exception:
            pass

    # CAP_SYS_ADMIN — mounting filesystems
    result = subprocess.run(
        ["mount", "--bind", "/tmp", "/tmp"],
        capture_output=True, text=True, timeout=5
    )
    assert_true(
        "Cannot mount filesystems (CAP_SYS_ADMIN dropped)",
        result.returncode != 0,
        "mount failed as expected",
        "mount succeeded — CAP_SYS_ADMIN may be present"
    )

    # no-new-privileges: setuid binaries shouldn't escalate
    # python -c os.setuid(0) should fail
    result = subprocess.run(
        [sys.executable, "-c", "import os; os.setuid(0); print('escalated')"],
        capture_output=True, text=True, timeout=5
    )
    assert_true(
        "Cannot setuid(0) (no-new-privileges / not root)",
        result.returncode != 0,
        "setuid(0) raised PermissionError as expected",
        f"setuid(0) succeeded: {result.stdout.strip()}"
    )


def test_resource_limits():
    section("7. Resource Limits")

    # Memory limit (4G) — we don't try to hit it, just confirm cgroup is present
    cgroup_mem = Path("/sys/fs/cgroup/memory/memory.limit_in_bytes")
    cgroup_mem_v2 = Path("/sys/fs/cgroup/memory.max")
    if cgroup_mem.exists():
        limit_bytes = int(cgroup_mem.read_text().strip())
        limit_gb    = limit_bytes / (1024 ** 3)
        assert_true(
            f"Memory cgroup limit is set ({limit_gb:.1f} GB)",
            limit_bytes > 0 and limit_bytes < 2**63 - 1,  # not "unlimited"
            f"{limit_gb:.1f} GB",
            "No memory cgroup limit detected"
        )
    elif cgroup_mem_v2.exists():
        val = cgroup_mem_v2.read_text().strip()
        assert_true(
            f"Memory cgroup limit is set (cgroup v2: {val})",
            val != "max",
            val,
            "cgroup v2 memory.max is 'max' (unlimited)"
        )
    else:
        warn("Memory cgroup limit", "cgroup memory files not found — cannot verify limit")

    # PID limit — pids_limit=200
    pids_max = Path("/sys/fs/cgroup/pids/pids.max")
    pids_max_v2 = Path("/sys/fs/cgroup/pids.max")
    if pids_max.exists():
        val = pids_max.read_text().strip()
        assert_true(
            f"PID cgroup limit is set (pids.max={val})",
            val != "max",
            val,
            "pids.max is unlimited"
        )
    elif pids_max_v2.exists():
        val = pids_max_v2.read_text().strip()
        assert_true(
            f"PID cgroup limit is set (cgroup v2, pids.max={val})",
            val != "max",
            val,
            "pids.max is unlimited"
        )
    else:
        warn("PID cgroup limit", "pids.max not found — cannot verify pids_limit")

    # ulimit — open files (nofile soft=1024)
    soft_nofile, hard_nofile = resource.getrlimit(resource.RLIMIT_NOFILE)
    assert_true(
        f"ulimit nofile is capped (soft={soft_nofile}, hard={hard_nofile})",
        hard_nofile <= 65536,
        f"soft={soft_nofile}, hard={hard_nofile}",
        f"hard nofile={hard_nofile} is very high or unlimited"
    )

    # ulimit — processes (nproc soft=128)
    soft_nproc, hard_nproc = resource.getrlimit(resource.RLIMIT_NPROC)
    assert_true(
        f"ulimit nproc is capped (soft={soft_nproc}, hard={hard_nproc})",
        hard_nproc <= 1024,
        f"soft={soft_nproc}, hard={hard_nproc}",
        f"hard nproc={hard_nproc} is very high or unlimited"
    )


def test_user_isolation():
    section("8. User Isolation (filesystem)")

    # The user volume should be namespaced to this user — there should be no
    # other users' directories accessible from /home/jovyan/work.
    # We check that /home does not expose other users' directories.
    home = Path("/home")
    if home.exists():
        other_users = [d for d in home.iterdir()
                       if d.is_dir() and d.name != "jovyan"]
        if other_users:
            # Check if we can list their contents
            accessible = []
            for d in other_users:
                try:
                    list(d.iterdir())
                    accessible.append(str(d))
                except PermissionError:
                    pass
            assert_false(
                "Cannot access other users' home directories",
                bool(accessible),
                "Other home dirs are permission-denied",
                f"Accessible: {accessible}"
            )
        else:
            assert_true(
                "No other users' home directories visible",
                True,
                "Only /home/jovyan present"
            )

    # Verify /data/users (host-side user mount root) is not visible inside container
    data_users = Path("/data/users")
    assert_false(
        "/data/users (host mount root) is not visible inside container",
        data_users.exists(),
        "Not accessible as expected",
        "/data/users is visible — other users' data may be enumerable"
    )


def test_jupyter_config():
    section("9. Jupyter Server Config")

    # Check Jupyter server config files exist and contain the right settings
    configs = [
        Path("/etc/jupyter/jupyter_server_config.py"),
        Path("/etc/jupyter/jupyter_notebook_config.py"),
    ]
    for cfg in configs:
        assert_true(
            f"Config file exists: {cfg.name}",
            cfg.exists(),
            str(cfg),
            f"Missing — security config may not be applied"
        )

    server_cfg = Path("/etc/jupyter/jupyter_server_config.py")
    if server_cfg.exists():
        content = server_cfg.read_text()
        checks = [
            ("terminals_enabled = False", "Terminals disabled in server config"),
            ("root_dir",                  "root_dir restriction present in server config"),
            ("allow_root = False",        "allow_root = False in server config"),
        ]
        for needle, label in checks:
            assert_true(
                label,
                needle in content,
                "Found in config",
                f"'{needle}' not found in {server_cfg}"
            )

    # pip.conf blocks installs
    pip_conf = Path("/etc/pip.conf")
    assert_true(
        "pip.conf is present",
        pip_conf.exists(),
        str(pip_conf),
        "/etc/pip.conf missing — pip may not be blocked by config"
    )
    # if pip_conf.exists():
    #     content = pip_conf.read_text()
    #     assert_true(
    #         "pip.conf points at a bad index (install lockdown)",
    #         "0.0.0.0" in content or "no-index" in content.lower(),
    #         "Bad index URL found",
    #         "pip.conf does not appear to block installs"
    #     )

    # GRANT_SUDO should be 0 or absent
    grant_sudo = os.environ.get("GRANT_SUDO", "0")
    assert_false(
        "GRANT_SUDO env is not '1'",
        grant_sudo == "1",
        f"GRANT_SUDO={grant_sudo}",
        "GRANT_SUDO=1 set in container environment"
    )


# ===========================================================================
# MAIN
# ===========================================================================

def main():
    print("=" * 60)
    print("  Notebook Security Regression Test Suite")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S UTC')}")
    print(f"  Running as: uid={os.getuid()} pid={os.getpid()}")
    print(f"  Python: {sys.version.split()[0]}")
    print("=" * 60)

    test_process_identity()
    test_filesystem()
    test_network_egress()
    test_package_install()
    test_shell_and_tools()
    test_linux_capabilities()
    test_resource_limits()
    test_user_isolation()
    test_jupyter_config()

    # -----------------------------------------------------------------------
    # Summary
    # -----------------------------------------------------------------------
    passed  = sum(1 for r in _results if r["status"] == _Result.PASS)
    failed  = sum(1 for r in _results if r["status"] == _Result.FAIL)
    skipped = sum(1 for r in _results if r["status"] == _Result.SKIP)
    warned  = sum(1 for r in _results if r["status"] == _Result.WARN)

    print(f"\n{'=' * 60}")
    print("  SUMMARY")
    print(f"{'=' * 60}")
    print(f"  Total:   {len(_results)}")
    print(f"  ✓ Pass:  {passed}")
    print(f"  ✗ Fail:  {failed}")
    print(f"  ~ Skip:  {skipped}")
    print(f"  ! Warn:  {warned}")

    if failed > 0:
        print(f"\n  FAILED TESTS:")
        for r in _results:
            if r["status"] == _Result.FAIL:
                print(f"    ✗ {r['name']}")
                if r["detail"]:
                    print(f"      {r['detail']}")
        print(f"\n  ✗ RESULT: {failed} test(s) FAILED — security regression detected")
        sys.exit(1)
    else:
        print(f"\n  ✓ RESULT: All tests passed")
        sys.exit(0)


if __name__ == "__main__":
    main()
