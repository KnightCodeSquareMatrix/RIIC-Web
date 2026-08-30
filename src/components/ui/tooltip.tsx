"use client"

import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"
import {
  cloneElement,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react"
import { motion, type HTMLMotionProps } from "motion/react"

import { cn } from "@/lib/utils"
import { MOTION_EASE_OUT } from "@/motion"

function TooltipProvider({
  delay = 400,
  timeout = 400,
  ...props
}: TooltipPrimitive.Provider.Props) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delay={delay}
      timeout={timeout}
      {...props}
    />
  )
}

function Tooltip({ ...props }: TooltipPrimitive.Root.Props) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />
}

function TooltipTrigger({ ...props }: TooltipPrimitive.Trigger.Props) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({
  className,
  side = "top",
  sideOffset = 4,
  align = "center",
  alignOffset = 0,
  children,
  ...props
}: TooltipPrimitive.Popup.Props &
  Pick<
    TooltipPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="isolate z-50"
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          render={(renderProps, state) => (
            <motion.div
              {...(renderProps as unknown as HTMLMotionProps<"div">)}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{
                opacity: state.open ? 1 : 0,
                scale: state.open ? 1 : 0.98,
              }}
              transition={{
                duration: state.instant ? 0 : state.open ? 0.24 : 0.16,
                ease: MOTION_EASE_OUT,
              }}
              style={{ ...(renderProps.style ?? {}), transformOrigin: "var(--transform-origin)" }}
            />
          )}
          className={cn(
            "z-50 inline-flex w-fit max-w-xs items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs text-background has-data-[slot=kbd]:pr-1.5 **:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:z-50 **:data-[slot=kbd]:rounded-sm",
            className
          )}
          {...props}
        >
          {children}
          <TooltipPrimitive.Arrow className="z-50 size-2.5 translate-y-[calc(-50%-2px)] rotate-45 rounded-[2px] bg-foreground fill-foreground data-[side=bottom]:top-1 data-[side=inline-end]:top-1/2! data-[side=inline-end]:-left-1 data-[side=inline-end]:-translate-y-1/2 data-[side=inline-start]:top-1/2! data-[side=inline-start]:-right-1 data-[side=inline-start]:-translate-y-1/2 data-[side=left]:top-1/2! data-[side=left]:-right-1 data-[side=left]:-translate-y-1/2 data-[side=right]:top-1/2! data-[side=right]:-left-1 data-[side=right]:-translate-y-1/2 data-[side=top]:-bottom-2.5" />
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  )
}

function useCoarsePointer() {
  const [coarse, setCoarse] = useState(false)
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return
    const query = window.matchMedia("(pointer: coarse)")
    const apply = (matches: boolean) => setCoarse(matches)
    apply(query.matches)
    const onChange = (event: MediaQueryListEvent) => apply(event.matches)
    query.addEventListener("change", onChange)
    return () => query.removeEventListener("change", onChange)
  }, [])
  return coarse
}

function withClick(trigger: ReactElement, onClick: (event: React.MouseEvent) => void): ReactElement {
  return cloneElement(trigger, {
    onClick,
  } as Record<string, unknown>)
}

/**
 * 桌面（细指针）悬浮显示；触屏/平板（粗指针）改为点击切换气泡，点击外部自动收起。
 */
export function TapAwareTooltip({
  trigger,
  children,
  side = "top",
  align = "center",
  className,
}: {
  trigger: ReactElement
  children: ReactNode
  side?: TooltipPrimitive.Positioner.Props["side"]
  align?: TooltipPrimitive.Positioner.Props["align"]
  className?: string
}) {
  const coarse = useCoarsePointer()
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!coarse) return
    const onPointerDown = (event: PointerEvent) => {
      const element = triggerRef.current
      if (element && event.target instanceof Node && !element.contains(event.target)) {
        setOpen(false)
      }
    }
    document.addEventListener("pointerdown", onPointerDown, true)
    return () => document.removeEventListener("pointerdown", onPointerDown, true)
  }, [coarse])

  // 始终使用受控 open，避免同一组件在受控/非受控之间切换触发 React 警告。
  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger
        ref={triggerRef}
        closeOnClick={!coarse}
        render={coarse
          ? withClick(trigger, (event) => {
              event.preventDefault()
              setOpen((value) => !value)
            })
          : trigger}
      />
      <TooltipContent side={side} align={align} className={className}>{children}</TooltipContent>
    </Tooltip>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
