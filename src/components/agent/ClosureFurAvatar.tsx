"use client";

import { useEffect, useRef } from "react";
import type { acquireFurRenderer } from "./fur-avatar-renderer";

// One interactive avatar at a time, even when the history contains many replies.
const interactionOwners = new EventTarget();
let interactionOwner: HTMLElement | null = null;

export function ClosureFurAvatar({ active = false }: { active?: boolean }) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeRef = useRef(active);

  useEffect(() => {
    activeRef.current = active;
    rootRef.current?.dispatchEvent(new Event("fur-activity"));
  }, [active]);

  useEffect(() => {
    const root = rootRef.current, canvas = canvasRef.current;
    if (!root || !canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    let visible = false, disposed = false, pressed = false, hovering = false;
    let frame = 0, lastFrame = 0, targetX = 0, targetY = 0;
    let yaw = 0, pitch = 0, press = 0, pressVelocity = 0;
    let lastX = 0, lastY = 0, lagX = 0, lagY = 0;
    let pixels = 0, drawCost = 0;
    let engine: ReturnType<typeof acquireFurRenderer> | undefined;

    const paint = (time: number, animated: boolean) => {
      if (!engine) return false;
      try {
        const started = performance.now();
        const drawn = engine.draw(context, pixels, { yaw, pitch, press, lagX, lagY, time: time / 1000, active: animated && activeRef.current });
        drawCost = drawCost * 0.75 + (performance.now() - started) * 0.25;
        root.dataset.furReady = String(drawn);
        if (!drawn) context.clearRect(0, 0, pixels, pixels);
        return drawn;
      } catch {
        root.dataset.furReady = "false";
        context.clearRect(0, 0, pixels, pixels);
        return false;
      }
    };
    const stop = () => { window.cancelAnimationFrame(frame); frame = 0; lastFrame = 0; };
    const render = (time: number) => {
      frame = 0;
      if (disposed || !visible || document.hidden) { root.dataset.furMotion = "paused"; return; }
      if (!engine) return;
      // Leave time for streaming text and input on devices with slow/software WebGL.
      const interval = Math.max(1000 / 30, Math.min(250, drawCost * 4));
      if (lastFrame && time - lastFrame < interval) { frame = requestAnimationFrame(render); return; }
      const dt = lastFrame ? Math.min((time - lastFrame) / 1000, 0.05) : 1 / 30;
      lastFrame = time;
      const interactive = interactionOwner === root;
      const animate = !reduce.matches && (!interactionOwner || interactive);
      const working = animate && activeRef.current;
      const nextYaw = animate ? (interactive ? targetX : 0) + (working ? Math.sin(time / 1100) * 0.045 : 0) : 0;
      const nextPitch = animate ? (interactive ? targetY : 0) + (working ? Math.sin(time / 1400) * 0.025 : 0) : 0;
      const ease = 1 - Math.exp(-14 * dt);
      lagX += ((nextYaw - yaw) - lagX) * ease;
      lagY += ((nextPitch - pitch) - lagY) * ease;
      yaw += (nextYaw - yaw) * ease;
      pitch += (nextPitch - pitch) * ease;
      // A damped spring keeps a second press continuous with the first release.
      const targetPress = animate && interactive && pressed ? 1 : 0;
      pressVelocity += ((targetPress - press) * 100 - pressVelocity * 10) * dt;
      press += pressVelocity * dt;
      if (!animate) { yaw = 0; pitch = 0; press = 0; pressVelocity = 0; lagX = 0; lagY = 0; }
      const settling = Math.abs(yaw - nextYaw) + Math.abs(pitch - nextPitch) + Math.abs(press - targetPress) + Math.abs(pressVelocity) + Math.abs(lagX) + Math.abs(lagY) > 0.003;
      root.dataset.furMotion = reduce.matches ? "still" : working || settling ? "animated" : "idle";
      if (!paint(time, animate)) { root.dataset.furMotion = "fallback"; return; }
      if (animate && (working || settling)) frame = requestAnimationFrame(render);
    };
    const wake = () => { if (!frame && !disposed) frame = requestAnimationFrame(render); };
    const reset = () => { pressed = false; hovering = false; targetX = 0; targetY = 0; };
    const releaseOwner = () => {
      if (interactionOwner === root) { interactionOwner = null; interactionOwners.dispatchEvent(new Event("change")); }
    };
    const claim = () => {
      if (reduce.matches || interactionOwner === root) return;
      interactionOwner = root;
      interactionOwners.dispatchEvent(new Event("change"));
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || !finePointer.matches || reduce.matches) return;
      hovering = true;
      claim();
      if (pressed) {
        targetX += (event.clientX - lastX) * 0.018;
        targetY = Math.max(-0.6, Math.min(0.6, targetY + (event.clientY - lastY) * 0.01));
      } else {
        const bounds = root.getBoundingClientRect();
        targetX = Math.max(-0.2, Math.min(0.2, ((event.clientX - bounds.left) / bounds.width - 0.5) * 0.32));
        targetY = Math.max(-0.16, Math.min(0.16, ((event.clientY - bounds.top) / bounds.height - 0.5) * 0.22));
      }
      lastX = event.clientX;
      lastY = event.clientY;
      wake();
    };
    const down = (event: PointerEvent) => {
      if (event.button !== 0 || reduce.matches) return;
      pressed = true;
      lastX = event.clientX;
      lastY = event.clientY;
      if (event.pointerType === "mouse") root.setPointerCapture(event.pointerId);
      claim();
      wake();
    };
    const up = () => {
      if (!pressed) return;
      pressed = false;
      if (!hovering) releaseOwner();
      wake();
    };
    const leave = () => { reset(); releaseOwner(); wake(); };
    const resize = () => {
      const next = Math.max(1, Math.round(root.getBoundingClientRect().width * 1.44 * Math.min(devicePixelRatio || 1, 2)));
      if (next === pixels) return;
      pixels = next;
      canvas.width = canvas.height = pixels;
      paint(performance.now(), false);
      wake();
    };
    const visibility = () => {
      if (document.hidden) { stop(); reset(); releaseOwner(); root.dataset.furMotion = "paused"; }
      else wake();
    };
    const motionChange = () => { reset(); releaseOwner(); wake(); };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? false;
      if (visible) wake();
      else { stop(); reset(); releaseOwner(); root.dataset.furMotion = "paused"; }
    });
    const resizer = new ResizeObserver(resize);
    observer.observe(root);
    resizer.observe(root);
    resize();
    root.addEventListener("pointermove", move);
    root.addEventListener("pointerdown", down);
    root.addEventListener("pointerleave", leave);
    root.addEventListener("pointercancel", leave);
    root.addEventListener("fur-activity", wake);
    window.addEventListener("pointerup", up);
    document.addEventListener("visibilitychange", visibility);
    reduce.addEventListener("change", motionChange);
    interactionOwners.addEventListener("change", wake);
    void import("./fur-avatar-renderer").then(({ acquireFurRenderer }) => {
      if (disposed) return;
      engine = acquireFurRenderer();
      wake();
    }).catch(() => { if (!disposed) root.dataset.furMotion = "fallback"; });
    return () => {
      disposed = true;
      stop();
      observer.disconnect();
      resizer.disconnect();
      root.removeEventListener("pointermove", move);
      root.removeEventListener("pointerdown", down);
      root.removeEventListener("pointerleave", leave);
      root.removeEventListener("pointercancel", leave);
      root.removeEventListener("fur-activity", wake);
      window.removeEventListener("pointerup", up);
      document.removeEventListener("visibilitychange", visibility);
      reduce.removeEventListener("change", motionChange);
      interactionOwners.removeEventListener("change", wake);
      releaseOwner();
      engine?.release();
    };
  }, []);

  return <span ref={rootRef} data-closure-fur-avatar data-fur-ready="false" data-fur-motion="idle" className="group/fur relative block size-full touch-pan-y cursor-grab active:cursor-grabbing">
    <svg viewBox="0 0 100 100" aria-hidden="true" className="pointer-events-none absolute -left-[22%] -top-[22%] size-[144%] group-data-[fur-ready=true]/fur:invisible" data-fur-fallback>
      <path fill="#17212b" transform="translate(50 50) scale(1.1) translate(-50 -50)" d="M32 43Q22 30 15 34Q18 43 10 51Q19 49 20 56Q27 54 28 60L37 57ZM68 43Q78 30 85 34Q82 43 90 51Q81 49 80 56Q73 54 72 60L63 57Z" />
      <path fill="#17212b" d="M69 39C85 60 71 78 49 78C28 78 20 66 24 49C27 31 52 22 69 39Z" />
      <ellipse fill="#b63445" cx="41" cy="49" rx="3.3" ry="5.6" transform="rotate(8 41 49)" />
      <ellipse fill="#b63445" cx="57" cy="51" rx="3.3" ry="5.6" transform="rotate(8 57 51)" />
    </svg>
    <canvas ref={canvasRef} aria-hidden="true" className="absolute -left-[22%] -top-[22%] size-[144%]" />
  </span>;
}
