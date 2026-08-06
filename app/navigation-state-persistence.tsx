"use client";

import { useEffect } from "react";

const STORAGE_KEY = "ivy-job-radar:navigation-state:v1";

type StoredState = {
  selects: Record<string, string>;
  inputs: Record<string, string>;
  selectedNav: string;
  scrollY: number;
};

function emptyState(): StoredState {
  return { selects: {}, inputs: {}, selectedNav: "", scrollY: 0 };
}

function readState(): StoredState {
  try {
    return { ...emptyState(), ...JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "{}") };
  } catch {
    return emptyState();
  }
}

function writeState(patch: Partial<StoredState>) {
  const current = readState();
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...patch }));
}

function normalizedText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function selectKey(select: HTMLSelectElement) {
  const label = select.closest("label");
  const labelText = normalizedText(label?.childNodes[0]?.textContent || select.getAttribute("aria-label") || "select");
  const options = Array.from(select.options).map((option) => normalizedText(option.textContent || "")).join("|");
  return `${labelText}::${options}`;
}

function inputKey(input: HTMLInputElement) {
  const label = input.closest("label");
  return `${normalizedText(label?.childNodes[0]?.textContent || "input")}::${input.placeholder || input.getAttribute("aria-label") || ""}`;
}

function isSearchInput(input: HTMLInputElement) {
  const text = `${input.placeholder} ${input.getAttribute("aria-label") || ""}`.toLowerCase();
  return text.includes("搜索") || text.includes("search");
}

function restoreControls() {
  const state = readState();

  document.querySelectorAll<HTMLSelectElement>("main select").forEach((select) => {
    const saved = state.selects[selectKey(select)];
    if (!saved || select.value === saved || !Array.from(select.options).some((option) => option.value === saved)) return;
    select.value = saved;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });

  document.querySelectorAll<HTMLInputElement>('main input[type="search"], main input[type="text"]').forEach((input) => {
    if (!isSearchInput(input)) return;
    const saved = state.inputs[inputKey(input)];
    if (saved === undefined || input.value === saved) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, saved);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });

  if (state.selectedNav) {
    const button = Array.from(document.querySelectorAll<HTMLButtonElement>(".bottom-nav button"))
      .find((item) => normalizedText(item.textContent || "") === state.selectedNav);
    if (button && !button.classList.contains("selected")) button.click();
  }

  document.querySelectorAll<HTMLAnchorElement>('a[href^="http://"], a[href^="https://"]').forEach((anchor) => {
    anchor.target = "_blank";
    anchor.rel = "noreferrer noopener";
  });
}

export default function NavigationStatePersistence() {
  useEffect(() => {
    let restoreTimer = 0;
    let scrollTimer = 0;
    let restoredScroll = false;

    const scheduleRestore = () => {
      window.clearTimeout(restoreTimer);
      restoreTimer = window.setTimeout(() => {
        restoreControls();
        if (!restoredScroll) {
          const { scrollY } = readState();
          if (scrollY > 0) window.requestAnimationFrame(() => window.scrollTo({ top: scrollY, behavior: "auto" }));
          restoredScroll = true;
        }
      }, 80);
    };

    const handleChange = (event: Event) => {
      const target = event.target;
      if (target instanceof HTMLSelectElement && target.closest("main")) {
        const state = readState();
        writeState({ selects: { ...state.selects, [selectKey(target)]: target.value } });
      }
      if (target instanceof HTMLInputElement && target.closest("main") && isSearchInput(target)) {
        const state = readState();
        writeState({ inputs: { ...state.inputs, [inputKey(target)]: target.value } });
      }
    };

    const handleClick = (event: MouseEvent) => {
      const button = (event.target as Element | null)?.closest<HTMLButtonElement>(".bottom-nav button");
      if (button) writeState({ selectedNav: normalizedText(button.textContent || "") });
    };

    const handleScroll = () => {
      window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => writeState({ scrollY: window.scrollY }), 120);
    };

    const observer = new MutationObserver(scheduleRestore);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("change", handleChange, true);
    document.addEventListener("input", handleChange, true);
    document.addEventListener("click", handleClick, true);
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("pageshow", scheduleRestore);
    window.addEventListener("popstate", scheduleRestore);
    scheduleRestore();

    return () => {
      observer.disconnect();
      document.removeEventListener("change", handleChange, true);
      document.removeEventListener("input", handleChange, true);
      document.removeEventListener("click", handleClick, true);
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("pageshow", scheduleRestore);
      window.removeEventListener("popstate", scheduleRestore);
      window.clearTimeout(restoreTimer);
      window.clearTimeout(scrollTimer);
    };
  }, []);

  return null;
}
