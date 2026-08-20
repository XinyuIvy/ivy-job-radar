from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"anchor not found in {path}: {old[:160]!r}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")


radar = "app/job-radar.tsx"
replace_once(radar, "  checkedAt: string;\n};", "  checkedAt: string;\n  saved?: boolean;\n};")
replace_once(
    radar,
    '''    if (cachedRows.length) {
      setDailyJobs(cachedRows);
      setJobsLoading(false);
    }''',
    '''    if (cachedRows.length) {
      setDailyJobs(cachedRows);
      setSaved(cachedRows.filter((job) => job.saved).map((job) => job.id));
      setJobsLoading(false);
    }''',
)
replace_once(
    radar,
    '''        if (active && Array.isArray(rows)) {
          setDailyJobs(rows);
          writeJobSessionCache(rows);
          setJobsLoading(false);
        }''',
    '''        if (active && Array.isArray(rows)) {
          setDailyJobs(rows);
          setSaved(rows.filter((job: Job) => job.saved).map((job: Job) => job.id));
          writeJobSessionCache(rows);
          setJobsLoading(false);
        }''',
)
replace_once(
    radar,
    '''  useEffect(() => {
    let active = true;
    fetch("/api/saved-jobs", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : []))
      .then((rows: Array<{ jobId: number }>) => {
        if (active) setSaved(rows.map((row) => row.jobId));
      });
    return () => {
      active = false;
    };
  }, []);

''',
    "",
)
replace_once(radar, '<article className="application-card" key={`application-${item.id}`}>', '<article className="application-card" data-application-row-id={item.id} key={`application-${item.id}`}>')
replace_once(
    radar,
    '''        await loadApplications();
      })();''',
    '''      })();''',
)

# Add a compact mental model for first-time users.
replace_once(
    radar,
    '''      {view === "today" && (
        <section className="quick-update-bar">''',
    '''      {view === "today" && (
        <section className="quick-start" aria-label="使用流程">
          <span><b>1</b> 找岗位</span><i>→</i><span><b>2</b> ☆ 保存到候选</span><i>→</i><span><b>3</b> 定制 CV 后投递</span>
        </section>
      )}

      {view === "today" && (
        <section className="quick-update-bar">''',
)

jobs_route = "app/api/jobs/route.ts"
replace_once(
    jobs_route,
    '''    if (existingKey) {
      const current = uniqueRows.get(existingKey);
      if (current && sameDisplayedJob(current, row) && rank(row) > rank(current)) uniqueRows.set(existingKey, row);
      continue;
    }
    uniqueRows.set(primaryKey, row);
    if (fallbackKey) fallbackKeys.set(fallbackKey, primaryKey);''',
    '''    if (existingKey) {
      const current = uniqueRows.get(existingKey);
      if (current && sameDisplayedJob(current, row)) {
        if (rank(row) > rank(current)) uniqueRows.set(existingKey, row);
        continue;
      }
      // Same visible title/location can still represent different requisitions when both
      // postings expose distinct stable IDs. Keep both instead of collapsing them.
    }
    uniqueRows.set(primaryKey, row);
    if (fallbackKey) fallbackKeys.set(fallbackKey, primaryKey);''',
)
replace_once(
    jobs_route,
    '''  const responseRows = [...uniqueRows.values()].map((row) => ({
    ...row,
    skills: JSON.parse(row.skills || "[]"),
  }));''',
    '''  const responseRows = [...uniqueRows.values()].map((row) => ({
    ...row,
    skills: JSON.parse(row.skills || "[]"),
    saved: savedIds.has(row.id),
  }));''',
)

# Candidate cards already contain the DB row id: inject CV actions without another applications request.
Path("app/application-cv-actions.tsx").write_text(r'''"use client";

import { useEffect } from "react";

function normalized(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function candidateViewActive() {
  const heroTitle = Array.from(document.querySelectorAll<HTMLElement>(".hero h1"))
    .find((element) => element.offsetParent !== null);
  return normalized(heroTitle?.textContent || "") === "候选岗位";
}

function buttonText(element: Element) {
  return normalized(element.textContent || "");
}

export default function ApplicationCvActions() {
  useEffect(() => {
    let disposed = false;
    let observer: MutationObserver | null = null;
    let activeTaskButton: HTMLButtonElement | null = null;
    let enhanceTimer = 0;

    const enhance = () => {
      if (disposed || !candidateViewActive()) return;
      const cards = Array.from(document.querySelectorAll<HTMLElement>("article.application-card[data-application-row-id]"));
      for (const card of cards) {
        const applicationId = Number(card.dataset.applicationRowId || 0);
        if (!Number.isInteger(applicationId) || applicationId <= 0) continue;
        const editButton = Array.from(card.querySelectorAll<HTMLButtonElement>("button"))
          .find((button) => buttonText(button) === "编辑记录");
        if (!editButton) continue;

        const actionContainer = editButton.parentElement ?? card;
        if (!actionContainer.querySelector('[data-cv-tailor-action="true"]')) {
          const link = document.createElement("a");
          link.dataset.cvTailorAction = "true";
          link.href = `/cv-tailor?applicationId=${applicationId}`;
          link.textContent = "定制 CV";
          link.style.borderRadius = "10px";
          link.style.padding = "9px 14px";
          link.style.background = "#704c2f";
          link.style.color = "#fff";
          link.style.fontWeight = "800";
          link.style.textDecoration = "none";
          link.style.fontSize = "13px";
          actionContainer.insertBefore(link, editButton);
        }

        const taskButton = Array.from(card.querySelectorAll<HTMLButtonElement>("button"))
          .find((button) => buttonText(button) === "新增任务");
        if (taskButton) {
          taskButton.style.setProperty("display", "none", "important");
          taskButton.setAttribute("aria-hidden", "true");
          if (editButton.dataset.taskMergeBound !== "true") {
            editButton.dataset.taskMergeBound = "true";
            editButton.addEventListener("click", () => {
              activeTaskButton = taskButton;
              window.setTimeout(scheduleEnhance, 0);
            });
          }
        }
      }

      const modal = document.querySelector<HTMLElement>(".modal-backdrop .application-form, .modal-backdrop [role=dialog], .modal-backdrop form");
      if (modal && activeTaskButton && !modal.querySelector('[data-task-proxy="true"]')) {
        const proxy = document.createElement("button");
        proxy.type = "button";
        proxy.dataset.taskProxy = "true";
        proxy.textContent = "＋ 新增申请任务";
        proxy.style.borderRadius = "999px";
        proxy.style.padding = "9px 14px";
        proxy.style.border = "1px solid #c9c4b5";
        proxy.style.background = "#fff";
        proxy.style.fontWeight = "800";
        proxy.addEventListener("click", () => activeTaskButton?.click());
        modal.append(proxy);
      }
    };

    function scheduleEnhance() {
      window.clearTimeout(enhanceTimer);
      enhanceTimer = window.setTimeout(enhance, 60);
    }

    scheduleEnhance();
    observer = new MutationObserver(scheduleEnhance);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("focus", scheduleEnhance);
    return () => {
      disposed = true;
      observer?.disconnect();
      window.removeEventListener("focus", scheduleEnhance);
      window.clearTimeout(enhanceTimer);
    };
  }, []);

  return null;
}
''', encoding="utf-8")

# Navigation persistence no longer rescans the whole DOM after every React mutation.
Path("app/navigation-state-persistence.tsx").write_text(r'''"use client";

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
  document.querySelectorAll<HTMLInputElement>('main input[type="search"]').forEach((input) => {
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
}

export default function NavigationStatePersistence() {
  useEffect(() => {
    let restoreTimer = 0;
    let scrollTimer = 0;
    let restoredScroll = false;

    const scheduleRestore = (delay = 60) => {
      window.clearTimeout(restoreTimer);
      restoreTimer = window.setTimeout(() => {
        restoreControls();
        if (!restoredScroll) {
          const { scrollY } = readState();
          if (scrollY > 0) window.requestAnimationFrame(() => window.scrollTo({ top: scrollY, behavior: "auto" }));
          restoredScroll = true;
        }
      }, delay);
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
      if (!button) return;
      writeState({ selectedNav: normalizedText(button.textContent || "") });
      // New view controls mount after the click; one delayed restore replaces the old
      // whole-document MutationObserver.
      scheduleRestore(80);
    };

    const handleScroll = () => {
      window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => writeState({ scrollY: window.scrollY }), 160);
    };

    document.addEventListener("change", handleChange, true);
    document.addEventListener("input", handleChange, true);
    document.addEventListener("click", handleClick, true);
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("pageshow", () => scheduleRestore(20));
    window.addEventListener("popstate", () => scheduleRestore(20));
    scheduleRestore(20);

    return () => {
      document.removeEventListener("change", handleChange, true);
      document.removeEventListener("input", handleChange, true);
      document.removeEventListener("click", handleClick, true);
      window.removeEventListener("scroll", handleScroll);
      window.clearTimeout(restoreTimer);
      window.clearTimeout(scrollTimer);
    };
  }, []);

  return null;
}
''', encoding="utf-8")

# Fact-fit cards read the application id directly and only score near-visible cards.
fit_path = "app/pending-application-fit-scores.tsx"
replace_once(
    fit_path,
    '''function applicationIdFromCard(card: HTMLElement) {
  const link = card.querySelector<HTMLAnchorElement>('a[data-cv-tailor-action="true"], a[href^="/cv-tailor?applicationId="]');''',
    '''function applicationIdFromCard(card: HTMLElement) {
  const directId = Number(card.dataset.applicationRowId || 0);
  if (Number.isInteger(directId) && directId > 0) return directId;
  const link = card.querySelector<HTMLAnchorElement>('a[data-cv-tailor-action="true"], a[href^="/cv-tailor?applicationId="]');''',
)
replace_once(fit_path, "    const running = new Set<number>();\n", "    const running = new Set<number>();\n    let enhanceTimer = 0;\n    let visibilityObserver: IntersectionObserver | null = null;\n")
replace_once(
    fit_path,
    '''        enqueue(applicationId, panel);
      }
    };

    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "href"] });
    const focus = () => enhance();
    window.addEventListener("focus", focus);

    return () => {
      disposed = true;
      queue.length = 0;
      observer.disconnect();
      window.removeEventListener("focus", focus);
    };''',
    '''        if (panel.dataset.factFitObserved !== "true") {
          panel.dataset.factFitObserved = "true";
          panel.dataset.factFitApplicationId = String(applicationId);
          visibilityObserver?.observe(panel);
        }
      }
    };

    const scheduleEnhance = () => {
      window.clearTimeout(enhanceTimer);
      enhanceTimer = window.setTimeout(enhance, 80);
    };
    visibilityObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const panel = entry.target as HTMLElement;
        const applicationId = Number(panel.dataset.factFitApplicationId || 0);
        if (Number.isInteger(applicationId) && applicationId > 0) enqueue(applicationId, panel);
        visibilityObserver?.unobserve(panel);
      }
    }, { rootMargin: "300px 0px" });

    scheduleEnhance();
    const observer = new MutationObserver(scheduleEnhance);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("focus", scheduleEnhance);

    return () => {
      disposed = true;
      queue.length = 0;
      observer.disconnect();
      visibilityObserver?.disconnect();
      window.removeEventListener("focus", scheduleEnhance);
      window.clearTimeout(enhanceTimer);
    };''',
)

css = Path("app/globals.css")
css.write_text(
    css.read_text(encoding="utf-8")
    + '''\n.quick-start{display:flex;align-items:center;gap:8px;margin:-4px 0 14px;color:var(--muted);font-size:10px}.quick-start span{display:flex;align-items:center;gap:5px}.quick-start b{width:19px;height:19px;display:grid;place-items:center;border-radius:50%;background:var(--mint);color:var(--green-dark);font-size:9px}.quick-start i{font-style:normal;color:#a8b3ad}@media(max-width:540px){.quick-start{flex-wrap:wrap}.quick-start i{display:none}}\n''',
    encoding="utf-8",
)

print("Fast Simple v2 follow-up applied")
