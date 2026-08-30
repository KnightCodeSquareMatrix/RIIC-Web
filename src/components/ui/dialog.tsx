"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { motion, type HTMLMotionProps } from "motion/react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { MOTION_DURATION, MOTION_EASE_OUT } from "@/motion"
import { XIcon } from "lucide-react"

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  layer = "base",
  ...props
}: DialogPrimitive.Backdrop.Props & {
  layer?: "base" | "nested"
}) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      data-dialog-layer={layer}
      render={(renderProps, state) => (
        <motion.div
          {...(renderProps as unknown as HTMLMotionProps<"div">)}
          initial={{ opacity: 0 }}
          animate={{ opacity: state.open ? 1 : 0 }}
          transition={{
            duration: state.open ? 0.2 : MOTION_DURATION.fast,
            ease: MOTION_EASE_OUT,
          }}
        />
      )}
      className={cn(
        "fixed inset-0 isolate z-50",
        layer === "nested"
          ? "bg-black/[0.08] supports-backdrop-filter:max-sm:backdrop-blur-[2px] supports-backdrop-filter:sm:backdrop-blur-[3px]"
          : "bg-black/20 supports-backdrop-filter:max-sm:backdrop-blur-[4px] supports-backdrop-filter:sm:backdrop-blur-[8px]",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  layer = "base",
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean
  layer?: "base" | "nested"
}) {
  return (
    <DialogPortal>
      <DialogOverlay layer={layer} />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        data-dialog-layer={layer}
        render={(renderProps, state) => (
          <motion.div
            {...(renderProps as unknown as HTMLMotionProps<"div">)}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{
              opacity: state.open ? 1 : 0,
              scale: state.open ? 1 : 0.97,
            }}
            transition={{
              duration: state.open ? 0.3 : MOTION_DURATION.fast,
              ease: MOTION_EASE_OUT,
            }}
            style={{ ...(renderProps.style ?? {}), transformOrigin: "center" }}
          />
        )}
        className={cn(
          "dialog-acrylic fixed top-1/2 left-1/2 z-50 isolate grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-0 overflow-hidden rounded-[24px] p-0 text-sm text-popover-foreground outline-none sm:max-w-[min(480px,calc(100vw-2rem))] sm:rounded-[32px]",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            render={
              <Button
                variant="ghost"
                className="pointer-events-auto absolute top-3 right-3 z-20 size-10 rounded-[4px] bg-transparent hover:bg-transparent"
                size="icon"
              />
            }
          >
            <XIcon
            />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("relative z-[1] flex flex-col gap-2 px-5 pb-3 pt-5 pr-14 sm:px-7 sm:pb-4 sm:pt-6 sm:pr-16", className)}
      {...props}
    />
  )
}

function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-body"
      className={cn("relative z-[1] grid gap-4 px-5 py-3 sm:px-7", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "relative z-[1] flex flex-row items-center justify-end gap-2 px-5 pb-5 pt-3 sm:px-7 sm:pb-6 sm:pt-4",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button size="dialog" variant="ghost" />}>
          Close
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({ className, children, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "flex min-h-8 items-center gap-3 font-heading text-lg font-semibold leading-tight",
        className
      )}
      {...props}
    >
      <span className="h-6 w-1 shrink-0 bg-primary" aria-hidden="true" />
      <span className="min-w-0">{children}</span>
    </DialogPrimitive.Title>
  )
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-[13px] leading-5 text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
