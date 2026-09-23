"""Generate independent Python reference results, never using the TypeScript port."""
import json
import random
import sys
import subprocess
from pathlib import Path
from decimal import Decimal

root = Path(sys.argv[1]).resolve()
assert subprocess.check_output(["git", "-C", str(root), "rev-parse", "HEAD"], text=True).strip() == "5204c840b7a99fdf79cd3815507894b001132162"
sys.path.insert(0, str(root))
import mood_soc
from data.skills_data import DEFAULT_OPERATORS, SKILLS
from mood_soc.rules import mood_ledger
from mood_soc.scenario import build_base_layout
from store.schedule import Shift, Schedule, simulate_schedule
from mood_soc.models import EntryShiftOverride

rng = random.Random(5204)
cases = []
names = list(DEFAULT_OPERATORS)
types = ["control_center", "manufacturing", "trading", "power", "office", "reception", "dormitory", "workshop", "training"]

def fixture(facs):
    world = build_base_layout({"facilities": facs})
    rates = {}
    for op in world.all_operators():
        lg = mood_ledger(world, op.name)
        rates[op.name] = [float(max(Decimal(0), lg.total(mood_soc.ledger.Bucket.CONSUME))),
                          float(lg.total(mood_soc.ledger.Bucket.RECOVER))]
    cases.append({"rooms": facs, "rates": rates})

# Every equipped clause, each unlock tier and mood boundary, plus interacting rooms.
for name, ids in DEFAULT_OPERATORS.items():
    applicable = {"dormitory", "control_center"}
    for sid in ids:
        applicable.update(t.value for t in SKILLS[sid].facility_types)
    for kind in sorted(applicable):
        if kind not in types:
            continue
        for elite, mood in [(0, 24), (1, 12), (2, 0), (2, 11.9), (2, 17.9), (2, 19.9), (2, 24)]:
            fixture([{"type": kind, "level": 3, "operators": [{"name": name, "elite": elite, "level": 30, "mood": mood}]}])
for _ in range(100):
    chosen = rng.sample(names, 30)
    facs = []
    for index, kind in enumerate(["control_center", "manufacturing", "trading", "dormitory", "dormitory", "dormitory"]):
        facs.append({"type": kind, "level": 3, "slots": 5, "operators": [
            {"name": n, "elite": 2, "level": 30, "mood": rng.choice([0, 8, 12, 17, 19, 23, 24])}
            for n in chosen[index*5:index*5+5]]})
    fixture(facs)

trajectories = []
sets = [
    [["玛恩纳", "令", "夕", "重岳", "魔王"], ["巫恋", "但书", "龙舌兰"], ["菲亚梅塔", "杜林", "桃金娘"]],
    [["阿米娅", "维什戴尔", "魔王", "陈", "凯尔希"], ["德克萨斯", "拉普兰德", "能天使"], ["菲亚梅塔", "摩根", "推进之王"]],
    [["玛恩纳", "黍", "令", "夕", "重岳"], ["火哨", "巫恋", "但书"], ["菲亚梅塔", "刺玫", "冰酿"]],
]
for group in sets:
    base = [{"type": "control_center", "level": 5, "operators": group[0]},
            {"type": "trading", "level": 3, "operators": group[1]},
            {"type": "dormitory", "level": 5, "slots": 5, "operators": group[2]},
            {"type": "dormitory", "level": 3, "slots": 5, "operators": []}]
    second = json.loads(json.dumps(base))
    second[1]["operators"], second[3]["operators"] = [group[2][1]], group[1]
    second[2]["operators"] = [group[2][0], group[2][2]]
    for cycles in [1, 3, 7]:
        for idle in [False, True]:
            shifts = [Shift("A", Decimal("11.5"), base), Shift("B", Decimal("12.5"), second)]
            schedule = Schedule(shifts)
            traj = simulate_schedule(schedule, cycles=cycles, idle_to_dorm=idle, entry_events=True,
                                     entry_swap_with=group[1][0], entry_scope="anywhere", entry_when="wait")
            points = [{"time": float(t), "moods": {n: float(traj.mood_at(n, t)) for n in traj.names}}
                      for t in sorted(set(traj.times) | {Decimal("0.1"), Decimal("11.49"), Decimal("23.99")})]
            trajectories.append({"shifts": [base, second], "cycles": cycles, "idle": idle,
                                 "target": group[1][0], "points": points,
                                 "layouts": [{"time": float(a), "rooms": {str(i): [o.name for o in room.operators] for i, room in enumerate(world.facilities)}} for a, b, world in traj.segments]})
out = Path(__file__).resolve().parents[1] / "src/mood-simulation/reference-fixtures.json"
out.write_text(json.dumps({"rates": cases, "trajectories": trajectories}, ensure_ascii=False, separators=(",", ":"))+"\n", encoding="utf-8")
print(f"Generated {len(cases)} rate cases and {len(trajectories)} trajectory cases")
