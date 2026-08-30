"use client";

import { useState } from "react";

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { Label } from "@/components/ui/label";

import {
  ROTATION_OPTIONS,
} from "../rotation-settings";
import type { RotationProfile } from "../types";

type RotationSettingsProps = {
  value: RotationProfile;
  onChange: (value: RotationProfile) => void;
};

const ROTATION_COMBOBOX_OPTIONS = ROTATION_OPTIONS.map((option) => ({
  value: option.profile,
  label: `${option.label} · ${option.durations.join("/")}`,
}));

export function RotationSettings({ value, onChange }: RotationSettingsProps) {
  const [query, setQuery] = useState<string | null>(null);
  const selectedComboboxOption = ROTATION_COMBOBOX_OPTIONS.find((option) => option.value === value) ?? null;
  const normalizedQuery = query?.trim().toLocaleLowerCase("zh-CN") ?? "";
  const filteredOptions = normalizedQuery
    ? ROTATION_COMBOBOX_OPTIONS.filter((option) => option.label
      .toLocaleLowerCase("zh-CN")
      .includes(normalizedQuery))
    : ROTATION_COMBOBOX_OPTIONS;

  return (
    <section aria-labelledby="rotation-settings-title" className="grid gap-3">
      <h3 id="rotation-settings-title" className="text-sm font-semibold">换班方式</h3>
      <Label htmlFor="rotation-profile" className="sr-only">换班方式</Label>
      <Combobox
        items={ROTATION_COMBOBOX_OPTIONS}
        filteredItems={filteredOptions}
        value={selectedComboboxOption}
        inputValue={query ?? selectedComboboxOption?.label ?? ""}
        itemToStringValue={(option) => option.label}
        isItemEqualToValue={(option, selectedOption) => option.value === selectedOption.value}
        autoHighlight
        onInputValueChange={(inputValue) => setQuery(inputValue)}
        onOpenChange={(open) => {
          if (!open) setQuery(null);
        }}
        onValueChange={(option) => {
          if (option) {
            setQuery(null);
            onChange(option.value);
          }
        }}
      >
        <ComboboxInput
          id="rotation-profile"
          className="font-number h-11 w-full bg-background sm:max-w-md"
          aria-label="换班方式"
          placeholder="搜索换班方式"
        />
        <ComboboxContent align="start">
          <ComboboxEmpty className="block empty:p-0">没有匹配的换班方式</ComboboxEmpty>
          <ComboboxList>
            {(option) => (
              <ComboboxItem key={option.value} value={option} className="font-number">
                {option.label}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </section>
  );
}
