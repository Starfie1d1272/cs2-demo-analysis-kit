"""Verify notices in the actual PyInstaller output before ZIP/DMG assembly."""
import sys
import zipfile
from pathlib import Path

root = Path(__file__).resolve().parent.parent
output = Path(sys.argv[1])
product = sys.argv[2] if len(sys.argv) > 2 else "studio"
web_dir = "studio_web" if product == "studio" else "rivalhub_uploader_web"
licenses = ["cs2-demo-format.LICENSE", "rival-rating.LICENSE"]
if product == "studio":
    licenses.append("simpleheat.LICENSE")
expected = {name: (root / "scripts/licenses" / name).read_bytes() for name in licenses}
if output.suffix == ".zip":
    with zipfile.ZipFile(output) as archive:
        notices = [name for name in archive.namelist() if name.endswith(f"{web_dir}/THIRD-PARTY-NOTICES.md")]
        if not notices:
            raise SystemExit("Desktop ZIP missing full upstream license notices")
        for name in notices:
            notice = archive.read(name)
            for license_name, original in expected.items():
                if archive.read(name.removesuffix("THIRD-PARTY-NOTICES.md") + license_name) != original or original not in notice:
                    raise SystemExit("Desktop ZIP upstream license bytes or attribution differ")
else:
    notices = [path for path in output.rglob("THIRD-PARTY-NOTICES.md") if path.parent.name == web_dir]
    if not notices:
        raise SystemExit("Packaged desktop missing full upstream license notices")
    for path in notices:
        for name, original in expected.items():
            if (path.parent / name).read_bytes() != original or original not in path.read_bytes():
                raise SystemExit("Packaged desktop upstream license bytes or attribution differ")
print(f"Packaged {product}: original upstream copyright, license terms and disclaimers verified")
