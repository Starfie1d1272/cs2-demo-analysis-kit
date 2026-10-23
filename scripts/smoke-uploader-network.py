"""Opt-in live HTTPS verification: public identity and a rejected, empty pairing poll."""
import argparse
import http.client
import json
import logging
import platform
import ssl
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

from cs2dak.rivalhub_uploader import NoRedirect, UploaderApi
from cs2dak.uploader_transport import UploaderHTTPSHandler, tls_context

ORIGIN = "https://match.starfie1d.top"


def probe(name, handler):
    started = time.monotonic()
    try:
        handlers = [NoRedirect()] + ([handler] if handler is not None else [])
        with urllib.request.build_opener(*handlers).open(
                ORIGIN + "/api/system/release", timeout=15) as response:
            body = json.load(response)
            valid = (set(body) == {"releaseTag", "releaseCommit"}
                     and isinstance(body["releaseTag"], str)
                     and isinstance(body["releaseCommit"], str)
                     and len(body["releaseCommit"]) == 40)
            result = {"name": name, "status": response.status, "validIdentity": valid}
            if valid:
                result["identity"] = body
    except (OSError, ValueError, http.client.HTTPException) as error:
        reason = getattr(error, "reason", error)
        result = {"name": name, "error": type(reason).__name__,
                  "status": getattr(error, "code", None)}
    result["elapsedMs"] = round((time.monotonic() - started) * 1000)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    probes = [probe("previous-urllib-default", None)]
    for version in [ssl.TLSVersion.TLSv1_2, ssl.TLSVersion.TLSv1_3]:
        context = tls_context(version)
        context.maximum_version = version
        probes.append(probe(version.name, urllib.request.HTTPSHandler(context=context)))
    probes.append(probe("uploader-preferred-tls", UploaderHTTPSHandler()))
    with tempfile.TemporaryDirectory(prefix="uploader-network-smoke-") as directory:
        api = UploaderApi(Path(directory))
        try:
            api.configure(ORIGIN)
            # The server rejects this before looking up a pairing or writing data.
            result = api.request("/pairing/poll", "POST", {})
            rejected = (result["status"] == 422
                        and result["body"].get("error", {}).get("code") == "VALIDATION_FAILED")
            probes.append({"name": "uploader-empty-poll", "status": result["status"],
                           "expectedValidation": rejected})
        finally:
            api.close()
    report = {"python": platform.python_version(), "platform": platform.system(),
              "openssl": ssl.OPENSSL_VERSION, "origin": ORIGIN, "probes": probes}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0 if probes[-2].get("validIdentity") and rejected else 1


if __name__ == "__main__":
    raise SystemExit(main())
