import fs from "fs";
import PDFDocument from "pdfkit";

function buildSamplePdf(outPath) {
  const doc = new PDFDocument({ size: "A4", margin: 40 });
  const stream = fs.createWriteStream(outPath);
  doc.pipe(stream);

  doc.fontSize(16).text("Аяллын аюулгүй ажиллагааны зааварчилгаа", { align: "center" });
  doc.moveDown();

  const addRow = (label, value) => {
    doc.fontSize(11).fillColor("black").text(`${label}: `, { continued: true });
    doc.fontSize(11).fillColor("black").text(value || "-");
  };

  addRow("Компани", "Тест компани");
  addRow("Харьяалагдах хэлтэс", "IT");
  addRow("Аялах өдөр", "2026-09-04");
  addRow("Аялах чиглэл", "Улаанбаатар - Арван");

  doc.moveDown();
  doc.fontSize(12).text("Ажилтан 1", { underline: true });
  addRow("Овог нэр", "Бат-Эрдэнэ");
  addRow("Албан тушаал", "Developer");
  addRow("Утас", "99112233");

  doc.end();

  return new Promise((resolve, reject) => {
    stream.on("finish", () => resolve(outPath));
    stream.on("error", reject);
  });
}

(async function () {
  try {
    const out = await buildSamplePdf("./sample-output.pdf");
    console.log("Wrote sample PDF:", out);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
