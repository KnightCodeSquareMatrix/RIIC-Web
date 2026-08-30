import type { FactoryProduct } from "./types.ts";

export type FactoryRecipe = FactoryProduct["factory"]["recipe"];

const MAA_PRODUCT_TO_RECIPE: Record<string, FactoryRecipe> = {
  "Pure Gold": "gold",
  "贵金属": "gold",
  "Battle Record": "battle_record",
  "作战记录": "battle_record",
  "Originium Shard": "originium",
  "源石碎片": "originium",
};

export function factoryRecipeFromMaaProduct(product: string): FactoryRecipe | null {
  return MAA_PRODUCT_TO_RECIPE[product] ?? null;
}

export function normalizeProductForLevel<T extends string>(level: number, product: T): T | "gold" {
  return level < 3 && product === "originium" ? "gold" : product;
}
