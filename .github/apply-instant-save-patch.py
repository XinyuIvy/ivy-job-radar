from pathlib import Path

root = Path(__file__).resolve().parents[1]

job_path = root / "app" / "job-radar.tsx"
source = job_path.read_text(encoding="utf-8")
old = '''  const saveApplication = async (event: FormEvent) => {
    event.preventDefault();
    if (!form) return;
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/applications", {
      method: form.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (!response.ok) {
      setMessage("保存失败，请稍后重试。");
      return;
    }
    const savedApplication = await response.json() as Application;
    const taskDueDate = savedApplication.plannedApplicationDate || savedApplication.deadline;
    if (savedApplication.id && taskDueDate && !tasks.some((task) => task.applicationId === savedApplication.id && task.title === "准备并提交申请")) {
      await fetch("/api/workflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "task", applicationId: savedApplication.id, title: "准备并提交申请", dueDate: taskDueDate, reminderDate: taskDueDate, status: "pending", source: "automatic" }),
      });
      await loadWorkflow();
    }
    await loadApplications();
    setForm(null);
    if (form.status === "准备材料") {
      setView("saved");
      setSavedBucket("pending");
    } else if (form.status === "撤回" || form.status === "拒绝") {
      setView("today");
    } else {
      setView("applications");
    }
  };
'''
new = '''  const saveApplication = async (event: FormEvent) => {
    event.preventDefault();
    if (!form || saving) return;
    const submittedForm = form;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/applications", {
        method: submittedForm.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submittedForm),
      });
      if (!response.ok) {
        setMessage("保存失败，请稍后重试。");
        return;
      }

      const savedApplication = await response.json() as Application;
      setApplicationsList((current) => {
        const index = current.findIndex((item) => item.id === savedApplication.id);
        if (index < 0) return [savedApplication, ...current];
        return current.map((item, itemIndex) => itemIndex === index ? savedApplication : item);
      });

      // The application record is already durable at this point. Close the editor immediately;
      // automatic task creation and a server reconciliation must not block the user's save UI.
      setForm(null);
      if (savedApplication.status === "准备材料") {
        setView("saved");
        setSavedBucket("pending");
      } else if (savedApplication.status === "撤回" || savedApplication.status === "拒绝") {
        setView("today");
      } else {
        setView("applications");
      }

      void (async () => {
        const taskDueDate = savedApplication.plannedApplicationDate || savedApplication.deadline;
        if (savedApplication.id && taskDueDate && !tasks.some((task) => task.applicationId === savedApplication.id && task.title === "准备并提交申请")) {
          const taskResponse = await fetch("/api/workflow", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ kind: "task", applicationId: savedApplication.id, title: "准备并提交申请", dueDate: taskDueDate, reminderDate: taskDueDate, status: "pending", source: "automatic" }),
          });
          if (taskResponse.ok) await loadWorkflow();
        }
        await loadApplications();
      })();
    } finally {
      setSaving(false);
    }
  };
'''
if old not in source:
    if new not in source:
        raise SystemExit("saveApplication source block not found")
else:
    job_path.write_text(source.replace(old, new, 1), encoding="utf-8")

# Avoid repeating all D1 CREATE TABLE / PRAGMA migration calls for every API request in the same Worker isolate.
db_path = root / "db" / "index.ts"
db = db_path.read_text(encoding="utf-8")
if "let schemaInitialization: Promise<void> | null = null;" not in db:
    db = db.replace(
        'import * as schema from "./schema";\n',
        'import * as schema from "./schema";\n\nlet schemaInitialization: Promise<void> | null = null;\n',
        1,
    )
start_marker = "  // Runtime initialization keeps local previews and fresh deployments usable.\n"
end_marker = "  return drizzle(env.DB, { schema });\n"
if "schemaInitialization = (async () =>" not in db:
    if start_marker not in db or end_marker not in db:
        raise SystemExit("db initialization markers not found")
    db = db.replace(
        start_marker,
        '  if (!schemaInitialization) {\n    schemaInitialization = (async () => {\n' + start_marker,
        1,
    )
    db = db.replace(
        end_marker,
        '    })().catch((error) => {\n      schemaInitialization = null;\n      throw error;\n    });\n  }\n  await schemaInitialization;\n\n' + end_marker,
        1,
    )
db_path.write_text(db, encoding="utf-8")

test_path = root / "tests" / "test_application_save_performance.py"
test_path.write_text('''import unittest\nfrom pathlib import Path\n\nROOT = Path(__file__).resolve().parents[1]\n\n\nclass ApplicationSavePerformanceTests(unittest.TestCase):\n    def test_application_editor_closes_after_core_save_before_background_reconciliation(self):\n        source = (ROOT / "app" / "job-radar.tsx").read_text(encoding="utf-8")\n        self.assertIn("if (!form || saving) return", source)\n        self.assertIn("const submittedForm = form", source)\n        self.assertIn("setApplicationsList((current) =>", source)\n        self.assertIn("setForm(null)", source)\n        self.assertIn("void (async () =>", source)\n        self.assertLess(source.index("setForm(null)", source.index("const saveApplication")), source.index("await loadApplications()", source.index("const saveApplication")))\n        self.assertIn("finally {\\n      setSaving(false);", source)\n\n    def test_db_schema_initialization_is_shared_within_worker_isolate(self):\n        source = (ROOT / "db" / "index.ts").read_text(encoding="utf-8")\n        self.assertIn("let schemaInitialization: Promise<void> | null = null", source)\n        self.assertIn("if (!schemaInitialization)", source)\n        self.assertIn("schemaInitialization = (async () =>", source)\n        self.assertIn("await schemaInitialization", source)\n        self.assertIn("schemaInitialization = null", source)\n\n\nif __name__ == "__main__":\n    unittest.main()\n''', encoding="utf-8")
