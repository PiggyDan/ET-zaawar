import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "@napi-rs/canvas";

const source = await readFile(new URL("../src/SafetyReader.jsx", import.meta.url), "utf8");
assert.match(source, /pdfjs\.getDocument\(\{\s*url:/, "PDF.js 6 requires an options object");
const task = getDocument({ url: "public/documents/long-distance-travel-policy.pdf" });
try {
  const pdf = await task.promise;
  assert.ok(pdf.numPages > 0);
  for (let number = 1; number <= pdf.numPages; number++) {
    const page = await pdf.getPage(number);
    const viewport = page.getViewport({ scale: 1 });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    console.log(`Rendered page ${number}/${pdf.numPages}`);
  }
} finally {
  await task.destroy();
}
