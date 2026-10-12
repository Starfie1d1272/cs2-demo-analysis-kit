"""Verify notices in the actual PyInstaller output before ZIP/DMG assembly."""
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
output = Path(sys.argv[1])
license_bytes = (root / "scripts/licenses/simpleheat.LICENSE").read_bytes()
matches = [path for path in output.rglob("simpleheat.LICENSE") if path.parent.name == "studio_web"]
if not matches:
    raise SystemExit("Packaged Studio is missing the full simpleheat BSD notice")
for path in matches:
    if path.read_bytes() != license_bytes:
        raise SystemExit("Packaged simpleheat BSD notice differs from its source")
    notice = path.parent / "THIRD-PARTY-NOTICES.md"
    if not notice.is_file() or license_bytes not in notice.read_bytes():
        raise SystemExit("Packaged Studio attribution is missing the full BSD terms")
print("Packaged Studio: original simpleheat copyright, conditions and disclaimer verified")
