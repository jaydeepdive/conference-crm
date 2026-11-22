"use client";
import { useEffect } from "react";

/** Shrinks each .sheet-inner so one schedule always fits one Letter page
 *  (11in − 0.8in margins = 10.2in tall, 7.7in wide at 96 px/in). */
export function FitToPage() {
  useEffect(() => {
    const MAX_H = 10.1 * 96;
    const fit = () => {
      document.querySelectorAll<HTMLElement>(".sheet-inner").forEach(el => {
        el.style.zoom = "1";
        const h = el.scrollHeight;
        if (h > MAX_H) el.style.zoom = String(Math.max(0.6, MAX_H / h));
      });
    };
    fit();
    const t = setTimeout(fit, 400); // after fonts/logo load
    window.addEventListener("beforeprint", fit);
    window.addEventListener("load", fit);
    return () => { clearTimeout(t); window.removeEventListener("beforeprint", fit); window.removeEventListener("load", fit); };
  }, []);
  return null;
}
