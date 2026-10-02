"use client";

import { useEffect, useId, useRef } from "react";
import type { acquireFurRenderer, FurAvatarVariant } from "./fur-avatar-renderer";

// One interactive avatar at a time, even when the history contains many replies.
const interactionOwners = new EventTarget();
let interactionOwner: HTMLElement | null = null;

export function ClosureFurAvatar({ active = false }: { active?: boolean }) {
  return <FurAvatar active={active} variant="closure" />;
}

export function SilverashFurAvatar({ active = false }: { active?: boolean }) {
  return <FurAvatar active={active} variant="silverash" />;
}

export function ExusiaiFurAvatar({ active = false }: { active?: boolean }) {
  return <FurAvatar active={active} variant="exusiai" />;
}

export function SaileachFurAvatar({ active = false }: { active?: boolean }) {
  return <FurAvatar active={active} variant="saileach" />;
}

export function MountainFurAvatar({ active = false }: { active?: boolean }) {
  return <FurAvatar active={active} variant="mountain" />;
}

function FurAvatar({ active, variant }: { active: boolean; variant: FurAvatarVariant }) {
  const gradientId = useId().replaceAll(":", "");
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
    let pixels = 0;
    let engine: ReturnType<typeof acquireFurRenderer> | undefined;

    const paint = (time: number, animated: boolean) => {
      if (!engine) return false;
      try {
        const drawn = engine.draw(context, pixels, { yaw, pitch, press, lagX, lagY, time: time / 1000, active: animated && activeRef.current }, variant);
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
      if (lastFrame && time - lastFrame < 1000 / 30) { frame = requestAnimationFrame(render); return; }
      const dt = lastFrame ? Math.min((time - lastFrame) / 1000, 0.5) : 1 / 30;
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
      // Exact damped-spring step: preserve real elapsed time even when rendering
      // is slow, without the instability of a large Euler integration step.
      const frequency = Math.sqrt(75), offset = press - targetPress;
      const amplitude = (pressVelocity + 5 * offset) / frequency;
      const decay = Math.exp(-5 * dt), cosine = Math.cos(frequency * dt), sine = Math.sin(frequency * dt);
      press = targetPress + decay * (offset * cosine + amplitude * sine);
      pressVelocity = decay * ((amplitude * frequency - 5 * offset) * cosine - (offset * frequency + 5 * amplitude) * sine);
      if (!animate) { yaw = 0; pitch = 0; press = 0; pressVelocity = 0; lagX = 0; lagY = 0; }
      const settling = Math.abs(yaw - nextYaw) + Math.abs(pitch - nextPitch) + Math.abs(press - targetPress) + Math.abs(pressVelocity) + Math.abs(lagX) + Math.abs(lagY) > 0.003;
      root.dataset.furMotion = reduce.matches ? "still" : working || settling ? "animated" : "idle";
      if (!paint(time, animate)) { root.dataset.furMotion = "fallback"; return; }
      if (animate && (working || settling)) frame = requestAnimationFrame(render);
    };
    const wake = () => { if (!frame && !disposed) { lastFrame = 0; frame = requestAnimationFrame(render); } };
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
  }, [variant]);

  return <span ref={rootRef} data-fur-avatar={variant} data-closure-fur-avatar={variant === "closure" ? "" : undefined} data-silverash-fur-avatar={variant === "silverash" ? "" : undefined} data-fur-ready="false" data-fur-motion="idle" className="group/fur relative block size-full touch-pan-y cursor-grab active:cursor-grabbing">
    <svg viewBox="0 0 100 100" aria-hidden="true" className="pointer-events-none absolute -left-[22%] -top-[22%] size-[144%] group-data-[fur-ready=true]/fur:invisible" data-fur-fallback>
      {variant === "mountain" ? <g data-mountain-fallback transform="translate(50 50) scale(1.10) translate(-50 -50)">
        <defs><radialGradient id={`${gradientId}-tiger`}><stop stopColor="#f8f8f5" /><stop offset="1" stopColor="#c8cbca" /></radialGradient></defs>
        <path d="M62 70Q85 76 83 53Q82 45 76 49" fill="none" stroke="#dfe1de" strokeWidth="7" strokeLinecap="round" />
        <path d="M77 70L82 66M83 58L82 53M79 48L76 49" fill="none" stroke="#383c40" strokeWidth="6" strokeLinecap="round" />
        <g fill="#383c40"><ellipse cx="32" cy="32" rx="8.5" ry="9" /><ellipse cx="68" cy="32" rx="8.5" ry="9" /></g>
        <g fill="#ededeb"><ellipse cx="32" cy="33" rx="5.1" ry="5.6" /><ellipse cx="68" cy="33" rx="5.1" ry="5.6" /></g>
        <ellipse cx="50" cy="54" rx="28" ry="27" fill={`url(#${gradientId}-tiger)`} />
        <g fill="#35383c">
          <path d="M45.5 27L51 28L49.5 32L53 33L49 40L50 35L46.5 34L48 30Z" />
          <path d="M31 34L37 35L39 33L42 38L47 40L40 39L38 37L32 38ZM67 33L63 36L59 35L58 39L54 41L61 39L62 38L69 37Z" />
          <path d="M22 42L28 45L30 43L33 47L38 49L31 48L29 46L25 48L22 47ZM78 43L73 43L71 46L68 45L63 49L70 48L72 49L74 46L78 47Z" />
          <path d="M22 54L27 56L29 53L32 58L36 60L30 59L28 58L25 61L22 59ZM78 57L73 56L71 59L68 58L64 62L71 61L73 63L75 60L78 62Z" />
          <path d="M25 65L29 64L31 66L34 64L39 66L33 68L32 71L28 69L27 72ZM74 68L70 66L68 69L65 67L62 69L67 71L70 74L72 71L73 73Z" />
        </g>
        <g fill="#78aabd"><ellipse cx="41.3" cy="53" rx="3.4" ry="4.3" /><ellipse cx="58.7" cy="53" rx="3.4" ry="4.3" /></g>
      </g> : variant === "saileach" ? <g data-saileach-fallback transform="translate(50 50) scale(1.16) translate(-50 -50)">
        <defs>
          <radialGradient id={`${gradientId}-gold`}><stop stopColor="#f7e2a9" /><stop offset="1" stopColor="#d8b86d" /></radialGradient>
          <linearGradient id={`${gradientId}-horn`} x1="1" y1="1" x2="0" y2="0"><stop stopColor="#51647f" /><stop offset="1" stopColor="#e1dfcd" /></linearGradient>
          <pattern id={`${gradientId}-headband`} width="6" height="6" patternUnits="userSpaceOnUse">
            <rect width="6" height="6" fill="#304768" />
            <path d="M0 3L3 0L6 3L3 6Z" fill="none" stroke="#7892ae" strokeWidth="0.5" />
          </pattern>
        </defs>
        <ellipse cx="50" cy="53" rx="27" ry="27" fill={`url(#${gradientId}-gold)`} />
        <g fill="#97c9f2" stroke="#526481" strokeWidth="0.37"><ellipse cx="42" cy="54.4" rx="3.31" ry="4.68" /><ellipse cx="58" cy="54.4" rx="3.31" ry="4.68" /></g>
        <path d="M30 65Q22 44 38 32Q55 23 68 36Q76 48 68 65Q65 59 63 46L56 48L53 44L49 49L46 43Q39 51 34 48L34 65Z" fill="#dcb867" />
        <path d="M31 39Q50 24 69 39L70 43Q50 31 30 43Z" fill={`url(#${gradientId}-headband)`} />
        <path d="M43 35L46 32L49 35L46 38Z" fill="#f9dc8a" />
        {[-1, 1].map(side => <g key={side} transform={side < 0 ? "translate(100 0) scale(-1 1)" : undefined}>
          <path d="M70 47C79 43 77 34 70 32Q66 31 63 37Q69 34 71 39Q74 43 68 46Z" fill={`url(#${gradientId}-horn)`} />
          <path d="M70 44Q73 45 75 43M72 41Q75 41 76 39M71 37Q74 37 75 35M68 34L70 32M65 35L66 33" fill="none" stroke="#52647c" strokeWidth="0.8" strokeLinecap="round" />
        </g>)}
        <path d="M71 54Q76 58 71 63Q77 68 72 74" fill="none" stroke="#e7c87e" strokeWidth="7" strokeLinecap="round" />
        <path d="M69 72L76 72" stroke="#304768" strokeWidth="3" strokeLinecap="round" />
      </g> : variant === "exusiai" ? <g transform="translate(50 50) scale(1.05) translate(-50 -50)">
        <defs>
          <linearGradient id={`${gradientId}-red`} x2="0" y2="1"><stop stopColor="#ff4b50" /><stop offset="1" stopColor="#e12b37" /></linearGradient>
          <linearGradient id={`${gradientId}-fringe`} x2="0" y2="1"><stop stopColor="#c82a3b" /><stop offset="1" stopColor="#a7192b" /></linearGradient>
          <linearGradient id={`${gradientId}-accessory`} x2="0" y2="1" colorInterpolation="linearRGB"><stop stopColor="#ffe000" /><stop offset="0.87" stopColor="#fff" /></linearGradient>
          <linearGradient id={`${gradientId}-halo`} x2="0" y2="1" colorInterpolation="linearRGB"><stop stopColor="#ffe000" /><stop offset="0.22" stopColor="#ffe000" /><stop offset="0.55" stopColor="#fff2a8" /></linearGradient>
        </defs>
        <ellipse data-plush-halo cx="50" cy="24" rx="23" ry="12.5" fill="none" stroke={`url(#${gradientId}-halo)`} strokeWidth="7.4" />
        <g data-plush-wings fill={`url(#${gradientId}-accessory)`}>
          <path d="M11 36L14 40L11 44L8 40Z" />
          <path d="M9 47L13 51L9 55L5 51Z" />
          <path d="M11 58L15 62L11 66L7 62Z" />
          <path d="M89 36L92 40L89 44L86 40Z" />
          <path d="M91 47L95 51L91 55L87 51Z" />
          <path d="M89 58L93 62L89 66L85 62Z" />
        </g>
        <ellipse cx="50" cy="54" rx="28" ry="27" fill={`url(#${gradientId}-red)`} />
        <path d="M33 62Q28 51 43 39Q55 37 66 51Q72 64 63 68Q42 72 33 62Z" fill="#f1d4ac" />
        <ellipse cx="41" cy="51" rx="4.6" ry="5.9" fill="#57392c" />
        <ellipse cx="41" cy="51" rx="3.9" ry="5.2" fill="#ffe02b" />
        <path d="M49 58L54 56.7Q54 63 51 64Q49 62 49 58Z" fill="#b66c57" />
        <path d="M31 65C22 56 25 38 41 33C55 27 73 37 73 50Q75 57 69 59L69 55Q68 63 59 65Q57 65 58 60Q58 57 56 54C49 55 42 47 43 40Q32 50 33 61L34 66Z" fill={`url(#${gradientId}-fringe)`} />
      </g> : variant === "silverash" ? <g transform="translate(50 50) scale(1.1) translate(-50 -50)">
        <defs>
          <linearGradient id={`${gradientId}-ears`} x2="0" y2="1"><stop stopColor="#4c5155" /><stop offset="1" stopColor="#c4c7c9" /></linearGradient>
          <linearGradient id={`${gradientId}-coat`} x2="0" y2="1"><stop stopColor="#bdc0c3" /><stop offset="1" stopColor="#f2f3f3" /></linearGradient>
          <linearGradient id={`${gradientId}-ruff`} x2="0" y2="1"><stop stopColor="#707070" /><stop offset="1" stopColor="#383838" /></linearGradient>
        </defs>
        <g transform="translate(-2 -3)">
          <path d="M61 66C80 78 91 62 84 51C81 46 76 49 77 54" fill="none" stroke="#d0d3d5" strokeWidth="9" strokeLinecap="round" />
          <path d="M71 70l2-5m8-2l5 1m-4-10l4-2" fill="none" stroke="#686e73" strokeWidth="2.7" strokeLinecap="round" />
        </g>
        <path d="M23 68Q17 63 18 55L15 47L21 50L18 40L25 46L26 36L31 43Q45 38 60 42L66 35L65 46L73 39L71 50L77 46L74 57Q75 64 69 68L65 59Q47 49 28 59Z" fill={`url(#${gradientId}-ruff)`} />
        <ellipse cx="30" cy="33" rx="10" ry="11" fill={`url(#${gradientId}-ears)`} transform="rotate(-10 30 33)" />
        <ellipse cx="62" cy="33" rx="10" ry="11" fill={`url(#${gradientId}-ears)`} transform="rotate(10 62 33)" />
        <ellipse cx="30" cy="35" rx="6.5" ry="8" fill="#f2f3f3" />
        <ellipse cx="62" cy="35" rx="6.5" ry="8" fill="#f2f3f3" />
        <ellipse cx="46" cy="54" rx="26" ry="24" fill={`url(#${gradientId}-coat)`} />
        <path d="M25 42C24 39 30 39 33 41L32 44C28 42 26 45 28 48L25 49C23 47 25 45 25 42ZM66 48C69 46 71 51 69 54C72 58 68 61 65 58C63 56 66 53 64 51ZM29 63C32 60 36 62 37 65C41 67 36 71 33 70C31 73 27 69 28 67C25 65 27 63 29 63ZM51 69C54 65 59 68 60 71C63 73 59 76 56 75L54 77L50 74L51 72C54 74 58 73 57 71C55 69 54 71 52 72Z" fill="#94989b" />
        <ellipse cx="38" cy="52" rx="2.8" ry="4.4" fill="#42474b" />
        <ellipse cx="53" cy="52" rx="2.8" ry="4.4" fill="#42474b" />
      </g> : <>
      <path fill="#17212b" transform="translate(50 50) scale(1.1) translate(-50 -50)" d="M32 43Q22 30 15 34Q18 43 10 51Q19 49 20 56Q27 54 28 60L37 57ZM68 43Q78 30 85 34Q82 43 90 51Q81 49 80 56Q73 54 72 60L63 57Z" />
      <path fill="#17212b" d="M69 39C85 60 71 78 49 78C28 78 20 66 24 49C27 31 52 22 69 39Z" />
      <ellipse fill="#b63445" cx="41" cy="49" rx="3.3" ry="5.6" transform="rotate(8 41 49)" />
      <ellipse fill="#b63445" cx="57" cy="51" rx="3.3" ry="5.6" transform="rotate(8 57 51)" />
      </>}
    </svg>
    <canvas ref={canvasRef} aria-hidden="true" className="absolute -left-[22%] -top-[22%] size-[144%]" />
  </span>;
}
