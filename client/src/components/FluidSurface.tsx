import { useLayoutEffect, useRef, type AriaRole, type ReactNode } from "react";

type FluidSurfaceProps = {
  children: ReactNode;
  value: string;
  selector: string;
  className?: string;
  role?: AriaRole;
  ariaLabel?: string;
};

/** One shared selection surface. FLIP animates only its transform, never the data or page layout. */
export default function FluidSurface({ children, value, selector, className = "", role, ariaLabel }: FluidSurfaceProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLSpanElement>(null);
  const animationRef = useRef<Animation | null>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const surface = surfaceRef.current;
    if (!root || !surface) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let disposed = false;

    const place = (animate: boolean) => {
      const selected = root.querySelector<HTMLElement>(selector);
      if (!selected || !selected.getClientRects().length) {
        animationRef.current?.cancel();
        surface.style.opacity = "0";
        delete root.dataset.fluidReady;
        return;
      }
      const bounds = root.getBoundingClientRect();
      const target = selected.getBoundingClientRect();
      if (!target.width || !target.height) return;
      const previous = root.dataset.fluidReady ? surface.getBoundingClientRect() : null;
      const x = target.left - bounds.left + root.scrollLeft - root.clientLeft;
      const y = target.top - bounds.top + root.scrollTop - root.clientTop;
      animationRef.current?.cancel();
      surface.style.width = target.width + "px";
      surface.style.height = target.height + "px";
      surface.style.transform = "translate(" + x + "px," + y + "px)";
      surface.style.opacity = "1";
      root.dataset.fluidReady = "true";
      if (!animate || reduced.matches || !previous?.width || typeof surface.animate !== "function") return;
      const fromX = previous.left - bounds.left + root.scrollLeft - root.clientLeft;
      const fromY = previous.top - bounds.top + root.scrollTop - root.clientTop;
      surface.style.willChange = "transform";
      const animation = surface.animate([
        { transform: "translate(" + fromX + "px," + fromY + "px) scale(" + previous.width / target.width + "," + previous.height / target.height + ")" },
        { transform: "translate(" + x + "px," + y + "px) scale(1,1)" },
      ], { duration: 260, easing: "cubic-bezier(0.16,1,0.3,1)" });
      animationRef.current = animation;
      void animation.finished.catch(() => undefined).then(() => {
        if (animationRef.current === animation) {
          animation.cancel();
          animationRef.current = null;
          surface.style.willChange = "auto";
        }
      });
    };

    place(true);
    const dimensions = () => root.clientWidth + ":" + root.clientHeight + ":" + (root.querySelector<HTMLElement>(selector)?.offsetWidth ?? 0);
    let previousDimensions = dimensions();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => {
      const next = dimensions();
      if (next !== previousDimensions) { previousDimensions = next; place(false); }
    });
    observer?.observe(root);
    const selected = root.querySelector(selector);
    if (selected) observer?.observe(selected);
    const onResize = () => place(false);
    const onPreference = () => place(false);
    window.addEventListener("resize", onResize);
    reduced.addEventListener("change", onPreference);
    if (document.fonts?.status !== "loaded") void document.fonts?.ready.then(() => { if (!disposed) place(false); });
    return () => {
      disposed = true;
      observer?.disconnect();
      window.removeEventListener("resize", onResize);
      reduced.removeEventListener("change", onPreference);
      surface.style.willChange = "auto";
    };
  }, [value, selector]);

  useLayoutEffect(() => () => { animationRef.current?.cancel(); }, []);

  return <div ref={rootRef} className={"dg-fluid-surface " + className} role={role} aria-label={ariaLabel}>
    <span ref={surfaceRef} className="dg-fluid-selection" aria-hidden="true" />
    {children}
  </div>;
}