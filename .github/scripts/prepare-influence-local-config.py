"""Reserve the disposable ACL rehearsal's mail UI port without changing DB semantics."""
from pathlib import Path
import re
import sys

path = Path(sys.argv[1])
text = path.read_text()
section = re.search(r"(?ms)^\[inbucket\]\s*\n(.*?)(?=^\[|\Z)", text)
if section:
    block = section.group(0)
    if re.search(r"(?m)^port\s*=", block):
        replacement = re.sub(r"(?m)^port\s*=.*$", "port = 55324", block, count=1)
    else:
        header_end = block.find("\n") + 1
        replacement = block[:header_end] + "port = 55324\n" + block[header_end:]
    text = text[:section.start()] + replacement + text[section.end():]
else:
    text = text.rstrip() + "\n\n[inbucket]\nport = 55324\n"
path.write_text(text)
