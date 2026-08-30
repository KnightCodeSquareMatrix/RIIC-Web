"use client";

import { useEffect, useState } from "react";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface PaginationProps {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, pageCount, onPageChange }: PaginationProps) {
  const [draft, setDraft] = useState(String(page));

  useEffect(() => setDraft(String(page)), [page]);

  if (pageCount <= 1) return null;

  function commit() {
    const parsed = Number(draft);
    if (Number.isInteger(parsed) && parsed >= 1 && parsed <= pageCount) {
      onPageChange(parsed);
    } else {
      setDraft(String(page));
    }
  }

  return (
    <div
      className="mx-auto flex w-full max-w-md items-center justify-between gap-2 sm:w-auto sm:max-w-none sm:justify-center"
      aria-label="分页"
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        aria-label="上一页"
        className="shrink-0"
      >
        <ChevronLeft aria-hidden="true" />
        上一页
      </Button>
      <div className="flex min-w-0 items-center justify-center gap-1">
        <Input
          type="number"
          inputMode="numeric"
          min={1}
          max={pageCount}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            }
          }}
          aria-label="当前页，可输入页码跳转"
          className="w-12 px-0 text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <span className="shrink-0 text-sm text-muted-foreground">
          / <span className="font-number">{pageCount}</span>
        </span>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={page >= pageCount}
        onClick={() => onPageChange(page + 1)}
        aria-label="下一页"
        className="shrink-0"
      >
        下一页
        <ChevronRight aria-hidden="true" />
      </Button>
    </div>
  );
}
