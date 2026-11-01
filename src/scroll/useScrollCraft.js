"use client";

import { useEffect } from "react";

const ENGINE_SRC = "/vendor/scrollcraft/scrollcraft.js";

function loadEngine() {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.ScrollCraft) return Promise.resolve(true);
  if (window.__visioScrollCraft) return window.__visioScrollCraft;
  window.__visioScrollCraft = new Promise((resolve) => {
    const existing = document.querySelector("script[data-scrollcraft]");
    const finish = () => resolve(!!window.ScrollCraft);
    if (existing) {
      if (window.ScrollCraft) finish();
      else existing.addEventListener("load", finish, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = ENGINE_SRC;
    script.dataset.scrollcraft = "1";
    script.onload = finish;
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
  return window.__visioScrollCraft;
}

/**
 * Mounts the scrollcraft engine on the public site and republishes the
 * viewfinder crop so verification can see the signature move. Remounts when
 * the portfolio filter swaps cards, because the engine collects nodes once.
 */
export function useScrollCraft() {
  useEffect(() => {
    let alive = true;
    let api = null;
    let raf = 0;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const publish = () => {
      const root = document.querySelector(".visio-public");
      if (!root) return;
      root.querySelectorAll("[data-sc-viewfinder]").forEach((el) => {
        const host = el.closest("[data-sc-act]");
        const raw = host ? getComputedStyle(host).getPropertyValue("--sc-p") : "0";
        const p = parseFloat(raw) || 0;
        const next = reduce ? "reduced" : `crop:${(p * 8).toFixed(2)}`;
        if (el.getAttribute("data-sc-verify-state") !== next) {
          el.setAttribute("data-sc-verify-state", next);
        }
        if (reduce) el.setAttribute("data-sc-verify-hold", "true");
        else el.removeAttribute("data-sc-verify-hold");
      });
      if (reduce) {
        root.querySelectorAll("[data-sc-stage]").forEach((stage) => {
          if (stage.getAttribute("data-sc-verify-hold") === "true") return;
          stage.setAttribute("data-sc-verify-state", "reduced");
          stage.setAttribute("data-sc-verify-hold", "true");
        });
      }
      raf = requestAnimationFrame(publish);
    };

    const mount = () => {
      if (!alive || !window.ScrollCraft) return;
      api?.destroy();
      const root = document.querySelector(".visio-public");
      if (!root) return;
      api = window.ScrollCraft.mount(root);
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(publish);
    };

    loadEngine().then((ok) => {
      if (ok) mount();
    });

    const onRefresh = () => {
      loadEngine().then((ok) => {
        if (ok) mount();
      });
    };
    window.addEventListener("visio-sc-refresh", onRefresh);

    return () => {
      alive = false;
      window.removeEventListener("visio-sc-refresh", onRefresh);
      cancelAnimationFrame(raf);
      api?.destroy();
      api = null;
    };
  }, []);
}
