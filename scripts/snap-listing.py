#!/usr/bin/env python3
"""Replace the Snap Store listing's banner and screenshots with the website's pictures.

Usage: snap-listing.py <dir> [--dry-run]

<dir> holds the website's pictures (apps/website/out/media, or CI's `media`
artifact). Needs SNAPCRAFT_STORE_CREDENTIALS from `snapcraft export-login`.
"""

import argparse
import base64
import hashlib
import json
import os
import sys
from pathlib import Path

import requests
from pymacaroons import Macaroon

SNAP_ID = "cutBsEVrLzSI6MJzxLv3DnLrWjjHIbH8"  # alto
URL = f"https://dashboard.snapcraft.io/dev/api/snaps/{SNAP_ID}/binary-metadata"

# In the order the listing shows them.
MEDIA = [
    ("banner", "snap-banner.png"),
    ("screenshot", "snap-screenshot-1.png"),
    ("screenshot", "snap-screenshot-2.png"),
    ("screenshot", "snap-screenshot-3.png"),
    ("screenshot", "snap-screenshot-4.png"),
    ("screenshot", "snap-screenshot-5.png"),
]


def authorization() -> str:
    """The header craft-store sends: the root macaroon, and the discharge bound to it."""
    creds = json.loads(base64.b64decode(os.environ["SNAPCRAFT_STORE_CREDENTIALS"]))
    if creds.get("t") != "u1-macaroon":
        sys.exit("SNAPCRAFT_STORE_CREDENTIALS isn't an Ubuntu One login from `snapcraft export-login`")
    root, discharge = creds["v"]["r"], creds["v"]["d"]
    bound = Macaroon.deserialize(root).prepare_for_request(Macaroon.deserialize(discharge))
    return f"Macaroon root={root}, discharge={bound.serialize()}"


def check(response: requests.Response) -> requests.Response:
    if not response.ok:
        sys.exit(f"{response.request.method} {response.url}: {response.status_code}\n{response.text}")
    return response


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("dir", type=Path)
    parser.add_argument("--dry-run", action="store_true", help="show what would change, and change nothing")
    args = parser.parse_args()

    headers = {"Authorization": authorization(), "Accept": "application/json"}
    current = check(requests.get(URL, headers=headers, timeout=60)).json()
    print("Now:", *(f"  {m['type']}: {m['filename']}" for m in current), sep="\n")

    # A PUT replaces everything not listed, so the icon (from snapcraft.yaml) is passed back as it is.
    info = [m for m in current if m["type"] == "icon"]
    files = {}
    for i, (kind, name) in enumerate(MEDIA):
        data = (args.dir / name).read_bytes()
        key = f"{kind}-{i}"
        info.append({"key": key, "type": kind, "filename": name, "hash": hashlib.sha256(data).hexdigest()})
        files[key] = (name, data, "image/png")
    print("New:", *(f"  {m['type']}: {m['filename']}" for m in info), sep="\n")

    if args.dry_run:
        print("Dry run: nothing changed.")
        return
    check(requests.put(URL, headers=headers, data={"info": json.dumps(info)}, files=files, timeout=300))
    print("Updated the listing.")


if __name__ == "__main__":
    main()
