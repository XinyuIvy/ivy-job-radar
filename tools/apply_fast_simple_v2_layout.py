from pathlib import Path

css = Path("app/globals.css")
text = css.read_text(encoding="utf-8")
old = "grid-template-columns: repeat(6, minmax(0, 1fr));"
if old not in text:
    raise SystemExit("six-column mobile nav rule not found")
css.write_text(text.replace(old, "grid-template-columns: repeat(5, minmax(0, 1fr));", 1), encoding="utf-8")
print("Five-tab mobile navigation applied")
