import datetime
import hashlib
import io
import json
import os
import re
import sys
import time

WATCH_ROOT = r"C:\Claude"
KIMI_HOME = os.path.expanduser(os.path.join("~", ".kimi-code"))
PROJECTS = os.path.join(KIMI_HOME, "projects.json")
LOG = os.path.join(KIMI_HOME, "logs", "projects-watch.log")
POLL_SECONDS = 10


def log(msg):
    line = "%s %s" % (datetime.datetime.now().isoformat(timespec="seconds"), msg)
    try:
        with io.open(LOG, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except OSError:
        pass


def slug(name):
    t = re.sub(r"[^a-z0-9._-]+", "-", name.lower()).strip("-")[:40].strip("-")
    return t if t and t not in (".", "..") else "workspace"


def workspace_id(root):
    t = root.replace(chr(92), "/").rstrip("/")
    digest = hashlib.sha256(t.encode("utf-8")).hexdigest()[:12]
    return "wd_%s_%s" % (slug(t.split("/")[-1]), digest)


def load_projects():
    with io.open(PROJECTS, encoding="utf-8") as f:
        return json.load(f)


def save_projects(data):
    backup = PROJECTS + ".watchbak"
    try:
        with io.open(backup, "w", encoding="utf-8", newline="\n") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except OSError:
        pass
    tmp = PROJECTS + ".watchtmp"
    with io.open(tmp, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, PROJECTS)


def sync_once():
    data = load_projects()
    projects = data.setdefault("projects", {})
    deleted = set(data.get("deleted_project_ids") or [])
    added = []
    for name in sorted(os.listdir(WATCH_ROOT)):
        root = os.path.join(WATCH_ROOT, name)
        if not os.path.isdir(root):
            continue
        canonical = "C:/Claude/" + name
        wid = workspace_id(canonical)
        if wid in projects or wid in deleted:
            continue
        now = datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z")
        projects[wid] = {
            "root": canonical,
            "name": name,
            "kind": "managed",
            "created_at": now,
            "last_opened_at": now,
        }
        added.append(name)
    if added:
        save_projects(data)
        log("registered: " + ", ".join(added))
    return added


def main():
    if "--once" in sys.argv:
        added = sync_once()
        print("added:", added)
        return
    log("watcher started")
    while True:
        try:
            sync_once()
        except Exception as exc:
            log("sync failed: %r" % (exc,))
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()
