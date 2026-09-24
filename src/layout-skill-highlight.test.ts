import assert from "node:assert/strict";
import test from "node:test";
import { operatorsWithoutLayoutSkills } from "./layout-skill-highlight.ts";

test("layout highlighting matches room categories, not complete skill families", () => {
  const skill = (id: string) => ({ id, index: 0, elite: 0, level: 1 });
  const catalog = [
    { name: "Factory", buildingSkills: [skill("manu_spd_001")] },
    { name: "Training", buildingSkills: [skill("train_spd&profession_020")] },
    { name: "Both", buildingSkills: [skill("manu_prod_001"), skill("train_spd_001")] },
    { name: "No skills", buildingSkills: [] },
  ];
  assert.deepEqual([...operatorsWithoutLayoutSkills(catalog, [{ id: "factory_1", kind: "factory", level: 3 }])], ["Training", "No skills"]);
  assert.deepEqual([...operatorsWithoutLayoutSkills(catalog, [{ id: "training_room", kind: "training_room", level: 3 }])], ["Factory", "No skills"]);
});
