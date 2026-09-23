import { useEffect, useState } from "react";
import { breakpoints } from "@/platform/design/tokens";

export type Layout = "phone" | "tablet" | "desktop";

const read = (): Layout => {
  if (typeof window === "undefined" || !window.matchMedia) return "desktop";
  if (window.matchMedia(`(min-width: ${breakpoints.desktop}px)`).matches) return "desktop";
  if (window.matchMedia(`(min-width: ${breakpoints.tablet}px)`).matches) return "tablet";
  return "phone";
};

/**
 * Which shell to render. Only one navigation variant exists in the DOM at a
 * time, so assistive technology (and tests) never meet hidden duplicates.
 */
export function useLayout(): Layout {
  const [layout, setLayout] = useState<Layout>(read);
  useEffect(() => {
    const queries = [`(min-width: ${breakpoints.desktop}px)`, `(min-width: ${breakpoints.tablet}px)`].map((q) => window.matchMedia(q));
    const on = () => setLayout(read());
    queries.forEach((m) => m.addEventListener?.("change", on));
    return () => queries.forEach((m) => m.removeEventListener?.("change", on));
  }, []);
  return layout;
}
