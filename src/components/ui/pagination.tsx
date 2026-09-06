"use client";
import { useTranslations } from "next-intl";

import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

function Pagination({ className, ...props }: React.ComponentProps<"nav">) {
  return (
    <nav
      role="navigation"
      aria-label="pagination"
      className={cn("mx-auto flex w-full justify-center", className)}
      {...props}
    />
  );
}

function PaginationContent({ className, ...props }: React.ComponentProps<"ul">) {
  return <ul className={cn("flex flex-row items-center gap-1", className)} {...props} />;
}

function PaginationItem({ className, ...props }: React.ComponentProps<"li">) {
  return <li className={cn("", className)} {...props} />;
}

type PaginationLinkProps = {
  isActive?: boolean;
  size?: "default" | "sm" | "lg" | "icon";
} & React.ComponentProps<"a">;

function PaginationLink({ className, isActive, size = "icon", ...props }: PaginationLinkProps) {
  return (
    <a
      aria-current={isActive ? "page" : undefined}
      className={cn(
        buttonVariants({
          variant: isActive ? "outline" : "ghost",
          size,
        }),
        isActive && "border-border",
        className
      )}
      {...props}
    />
  );
}

function PaginationPrevious({ className, ...props }: React.ComponentProps<typeof PaginationLink>) {
  const intl = useTranslations();

  return (
    <PaginationLink
      aria-label="Go to previous page"
      size="default"
      className={cn("gap-1 pl-2.5", className)}
      {...props}
    >
      <ChevronLeft aria-hidden="true" />
      <span>{intl("components_ui_pagination.previous")}</span>
    </PaginationLink>
  );
}

function PaginationNext({ className, ...props }: React.ComponentProps<typeof PaginationLink>) {
  const intl = useTranslations();

  return (
    <PaginationLink
      aria-label="Go to next page"
      size="default"
      className={cn("gap-1 pr-2.5", className)}
      {...props}
    >
      <span>{intl("components_ui_pagination.next")}</span>
      <ChevronRight aria-hidden="true" />
    </PaginationLink>
  );
}

function PaginationEllipsis({ className, ...props }: React.ComponentProps<"span">) {
  const intl = useTranslations();

  return (
    <span
      aria-hidden
      className={cn("flex size-9 items-center justify-center", className)}
      {...props}
    >
      <MoreHorizontal className="size-4" />
      <span className="sr-only">{intl("components_ui_pagination.morePages")}</span>
    </span>
  );
}

export {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
};
