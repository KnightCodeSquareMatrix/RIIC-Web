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
import { useLanguageDemo } from "@/language-demo";

import {
  ROTATION_OPTIONS,
} from "../rotation-settings";
import type { RotationProfile } from "../types";

type RotationSettingsProps = {
  value: RotationProfile;
  onChange: (value: RotationProfile) => void;
};

const EN_ROTATION_LABELS: Record<RotationProfile, string> = {
  abc_12_6_6: "Three shifts per day",
  main_backup_12_12: "Main / backup rotation",
  abc_12_12_12: "Two rotations per day",
  fiammetta_8_8_4_4: "Fiammetta rotation",
  abyssal_7_5_7_5: "Abyssal Hunters rotation",
};

export function RotationSettings({ value, onChange }: RotationSettingsProps) {
  const { locale } = useLanguageDemo();
  const en = locale === "en";
  const [query, setQuery] = useState<string | null>(null);
  const rotationComboboxOptions = ROTATION_OPTIONS.map((option) => ({
    value: option.profile,
    label: `${en ? EN_ROTATION_LABELS[option.profile] : option.label} · ${option.durations.join("/")}`,
  }));
  const selectedComboboxOption = rotationComboboxOptions.find((option) => option.value === value) ?? null;
  const normalizedQuery = query?.trim().toLocaleLowerCase(en ? "en-US" : "zh-CN") ?? "";
  const filteredOptions = normalizedQuery
    ? rotationComboboxOptions.filter((option) => option.label
      .toLocaleLowerCase(en ? "en-US" : "zh-CN")
      .includes(normalizedQuery))
    : rotationComboboxOptions;

  return (
    <section aria-labelledby="rotation-settings-title" className="grid gap-3">
      <h3 id="rotation-settings-title" className="text-sm font-semibold">{en ? "Rotation" : "换班方式"}</h3>
      <Label htmlFor="rotation-profile" className="sr-only">{en ? "Rotation" : "换班方式"}</Label>
      <Combobox
        items={rotationComboboxOptions}
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
          aria-label={en ? "Rotation" : "换班方式"}
          placeholder={en ? "Choose a rotation" : "选择换班方式"}
          readOnly
        />
        <ComboboxContent align="start">
          <ComboboxEmpty className="block empty:p-0">{en ? "No matching rotation" : "没有匹配的换班方式"}</ComboboxEmpty>
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
