"use client";

import { useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export function RemoteAvatar({
  src,
  alt,
  pixelSize,
  className,
  imageClassName,
  emptyFallback,
  loadingFallback,
}: {
  src?: string | null;
  alt: string;
  pixelSize: number;
  className?: string;
  imageClassName?: string;
  emptyFallback: ReactNode;
  loadingFallback?: ReactNode;
}) {
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const loaded = Boolean(src && loadedSrc === src);
  const failed = Boolean(src && failedSrc === src);

  return (
    <span
      className={cn("relative grid shrink-0 place-items-center overflow-hidden", className)}
      aria-busy={src && !loaded && !failed ? "true" : undefined}
      data-remote-avatar-state={!src || failed ? "fallback" : loaded ? "loaded" : "loading"}
    >
      {!src || failed ? emptyFallback : loaded ? null : loadingFallback ?? emptyFallback}
      {src && !failed ? (
        <img
          src={src}
          alt={alt}
          width={pixelSize}
          height={pixelSize}
          decoding="async"
          fetchPriority="high"
          referrerPolicy="no-referrer"
          onLoad={() => setLoadedSrc(src)}
          onError={() => setFailedSrc(src)}
          className={cn("absolute inset-0 size-full object-cover transition-opacity duration-150", loaded ? "opacity-100" : "opacity-0", imageClassName)}
        />
      ) : null}
    </span>
  );
}
