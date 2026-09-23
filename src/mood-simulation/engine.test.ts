import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { D, ledger, operator, type World } from "./rules.ts";
import { detailAt, pointAt, segmentAt, simulate } from "./engine.ts";
import { defaultMoodSettings, type MoodSimulationInput } from "./types.ts";
import type { RoomKind } from "../types.ts";
type FixtureRoom = { type: string; level: number; operators: {name: string; elite: number; level: number; mood: number}[] };
type TrajectoryFixture = {shifts: {type: string;level: number;operators: string[]}[][];cycles: number;idle: boolean;target: string;points: {time: number;moods: Record<string,number>}[];layouts:{time:number;rooms:Record<string,string[]>}[]};
const fixtures = JSON.parse(readFileSync(new URL("./reference-fixtures.json",import.meta.url),"utf8")) as {
  rates: {rooms: FixtureRoom[];rates: Record<string,number[]>}[];trajectories: TrajectoryFixture[];
};

test("all reference skill/unlock/mood and interacting-room rates match Python", () => {
  for (const [index,fixture] of fixtures.rates.entries()) {
    const w: World = {initial:{},rooms:fixture.rooms.map((r,i) => ({
      id:String(i),type:r.type,level:r.level,capacity:5,ops:r.operators.map(o => ({...operator(o.name,o.elite,o.level),mood:new D(o.mood)})),
    }))};
    for (const r of w.rooms) for (const o of r.ops) {
      const got=ledger(w,o), expected=(fixture.rates as Record<string,number[]>)[o.name]!;
      assert.ok(got.consume.sub(expected[0]!).abs().lt("0.000001"), `case ${index} ${o.name} consumption ${got.consume} != ${expected[0]}`);
      assert.ok(got.recover.sub(expected[1]!).abs().lt("0.000001"), `case ${index} ${o.name} recovery ${got.recover} != ${expected[1]}`);
    }
  }
});
const kinds: Record<string,RoomKind>={control_center:"control_center",trading:"trade_post",dormitory:"dormitory"};
export function referenceInput(f: typeof fixtures.trajectories[number]): MoodSimulationInput {
  const names=[...new Set(f.shifts.flatMap(s => s.flatMap(r => r.operators)))];
  return {
    layout:{template:"test",drone_cap:200,scenario:{},rooms:f.shifts[0]!.map((r,i) => ({id:String(i),kind:kinds[r.type]!,level:r.level,dorm_beds:5}))},
    operbox:names.map(name => ({id:name,name,own:true,elite:2,level:30,potential:0,rarity:5})),
    fiammettaEnabled:true,
    settings:{...defaultMoodSettings(),cycles:f.cycles,idleEnabled:f.idle,
      fiammetta:{0:{enabled:true,mode:"specified",wait:true},1:{enabled:true,mode:"specified",wait:true}}},
    draft:{version:3,scheduleMode:"sequential",externalOperatorNames:[],startTime:"04:00",activeShift:0,fiammettaEnabled:true,
      shifts:f.shifts.map((s,i) => ({durationHours:i===0?11.5:12.5,fiammettaTarget:f.target,droneTargetRoomId:null,
        rooms:Object.fromEntries(s.map((r,j) => [String(j),{operators:r.operators}]))}))},
  };
}
test("1/3/7-cycle trajectories, waiting and idle admission match Python", () => {
  for (const [index,f] of fixtures.trajectories.entries()) {
    const input=referenceInput(f),before=JSON.stringify(input),result=simulate(input);
    assert.equal(JSON.stringify(input),before,"simulation must not mutate the schedule or roster");
    for (const point of f.points) {
      const moods=pointAt(result,point.time);
      for (const [name,value] of Object.entries(point.moods)) assert.ok(Math.abs(moods[name]!-value)<1e-6,`trajectory ${index}, t=${point.time}, ${name}: ${moods[name]} != ${value}`);
    }
    for (const p of result.points) for (const mood of Object.values(p.moods)) assert.ok(mood>=0 && mood<=24);
    for (const snapshot of f.layouts) assert.deepEqual(segmentAt(result,snapshot.time).rooms,snapshot.rooms,`trajectory ${index} layout at ${snapshot.time}`);
    const detail=detailAt(input,result,12,f.target);
    assert.ok(Number.isFinite(detail.net));
  }
});
test("same-time jumps are right-continuous; playback does not interpolate a jump backwards", () => {
  const result=simulate(referenceInput(fixtures.trajectories[0]!));
  const jump=result.points.findIndex((p,i) => i>0 && p.time===result.points[i-1]!.time &&
    result.names.some(n => p.moods[n]!==result.points[i-1]!.moods[n]));
  assert.ok(jump>0);
  const before=result.points[jump-1]!,after=result.points[jump]!;
  assert.deepEqual(pointAt(result,after.time),after.moods);
  const name=result.names.find(n => before.moods[n]!==after.moods[n])!;
  assert.ok(Math.abs(pointAt(result,after.time-1e-8)[name]!-before.moods[name]!)<1e-6);
});
