"use client";

import { useDeferredValue, useState } from "react";
import { Check } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter } from "@/components/ui/dialog";
import { SetupActionButton } from "@/components/setup/SetupActionButton";
import { OperatorIdentity, OperatorSearch, OperatorRarityFilter, OperatorProfessionFilter, OperatorRosterGrid, OPERATOR_PAGE_SIZE } from "@/components/operators/OperatorPickerParts";
import { demoOperatorName, useLanguageDemo } from "@/language-demo";
import { eligibleMasteryTargets } from "@/mastery";
import { PROFESSION_LABELS, PROFESSION_LABELS_ENGLISH } from "@/operator-presentation";
import catalog from "@/generated/arkntools/operator-catalog.json";
import { cn } from "@/lib/utils";
import type { OperBoxEntry } from "@/types";

const byId = new Map(catalog.map((o) => [o.id,o]));
export function MasteryTargetPicker({ operbox, selectedId, onSelect, onClose }: {
  operbox: readonly OperBoxEntry[]; selectedId: string | null; onSelect: (id: string) => void; onClose: () => void;
}) {
  const { locale } = useLanguageDemo();
  const en = locale === "en";
  const [selected, setSelected] = useState(selectedId);
  const [query, setQuery] = useState("");
  const [rarity, setRarity] = useState("all");
  const [profession, setProfession] = useState("all");
  const [limit, setLimit] = useState(OPERATOR_PAGE_SIZE);
  const deferred = useDeferredValue(query.trim().toLocaleLowerCase());
  const eligible = eligibleMasteryTargets(operbox);
  const filtered = eligible.filter((o) => {
    const meta = byId.get(o.id)!;
    return (rarity === "all" || o.rarity === Number(rarity)) && (profession === "all" || meta.profession === Number(profession))
      && (!deferred || [o.name,o.id,demoOperatorName(o.name,locale)].some((name) => name.toLocaleLowerCase().includes(deferred)));
  }).sort((a,b) => b.rarity - a.rarity || byId.get(b.id)!.order - byId.get(a.id)!.order);
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="max-h-[90dvh] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-[min(880px,calc(100vw-2rem))]" data-mastery-target-picker>
      <DialogHeader>
        <DialogTitle>{en ? "Choose a trainee" : "选择专精干员"}</DialogTitle>
        <DialogDescription>{en ? `${eligible.length} owned E2 operators in your current Box. This selection does not change your Box.` : `当前 Box 中已拥有的 ${eligible.length} 名精二干员。选择不会修改 Box。`}</DialogDescription>
      </DialogHeader>
      <DialogBody className="min-h-0 overflow-y-auto pb-5">
        <OperatorSearch value={query} onChange={(value) => { setQuery(value); setLimit(OPERATOR_PAGE_SIZE); }} />
        <div className="flex min-w-0 flex-wrap gap-2">
          <div className="max-w-full overflow-x-auto"><OperatorRarityFilter value={rarity} rarities={[6,5,4]} onChange={(value) => { setRarity(value); setLimit(OPERATOR_PAGE_SIZE); }} /></div>
          <div className="max-w-full overflow-x-auto"><OperatorProfessionFilter value={profession} onChange={(value) => { setProfession(value); setLimit(OPERATOR_PAGE_SIZE); }} /></div>
        </div>
        {filtered.length ? <OperatorRosterGrid hasMore={limit < filtered.length} onLoadMore={() => setLimit((value) => value + OPERATOR_PAGE_SIZE)}>
          {filtered.slice(0,limit).map((o) => <button key={o.id} type="button" aria-label={en ? `Select ${demoOperatorName(o.name,locale)}` : `选择${o.name}`} aria-pressed={selected === o.id}
            onClick={() => setSelected(o.id)} className={cn("flex min-w-0 items-center gap-3 rounded-[4px] border bg-background p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring", selected === o.id ? "border-primary ring-1 ring-primary" : "border-border hover:bg-muted")}>
            <OperatorIdentity name={o.name} portrait={byId.get(o.id)?.portrait}>
              <span className="font-number text-xs text-muted-foreground">{o.rarity}★ · {en ? "E2" : "精二"} · {(en ? PROFESSION_LABELS_ENGLISH : PROFESSION_LABELS)[byId.get(o.id)!.profession]}</span>
            </OperatorIdentity>
            {selected === o.id ? <Check className="ml-auto size-4 shrink-0" aria-hidden="true" /> : null}
          </button>)}
        </OperatorRosterGrid> : <p className="py-10 text-center text-sm text-muted-foreground">{en ? "No matching owned E2 operators." : "没有符合条件的已拥有精二干员。"}</p>}
      </DialogBody>
      <DialogFooter>
        <SetupActionButton variant="outline" onClick={onClose}>{en ? "Cancel" : "取消"}</SetupActionButton>
        <SetupActionButton disabled={!eligible.some((o) => o.id === selected)} onClick={() => { if (selected) onSelect(selected); }}>{en ? "Use this operator" : "选择这名干员"}</SetupActionButton>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
