import assert from "node:assert/strict";
import test, { after } from "node:test";

import { createServer } from "vite";

const vite = await createServer({
  configFile: false,
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
});
const {
  createCvTemplateOption,
  isCvTemplateFilename,
  recommendCvTemplateOption,
  sortCvTemplateOptions,
} = await vite.ssrLoadModule("/app/lib/cv-template-catalog.ts");

after(async () => {
  await vite.close();
});

test("catalog accepts every safe tex filename instead of a fixed industry whitelist", () => {
  const filenames = [
    "CV_Applied_DS_Internet_EN.tex",
    "CV_Applied_DS_互联网_中文.tex",
    "CV_Biostatistician_EN.tex",
    "CV_Biostatistician_医药临床_中文.tex",
    "CV_New Industry (RWE)+EN.tex",
  ];
  assert.equal(filenames.every(isCvTemplateFilename), true);
  assert.equal(isCvTemplateFilename("../secret.tex"), false);
  assert.equal(isCvTemplateFilename("README.md"), false);

  const options = sortCvTemplateOptions(filenames.map(createCvTemplateOption).filter(Boolean));
  assert.equal(options.length, filenames.length);
  assert.equal(options.find((option) => option.filename.includes("Internet"))?.language, "en");
  assert.equal(options.find((option) => option.filename.includes("互联网"))?.language, "zh");
});

test("job signals recommend the closest file while retaining the full catalog", () => {
  const options = [
    "CV_Applied_DS_Internet_EN.tex",
    "CV_Biostatistician_EN.tex",
    "CV_Quant_EN.tex",
  ].map(createCvTemplateOption).filter(Boolean);
  assert.equal(recommendCvTemplateOption(options, "en", "Senior Biostatistician")?.filename, "CV_Biostatistician_EN.tex");
  assert.equal(recommendCvTemplateOption(options, "en", "Product Data Scientist")?.filename, "CV_Applied_DS_Internet_EN.tex");
  assert.equal(options.length, 3);
});
