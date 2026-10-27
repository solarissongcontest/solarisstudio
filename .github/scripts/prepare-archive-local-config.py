"""Give each disposable Archive CI stack its own project and available host ports.

The Archive rehearsals discover API/DB endpoints through `supabase status`; no
fixture depends on the CLI's default ports. This changes transport only, never
migration or Archive semantics, and leaves unrelated containers untouched.
"""
from contextlib import ExitStack
from pathlib import Path
import re
import socket
import sys

PORTS = (
    ("api", "port"),
    ("db", "port"),
    ("db", "shadow_port"),
    ("db.pooler", "port"),
    ("studio", "port"),
    ("inbucket", "port"),
    ("inbucket", "smtp_port"),
    ("inbucket", "pop3_port"),
    ("analytics", "port"),
)


def set_value(text, section, key, value):
    pattern = rf"(?ms)^\[{re.escape(section)}\][ \t]*\n.*?(?=^\[|\Z)" if section else r"(?ms)\A.*?(?=^\[|\Z)"
    match = re.search(pattern, text)
    if not match:
        return text.rstrip() + f"\n\n[{section}]\n{key} = {value}\n"
    block = match.group(0)
    assignment = rf"(?m)^{re.escape(key)}[ \t]*=.*$"
    if re.search(assignment, block):
        block = re.sub(assignment, f"{key} = {value}", block, count=1)
    else:
        block = block.rstrip() + f"\n{key} = {value}\n\n"
    return text[:match.start()] + block + text[match.end():]


def prepare(path, namespace):
    if not re.fullmatch(r"archive-[a-z0-9-]+", namespace):
        raise ValueError("Archive local project must have an explicit archive-* namespace")
    text = path.read_text()
    text = set_value(text, "", "project_id", f'"{namespace}"')
    # Hold every probe until all ports are chosen, preventing duplicate choices
    # within this stack. The kernel skips any existing listener, including 54322.
    with ExitStack() as stack:
        for section, key in PORTS:
            listener = stack.enter_context(socket.socket(socket.AF_INET, socket.SOCK_STREAM))
            listener.bind(("0.0.0.0", 0))
            text = set_value(text, section, key, listener.getsockname()[1])
        path.write_text(text)


if __name__ == "__main__":
    prepare(Path(sys.argv[1]), sys.argv[2])
