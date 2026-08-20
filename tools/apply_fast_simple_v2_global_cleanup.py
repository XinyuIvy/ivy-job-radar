from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"anchor not found in {path}: {old[:180]!r}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")


# Remove obsolete globally mounted layers. JobDataCache is kept as a utility module for old callers,
# but its fetch monkey-patch is no longer mounted. Pending visibility is enforced by /api/jobs.
layout = "app/layout.tsx"
replace_once(layout, 'import JobDataCache from "./job-data-cache";\n', '')
replace_once(layout, 'import OptimisticDashboardActions from "./optimistic-dashboard-actions";\n', '')
replace_once(layout, 'import PendingJobVisibility from "./pending-job-visibility";\n', '')
replace_once(layout, '        <JobDataCache />\n', '')
replace_once(layout, '        <PendingJobVisibility />\n', '')
replace_once(layout, '        <OptimisticDashboardActions />\n', '')

# The four floating maintenance buttons are now in the Tools hub instead of covering every screen.
p = Path(layout)
text = p.read_text(encoding="utf-8")
start = text.find('        <div\n          style={{\n            position: "fixed",')
if start < 0:
    raise SystemExit("floating tool block start not found")
end_marker = '        </div>\n      </body>'
end = text.find(end_marker, start)
if end < 0:
    raise SystemExit("floating tool block end not found")
text = text[:start] + '      </body>' + text[end + len(end_marker):]
p.write_text(text, encoding="utf-8")

# Cross-tab Chrome saves become a lightweight event bridge; React owns the visible list.
Path("app/pending-application-live-sync.tsx").write_text(r'''"use client";

import { useEffect } from "react";

type PendingMessage = {
  type?: string;
  application?: { id?: number; company?: string; title?: string };
  sentAt?: number;
};

const CHANNEL_NAME = "ivy-job-radar-updates";
const STORAGE_KEY = "ivy-job-radar:last-pending-created";
const REFRESH_EVENT = "ivy-job-radar:pending-refresh";

export default function PendingApplicationLiveSync() {
  useEffect(() => {
    const notify = (message?: PendingMessage) => {
      if (message && message.type !== "ivy-job-radar-pending-created") return;
      window.dispatchEvent(new CustomEvent(REFRESH_EVENT, { detail: message?.application ?? null }));
    };
    const windowHandler = (event: MessageEvent<PendingMessage>) => {
      if (event.origin !== window.location.origin) return;
      notify(event.data);
    };
    const storageHandler = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      try { notify(JSON.parse(event.newValue) as PendingMessage); } catch {}
    };
    const focusHandler = () => notify();
    const visibilityHandler = () => {
      if (document.visibilityState === "visible") notify();
    };

    window.addEventListener("message", windowHandler);
    window.addEventListener("storage", storageHandler);
    window.addEventListener("focus", focusHandler);
    document.addEventListener("visibilitychange", visibilityHandler);
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHANNEL_NAME) : null;
    if (channel) channel.onmessage = (event: MessageEvent<PendingMessage>) => notify(event.data);

    return () => {
      window.removeEventListener("message", windowHandler);
      window.removeEventListener("storage", storageHandler);
      window.removeEventListener("focus", focusHandler);
      document.removeEventListener("visibilitychange", visibilityHandler);
      channel?.close();
    };
  }, []);
  return null;
}
''', encoding="utf-8")

radar = "app/job-radar.tsx"
# Remove a now-unused helper and refresh candidate applications only when a cross-tab save event arrives.
replace_once(
    radar,
    '''  const loadApplications = async () => {
    const response = await fetch("/api/applications", { cache: "no-store" });
    if (response.ok) setApplicationsList(await response.json());
  };

''',
    '',
)
replace_once(
    radar,
    '''  useEffect(() => {
    if (view !== "applications" || !applicationInsightsOpen) return;''',
    '''  useEffect(() => {
    if (view !== "saved") return;
    let active = true;
    let refreshTimer = 0;
    const refreshPending = () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        fetch("/api/applications", { cache: "no-store" })
          .then((response) => response.ok ? response.json() : null)
          .then((rows) => {
            if (active && Array.isArray(rows)) setApplicationsList(rows);
          });
      }, 80);
    };
    window.addEventListener("ivy-job-radar:pending-refresh", refreshPending);
    return () => {
      active = false;
      window.clearTimeout(refreshTimer);
      window.removeEventListener("ivy-job-radar:pending-refresh", refreshPending);
    };
  }, [view]);

  useEffect(() => {
    const applyRows = (event: Event) => {
      const rows = (event as CustomEvent<Job[]>).detail;
      if (!Array.isArray(rows)) return;
      setDailyJobs(rows);
      setSaved(rows.filter((job) => job.saved).map((job) => job.id));
      writeJobSessionCache(rows);
    };
    const removeIgnored = (event: Event) => {
      const detail = (event as CustomEvent<{ company?: string; title?: string }>).detail || {};
      const company = String(detail.company || "").trim().toLocaleLowerCase();
      const title = String(detail.title || "").trim().toLocaleLowerCase();
      if (!company || !title) return;
      setDailyJobs((current) => {
        const next = current.filter((job) => !(job.company.trim().toLocaleLowerCase() === company && job.title.trim().toLocaleLowerCase() === title));
        writeJobSessionCache(next);
        return next;
      });
    };
    window.addEventListener("ivy-job-radar:jobs-updated", applyRows);
    window.addEventListener("ivy-job-radar:job-ignored", removeIgnored);
    return () => {
      window.removeEventListener("ivy-job-radar:jobs-updated", applyRows);
      window.removeEventListener("ivy-job-radar:job-ignored", removeIgnored);
    };
  }, []);

  useEffect(() => {
    if (view !== "applications" || !applicationInsightsOpen) return;''',
)

# React owns saved visibility now, so starring a job removes it from Today immediately.
replace_once(
    radar,
    '''          (view !== "today" || !["已过期", "疑似过期"].includes(job.status)) &&
          (track === "全部" || job.track === track) &&''',
    '''          (view !== "today" || !["已过期", "疑似过期"].includes(job.status)) &&
          (view !== "today" || !saved.includes(job.id)) &&
          (track === "全部" || job.track === track) &&''',
)

# Keep the explicit session cache coherent when a star is toggled.
replace_once(
    radar,
    '''  const toggleSaved = async (id: number) => {
    const isSaved = saved.includes(id);
    setSaved((current) => isSaved ? current.filter((item) => item !== id) : [...current, id]);''',
    '''  const toggleSaved = async (id: number) => {
    const isSaved = saved.includes(id);
    setSaved((current) => isSaved ? current.filter((item) => item !== id) : [...current, id]);
    setDailyJobs((current) => {
      const next = current.map((job) => job.id === id ? { ...job, saved: !isSaved } : job);
      writeJobSessionCache(next);
      return next;
    });''',
)
replace_once(
    radar,
    '''    if (!response.ok) await loadSavedJobs();
  };''',
    '''    if (!response.ok) {
      await loadSavedJobs();
      setDailyJobs((current) => {
        const next = current.map((job) => job.id === id ? { ...job, saved: isSaved } : job);
        writeJobSessionCache(next);
        return next;
      });
    }
  };''',
)

# Normal ignore is fully optimistic, not only visually enhanced by a global DOM watcher.
replace_once(
    radar,
    '''  const ignoreJob = async (reason: string) => {
    if (!ignoreTarget) return;
    setIgnoreSaving(true);
    const response = await fetch("/api/ignored-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company: ignoreTarget.company,
        title: ignoreTarget.title,
        jobUrl: ignoreTarget.jobUrl,
        reason,
      }),
    });
    setIgnoreSaving(false);
    if (!response.ok) return;
    setDailyJobs((current) => current.filter((job) => job.id !== ignoreTarget.id));
    setSaved((current) => current.filter((id) => id !== ignoreTarget.id));
    setIgnoreTarget(null);
    await loadIgnoredJobs();
  };''',
    '''  const ignoreJob = async (reason: string) => {
    if (!ignoreTarget) return;
    const target = ignoreTarget;
    const jobsSnapshot = dailyJobs;
    const savedSnapshot = saved;
    setIgnoreTarget(null);
    setIgnoreSaving(true);
    setDailyJobs((current) => {
      const next = current.filter((job) => job.id !== target.id);
      writeJobSessionCache(next);
      return next;
    });
    setSaved((current) => current.filter((id) => id !== target.id));
    const response = await fetch("/api/ignored-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company: target.company, title: target.title, jobUrl: target.jobUrl, reason }),
    });
    setIgnoreSaving(false);
    if (!response.ok) {
      setDailyJobs(jobsSnapshot);
      writeJobSessionCache(jobsSnapshot);
      setSaved(savedSnapshot);
      setIgnoreTarget(target);
      return;
    }
    if (view === "ignored" || view === "tools") void loadIgnoredJobs();
  };''',
)

# Add all former floating maintenance links to the Tools hub.
replace_once(
    radar,
    '''            <a className="tool-card" href="/bookmarklet"><span>＋</span><strong>保存岗位按钮</strong><p>安装浏览器一键保存岗位。</p></a>
            <button type="button" className="tool-card" onClick={() => setView("ignored")}><span>×</span><strong>忽略名单</strong><p>恢复之前不想再看到的岗位。</p></button>''',
    '''            <a className="tool-card" href="/bookmarklet"><span>＋</span><strong>保存岗位按钮</strong><p>安装浏览器一键保存岗位。</p></a>
            <a className="tool-card" href="/cv-knowledge"><span>◈</span><strong>能力资料</strong><p>查看用于岗位匹配和 CV 定制的能力知识库。</p></a>
            <a className="tool-card" href="/screening-learning"><span>◇</span><strong>筛选学习</strong><p>查看筛选规则和学习建议。</p></a>
            <button type="button" className="tool-card" onClick={() => setView("ignored")}><span>×</span><strong>忽略名单</strong><p>恢复之前不想再看到的岗位。</p></button>''',
)

# Gate verification enhancement behind the Verify page and cap refreshes to once per second.
verify = "app/verification-queue-actions.tsx"
replace_once(
    verify,
    '''function key(company: string, title: string) {
  return `${normalize(company)}::${normalize(title)}`;
}
''',
    '''function key(company: string, title: string) {
  return `${normalize(company)}::${normalize(title)}`;
}

function verifyViewActive() {
  const title = document.querySelector<HTMLElement>(".hero h1")?.textContent?.trim() || "";
  return title === "岗位核验";
}
''',
)
replace_once(verify, '    let scheduled = false;\n', '    let scheduled = false;\n    let lastRunAt = 0;\n')
replace_once(
    verify,
    '''    const enhance = async () => {
      scheduled = false;
      if (disposed) return;''',
    '''    const enhance = async () => {
      scheduled = false;
      if (disposed || !verifyViewActive()) return;
      const now = Date.now();
      if (now - lastRunAt < 1000) return;
      lastRunAt = now;''',
)
replace_once(
    verify,
    '''              window.dispatchEvent(new CustomEvent("ivy-job-radar-approved", { detail: approved }));''',
    '''              window.dispatchEvent(new CustomEvent("ivy-job-radar-approved", { detail: approved }));
              window.dispatchEvent(new CustomEvent("ivy-job-radar:jobs-updated", { detail: rows }));''',
)
replace_once(
    verify,
    '''      window.setTimeout(() => void enhance(), 0);''',
    '''      window.setTimeout(() => void enhance(), 80);''',
)

# Hard-requirement dialog enhancement is debounced and updates React state without a page reload.
hard = "app/hard-requirement-ignore-actions.tsx"
replace_once(hard, 'import { removeCachedJob } from "./job-data-cache";\n\n', '')
replace_once(
    hard,
    '''        removeCachedJob(company, title);
        hideMatchingJob(card);
        help.textContent = "已保存。岗位正在从列表移除。";
        closeDialog(dialog);

        // Reload from the persisted server result so React state and the visible count stay in sync.
        window.setTimeout(() => window.location.reload(), 80);''',
    '''        hideMatchingJob(card);
        help.textContent = "已保存。岗位正在从列表移除。";
        window.dispatchEvent(new CustomEvent("ivy-job-radar:job-ignored", { detail: { company, title } }));
        closeDialog(dialog);''',
)
replace_once(
    hard,
    '''  useEffect(() => {
    const scan = () => {
      document.querySelectorAll<HTMLElement>(".ignore-dialog").forEach(enhanceDialog);
    };
    scan();
    const observer = new MutationObserver(scan);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);''',
    '''  useEffect(() => {
    let timer = 0;
    const scan = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => document.querySelectorAll<HTMLElement>(".ignore-dialog").forEach(enhanceDialog), 60);
    };
    scan();
    const observer = new MutationObserver(scan);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, []);''',
)

# Fix navigation listener cleanup while keeping it MutationObserver-free.
nav = "app/navigation-state-persistence.tsx"
replace_once(
    nav,
    '''    document.addEventListener("change", handleChange, true);
    document.addEventListener("input", handleChange, true);
    document.addEventListener("click", handleClick, true);
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("pageshow", () => scheduleRestore(20));
    window.addEventListener("popstate", () => scheduleRestore(20));''',
    '''    const handlePageShow = () => scheduleRestore(20);
    const handlePopState = () => scheduleRestore(20);
    document.addEventListener("change", handleChange, true);
    document.addEventListener("input", handleChange, true);
    document.addEventListener("click", handleClick, true);
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("popstate", handlePopState);''',
)
replace_once(
    nav,
    '''      window.removeEventListener("scroll", handleScroll);
      window.clearTimeout(restoreTimer);''',
    '''      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("popstate", handlePopState);
      window.clearTimeout(restoreTimer);''',
)

print("Global runtime cleanup applied")
