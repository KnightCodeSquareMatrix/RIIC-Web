"""Export the authorized Rhodes-MoodSOC rule catalog; no Python is needed at runtime.

Usage: python scripts/generate-mood-data.py /path/to/pinned/reference
"""
import dataclasses
import csv
import enum
import json
from pathlib import Path
import subprocess
import sys
from decimal import Decimal

REVISION = "5204c840b7a99fdf79cd3815507894b001132162"
root = Path(sys.argv[1]).resolve()
assert subprocess.check_output(["git", "-C", str(root), "rev-parse", "HEAD"], text=True).strip() == REVISION
sys.path.insert(0, str(root))
from data import skills_data as data


def encode(value):
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, enum.Enum):
        return value.value
    if dataclasses.is_dataclass(value):
        return {field.name: encode(getattr(value, field.name)) for field in dataclasses.fields(value)}
    if callable(value):
        return {"name": value.__qualname__.split(".<locals>")[0],
                "args": [encode(cell.cell_contents) for cell in value.__closure__ or []]}
    if isinstance(value, dict):
        return {str(key): encode(item) for key, item in value.items()}
    if isinstance(value, (tuple, list, set)):
        return [encode(item) for item in value]
    return value


result = {
    "revision": REVISION,
    "skills": encode(data.SKILLS),
    "equips": {name: {sid: encode(equip) for (owner, sid), equip in data.SKILL_EQUIPS.items() if owner == name}
               for name in sorted({name for name, sid in data.SKILL_EQUIPS})},
    "operators": encode(data.DEFAULT_OPERATORS),
    "factions": encode(data.OPERATOR_FACTIONS),
    "producers": encode(data.VARIABLE_PRODUCERS),
    "spread": encode(sorted(data.SPREAD_SKILL_IDS)),
    "knownOperators": sorted({row["operator_name"] for row in csv.DictReader((root / "data/operators.txt").open(encoding="utf-8-sig"))}),
}
out = Path(__file__).resolve().parents[1] / "src/mood-simulation/catalog.json"
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
print(f"Exported {len(result['skills'])} clauses / {len(result['operators'])} operators from {REVISION}")
