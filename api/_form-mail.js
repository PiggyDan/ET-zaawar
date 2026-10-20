/**
 * Core send logic for the travel-safety form.
 *
 * Shared by the Vercel serverless functions (api/send.js, api/mechanic.js)
 * and the local dev middleware in vite.config.js, so both environments
 * behave identically.
 *
 * Two routes:
 * - АТҮТ / public transport: the form goes straight to the final recipients.
 * - Every other trip, and every blasting trip: the form goes to the
 *   mechanics with a signed link. The mechanic opens it, fills in the
 *   vehicle inspection, and that sends the form plus the inspection to the
 *   final recipients.
 *
 * Files prefixed with "_" are not routed by Vercel.
 */

import {
  BLAST_TRIP,
  ITEM_BAD,
  ITEM_STATUSES,
  MECHANIC_PASS,
  blastRows,
  checklistComplete,
  checklistFor,
  inspectionHasCount,
  inspectionSheetFor,
  needsMechanic,
  travelRows,
  validateBlast,
  validateInspection,
  validateTravel
} from "./_trips.js";
import { createHash, randomUUID, timingSafeEqual } from "crypto";
import { hasLinkSecret, signToken, verifyToken } from "./_link-token.js";
import { getStore, listRecords } from "./_store.js";

const DEFAULT_RECIPIENTS = [
  "zasaginfo@gmail.com",
  "zcm.hse.bilgee@gmail.com",
  "hse.zcm@erkhettunsh.com",
  "battseren@srmongolia.mn"
];

// Resend only delivers to arbitrary addresses from a verified domain.
const DEFAULT_FROM = "Аяллын маягт <onboarding@resend.dev>";

// Keep well under Vercel's 4.5MB request body limit.
const MAX_SIGNATURE_BYTES = 3 * 1024 * 1024;

// The copy that rides inside the mechanic's link; keeps the link short.
const MAX_THUMB_BYTES = 24 * 1024;

const SIGNATURE_CID = "signature";
const MECHANIC_SIGNATURE_CID = "mechanic-signature";

const esc = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const addressList = (name) =>
  (process.env[name] || "")
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean);

function recipients() {
  const configured = addressList("MAIL_TO");
  return configured.length > 0 ? configured : DEFAULT_RECIPIENTS;
}

const mechanicRecipients = () => addressList("MECHANIC_TO");

const isBlast = (form) => form.tripType === BLAST_TRIP;

const directionOf = (form) =>
  isBlast(form)
    ? `${form.routeFrom} - ${form.routeTo}`
    : form.direction === "Бусад" ? form.otherDirection : form.direction;

const titleOf = (form) =>
  isBlast(form)
    ? "Тэсрэх бодис тээвэрлэх үеийн аюулгүй ажиллагааны зааварчилгаа"
    : "Аяллын аюулгүй ажиллагааны зааварчилгаа";

/** Label/value rows describing a submission, in display order. */
const summaryRows = (form) => (isBlast(form) ? blastRows(form) : travelRows(form));

/** Label/value rows heading a mechanic's inspection, in display order. */
function inspectionRows(form, inspection) {
  return [
    ["Дүгнэлт", inspection.result],
    ["Механик дүгнэлт", inspection.note],
    ["Тайлбар", inspection.remarks],
    ["Одометрийн заалт (км)", inspection.odometer],
    ["Мото цаг", inspection.motoHours],
    ["Үзлэг хийсэн жолооч", form.driver],
    ["Хянасан механик", inspection.mechanic],
    ["Механикийн утас", inspection.mechanicPhone]
  ];
}

/** The inspection sheet with each item's result: [{ title, items: [{ label, status, note }] }]. */
const inspectionGroups = (form, inspection) =>
  inspectionSheetFor(form).map(({ title, items }) => ({
    title,
    items: items.map(({ id, label }) => ({ label, ...inspection.items[id] }))
  }));

const itemDetail = ({ count, note }) =>
  [count && `тоо: ${count}`, note].filter(Boolean).join(", ");

const itemLine = (item) =>
  `${item.status === ITEM_BAD ? "[!]" : "[x]"} ${item.label}: ${item.status}${itemDetail(item) ? ` (${itemDetail(item)})` : ""}`;

async function buildPdfBuffer(form, employees, signature, inspection, mechanicSignature) {
  const PDFDocument = (await import("pdfkit")).default;
  const doc = new PDFDocument({ size: "A4", margin: 40 });
  const buffers = [];
  doc.on("data", (d) => buffers.push(d));

  doc.fontSize(16).text(titleOf(form), { align: "center" });
  doc.moveDown();

  const addRow = (label, value) => {
    doc.fontSize(11).fillColor("black").text(`${label}: `, { continued: true, width: 150 });
    doc.fontSize(11).fillColor("black").text(value || "-");
  };

  summaryRows(form).forEach(([label, value]) => addRow(label, value));

  if (checklistFor(form).length > 0) {
    doc.moveDown();
    doc.fontSize(12).text("Шалгах хуудас", { underline: true });
    checklistFor(form).forEach((item) => doc.fontSize(11).text(`[x] ${item}`));
  }

  doc.moveDown();
  employees.forEach((employee, idx) => {
    doc.fontSize(12).fillColor("black").text(`Ажилтан ${idx + 1}`, { underline: true });
    addRow("Овог нэр", employee.name);
    addRow("Албан тушаал", employee.position);
    addRow("Утас", employee.phone);
    doc.moveDown();
  });

  if (inspection) {
    doc.fontSize(12).text("Механикийн үзлэг", { underline: true });
    inspectionRows(form, inspection).forEach(([label, value]) => addRow(label, value));
    inspectionGroups(form, inspection).forEach(({ title, items }) => {
      doc.moveDown(0.5).fontSize(11).text(title, { underline: true });
      items.forEach((item) => doc.fontSize(10).text(itemLine(item)));
    });
  }

  [["Гарын үсэг:", signature], ["Механикийн гарын үсэг:", mechanicSignature]].forEach(([label, image]) => {
    if (!image?.buffer) return;
    try {
      doc.addPage();
      doc.fontSize(12).text(label);
      doc.image(image.buffer, { fit: [400, 200], align: "left" });
    } catch (e) {
      // ignore if embedding fails
    }
  });

  doc.end();

  await new Promise((res) => doc.on("end", res));
  return Buffer.concat(buffers);
}

async function ensureYearMonthFolder(drive, parentFolderId) {
  // Determine year and month names using Asia/Ulaanbaatar timezone.
  const now = new Date();
  const year = new Intl.DateTimeFormat("en", { timeZone: "Asia/Ulaanbaatar", year: "numeric" }).format(now);
  const monthName = new Intl.DateTimeFormat("en", { timeZone: "Asia/Ulaanbaatar", month: "long" }).format(now);

  // Find or create year folder under parent
  const qYear = `name = '${year}' and '${parentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  let res = await drive.files.list({ q: qYear, fields: "files(id,name)", spaces: "drive" });
  let yearFolderId;
  if (res.data.files && res.data.files.length > 0) {
    yearFolderId = res.data.files[0].id;
  } else {
    const createdYear = await drive.files.create({
      requestBody: { name: year, mimeType: "application/vnd.google-apps.folder", parents: [parentFolderId] },
      fields: "id"
    });
    yearFolderId = createdYear.data.id;
  }

  // Find or create month folder under year folder
  const qMonth = `name = '${monthName}' and '${yearFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  res = await drive.files.list({ q: qMonth, fields: "files(id,name)", spaces: "drive" });
  if (res.data.files && res.data.files.length > 0) return res.data.files[0].id;

  const createdMonth = await drive.files.create({
    requestBody: { name: monthName, mimeType: "application/vnd.google-apps.folder", parents: [yearFolderId] },
    fields: "id"
  });
  return createdMonth.data.id;
}

async function uploadBufferToDrive(drive, buffer, filename, folderId) {
  const { PassThrough } = await import("stream");
  const stream = new PassThrough();
  stream.end(buffer);

  const res = await drive.files.create({
    requestBody: { name: filename, parents: [folderId], mimeType: "application/pdf" },
    media: { mimeType: "application/pdf", body: stream },
    fields: "id"
  });

  return res.data.id;
}

/** Turns a data URL from the browser into an email attachment. */
function parseSignature(signature, { name = "garyn-useg", maxBytes = MAX_SIGNATURE_BYTES } = {}) {
  if (typeof signature !== "string" || !signature.startsWith("data:")) {
    return { error: "Гарын үсэг буруу форматтай байна." };
  }

  const match = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(signature);
  if (!match) {
    return { error: "Гарын үсэг зөвхөн зураг байх ёстой." };
  }

  const [, contentType, base64] = match;
  const buffer = Buffer.from(base64, "base64");

  if (buffer.length === 0) {
    return { error: "Гарын үсгийн зураг хоосон байна." };
  }
  if (buffer.length > maxBytes) {
    return { error: "Гарын үсгийн зураг хэт том байна. Жижиг зураг сонгоно уу." };
  }

  const extension = contentType.split("/")[1].replace("jpeg", "jpg").replace("+xml", "");

  return { base64, buffer, contentType, filename: `${name}.${extension}` };
}

function validate(form, employees) {
  const missing = isBlast(form) ? validateBlast(form) : validateTravel(form);

  if (!checklistComplete(form)) missing.push("Тээвэрлэлтийн өмнөх шалгах хуудас");

  if (employees.length === 0) missing.push("Зорчих ажилтан");

  employees.forEach((employee, index) => {
    if (!employee?.name?.trim()) missing.push(`Ажилтан ${index + 1} - Овог нэр`);
    if (!employee?.position?.trim()) missing.push(`Ажилтан ${index + 1} - Албан тушаал`);
    if (!employee?.phone?.trim()) missing.push(`Ажилтан ${index + 1} - Утасны дугаар`);
  });

  return missing;
}

/**
 * The email body. With `mechanicLink` it is the mechanic's copy, ending in a
 * button to the inspection form; with `inspection` it is the final copy,
 * including the mechanic's findings and signature.
 */
function buildHtml(form, employees, { inspection, mechanicLink } = {}) {
  const row = (label, value) => `
        <tr>
          <td style="padding:8px 12px; background:#f9fafb; border:1px solid #e5e7eb; width:200px; vertical-align:top;">${esc(label)}</td>
          <td style="padding:8px 12px; border:1px solid #e5e7eb;">${esc(value) || "-"}</td>
        </tr>`;

  const groupRow = (title) => `
        <tr>
          <td colspan="2" style="padding:10px 12px; background:#eef2ff; border:1px solid #e5e7eb; font-weight:700;">${esc(title)}</td>
        </tr>`;

  const signatureRow = (label, cid) => `
          <tr>
            <td style="padding:8px 12px; background:#f9fafb; border:1px solid #e5e7eb; vertical-align:top;">${esc(label)}</td>
            <td style="padding:12px; border:1px solid #e5e7eb;">
              <img src="cid:${cid}" alt="${esc(label)}" style="max-width:260px; max-height:140px; border:1px solid #d1d5db; border-radius:6px; background:#ffffff;" />
              <div style="margin-top:6px; font-size:12px; color:#6b7280;">Зураг харагдахгүй бол хавсралтаас үзнэ үү.</div>
            </td>
          </tr>`;

  const employeeRows = employees
    .map(
      (employee, index) =>
        `${groupRow(`Ажилтан ${index + 1}`)}${row("Овог нэр", employee.name)}${row("Албан тушаал", employee.position)}${row("Утасны дугаар", employee.phone)}`
    )
    .join("");

  const checklistRows = checklistFor(form).length > 0
    ? `${groupRow("Шалгах хуудас")}${checklistFor(form).map((item) => row("Шалгасан", item)).join("")}`
    : "";

  const resultColor = inspection?.result === MECHANIC_PASS ? "#166b33" : "#b42318";

  const statusCell = ({ label, status, ...item }) => `
        <tr>
          <td style="padding:6px 12px; background:#f9fafb; border:1px solid #e5e7eb; vertical-align:top;">${esc(label)}</td>
          <td style="padding:6px 12px; border:1px solid #e5e7eb;${status === ITEM_BAD ? " color:#b42318; font-weight:700;" : ""}">${esc(status)}${itemDetail(item) ? ` — ${esc(itemDetail(item))}` : ""}</td>
        </tr>`;

  const inspectionRowsHtml = inspection
    ? `${groupRow("Авто машин үзлэгийн хуудас")}
          <tr>
            <td style="padding:8px 12px; background:#f9fafb; border:1px solid #e5e7eb; vertical-align:top;">Дүгнэлт</td>
            <td style="padding:8px 12px; border:1px solid #e5e7eb; font-weight:700; color:${resultColor};">${esc(inspection.result)}</td>
          </tr>${inspectionRows(form, inspection)
            .filter(([label]) => label !== "Дүгнэлт")
            .map(([label, value]) => row(label, value))
            .join("")}${inspectionGroups(form, inspection)
            .map(({ title, items }) => `
        <tr>
          <td colspan="2" style="padding:8px 12px; background:#f3f4f6; border:1px solid #e5e7eb; font-weight:700; font-size:13px;">${esc(title)}</td>
        </tr>${items.map(statusCell).join("")}`)
            .join("")}${signatureRow("Механикийн гарын үсэг", MECHANIC_SIGNATURE_CID)}`
    : "";

  const heading = isBlast(form)
    ? ["Тэсрэх бодис тээвэрлэх үеийн", "аюулгүй ажиллагааны зааварчилгаа"]
    : ["АТҮТ болон замын унаагаар зорчих үеийн", "аюулгүй ажиллагааны зааварчилгаа"];

  const mechanicBlock = mechanicLink
    ? `
        <div style="margin:0 0 20px; padding:16px; background:#fff7e6; border:1px solid #fcc92b; border-radius:8px;">
          <div style="font-weight:700; margin-bottom:6px;">Механикийн үзлэг шаардлагатай</div>
          <div style="font-size:14px; margin-bottom:14px;">Тээврийн хэрэгслийг шалгаад доорх товчоор үзлэгийн маягтаа бөглөж илгээнэ үү. Таны маягт илгээгдсэний дараа энэ мэдээлэл хариуцсан ажилтнуудад очно.</div>
          <a href="${esc(mechanicLink)}" style="display:inline-block; padding:12px 20px; background:#1f8a43; color:#ffffff; text-decoration:none; font-weight:700; border-radius:8px;">Үзлэгийн маягт бөглөх</a>
        </div>`
    : "";

  return `<!doctype html>
<html lang="mn">
  <body style="margin:0; padding:24px; background:#f3f4f6; font-family:Arial,Helvetica,sans-serif; color:#111827;">
    <div style="max-width:720px; margin:0 auto; background:#ffffff; border:1px solid #e5e7eb; border-radius:10px; overflow:hidden;">
      <div style="padding:20px 24px; background:#1e3a8a; color:#ffffff;">
        <div style="font-size:18px; font-weight:700;">${esc(heading[0])}</div>
        <div style="font-size:18px; font-weight:700;">${esc(heading[1])}</div>
      </div>

      <div style="padding:24px;">${mechanicBlock}
        <table cellpadding="0" cellspacing="0" style="border-collapse:collapse; width:100%; font-size:14px;">
          ${summaryRows(form).map(([label, value]) => row(label, value)).join("")}
          ${employeeRows}${checklistRows}
          ${groupRow("Баталгаажуулалт")}
          <tr>
            <td style="padding:8px 12px; background:#f9fafb; border:1px solid #e5e7eb; vertical-align:top;">Танилцсан эсэх</td>
            <td style="padding:8px 12px; border:1px solid #e5e7eb;">Дээрх шаардлагыг бүрэн уншиж танилцсан, ойлгосон бөгөөд мөрдөхөө зөвшөөрсөн.</td>
          </tr>${signatureRow("Гарын үсэг", SIGNATURE_CID)}${inspectionRowsHtml}
        </table>

        <p style="margin:20px 0 0; font-size:12px; color:#6b7280;">
          Энэ мэдэгдлийг аяллын зааварчилгааны маягт автоматаар илгээв.
        </p>
      </div>
    </div>
  </body>
</html>`;
}

function buildText(form, employees, { inspection, mechanicLink } = {}) {
  const lines = [titleOf(form), ""];

  if (mechanicLink) {
    lines.push("Механикийн үзлэг шаардлагатай. Үзлэгийн маягт:", mechanicLink, "");
  }

  lines.push(...summaryRows(form).map(([label, value]) => `${label}: ${value || "-"}`), "");

  employees.forEach((employee, index) => {
    lines.push(
      `Ажилтан ${index + 1}: ${employee.name} | ${employee.position} | ${employee.phone}`
    );
  });

  if (checklistFor(form).length > 0) {
    lines.push("", "Шалгах хуудас:", ...checklistFor(form).map((item) => `[x] ${item}`));
  }

  if (inspection) {
    lines.push(
      "",
      "Авто машин үзлэгийн хуудас:",
      ...inspectionRows(form, inspection).map(([label, value]) => `${label}: ${value || "-"}`),
      ...inspectionGroups(form, inspection).flatMap(({ title, items }) => ["", `${title}:`, ...items.map(itemLine)])
    );
  }

  lines.push("", "Гарын үсэг хавсралтад байна.");

  return lines.join("\n");
}

function buildSubject(form, employees, { inspection, mechanicLink } = {}) {
  const names = employees.map((employee) => employee.name).filter(Boolean).join(", ");
  const prefix = isBlast(form) ? "Тэсэлгээний аялал" : "Аяллын зааварчилгаа";
  const stage = mechanicLink
    ? "Механикийн үзлэг хүлээгдэж байна | "
    : inspection ? `Механик: ${inspection.result} | ` : "";

  return `${stage}${prefix} | ${form.travelDate} | ${directionOf(form)} | ${names}`;
}

const inlineAttachments = (images) =>
  images.filter(([image]) => image).map(([image, cid]) => ({ ...image, cid }));

async function sendWithSmtp({ to, subject, html, text, images }) {
  const nodemailer = (await import("nodemailer")).default;

  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || (port === 465)) === "true";

  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    // On the STARTTLS port, refuse to fall back to an unencrypted session
    // rather than sending the mailbox password in the clear.
    requireTLS: !secure,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
    // Fail fast: a hung SMTP connection would otherwise run out the
    // serverless function's execution time with no useful error.
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 12000
  });

  const info = await transport.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to,
    subject,
    html,
    text,
    attachments: inlineAttachments(images).map(({ filename, buffer, contentType, cid }) => ({
      filename,
      content: buffer,
      contentType,
      cid
    }))
  });

  return info.messageId;
}

async function sendWithResend({ to, subject, html, text, images }) {
  const { Resend } = await import("resend");
  const resend = new Resend(process.env.RESEND_API_KEY);

  const { data, error } = await resend.emails.send({
    from: process.env.MAIL_FROM || DEFAULT_FROM,
    to,
    subject,
    html,
    text,
    attachments: inlineAttachments(images).map(({ filename, base64, contentType, cid }) => ({
      filename,
      content: base64,
      contentType,
      contentId: cid
    }))
  });

  if (error) {
    const detail = error.message || JSON.stringify(error);
    throw new Error(`Resend: ${detail}`);
  }

  return data?.id;
}

/**
 * Local preview: with MAIL_OUTBOX_DIR set, messages are written there as
 * .eml (open in any mail client) and .html instead of being sent.
 */
async function writeToOutbox({ to, subject, html, text, images }) {
  const nodemailer = (await import("nodemailer")).default;
  const { mkdir, writeFile } = await import("fs/promises");
  const path = await import("path");

  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true });
  const info = await transport.sendMail({
    from: process.env.MAIL_FROM || "outbox@localhost",
    to,
    subject,
    html,
    text,
    attachments: inlineAttachments(images).map(({ filename, buffer, contentType, cid }) => ({
      filename,
      content: buffer,
      contentType,
      cid
    }))
  });

  const dir = process.env.MAIL_OUTBOX_DIR;
  const base = path.join(dir, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  await mkdir(dir, { recursive: true });
  await writeFile(`${base}.eml`, info.message);
  await writeFile(`${base}.html`, html);

  return `${base}.eml`;
}

/** Returns an error response if no mail provider is usable, else null. */
function mailConfigError() {
  if (process.env.MAIL_OUTBOX_DIR) return null;

  const useSmtp = Boolean(process.env.SMTP_HOST);

  // smtp.gkllc.mn rejects unauthenticated senders, so treat missing
  // credentials as a configuration error instead of a delivery failure.
  if (useSmtp && !(process.env.SMTP_USER && process.env.SMTP_PASS)) {
    return { status: 500, body: { error: "SMTP хэрэглэгч болон нууц үг тохируулаагүй байна." } };
  }

  if (!useSmtp && !process.env.RESEND_API_KEY) {
    return { status: 500, body: { error: "Имэйл тохиргоо дутуу байна (RESEND_API_KEY эсвэл SMTP_HOST)." } };
  }

  return null;
}

function deliver(message) {
  if (process.env.MAIL_OUTBOX_DIR) return writeToOutbox(message);
  return process.env.SMTP_HOST ? sendWithSmtp(message) : sendWithResend(message);
}

const deliveryFailed = (error) => {
  console.error("[api] delivery failed:", error);
  return { status: 502, body: { error: "Имэйл илгээхэд алдаа гарлаа. Та дахин оролдоно уу." } };
};

/** Optionally archives a PDF copy in Google Drive. Returns an error response or null. */
async function archiveToDrive(form, employees, signature, inspection, mechanicSignature) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  const parentFolder = process.env.GOOGLE_DRIVE_FOLDER_ID;

  // If any Google Drive var is present, require all four to proceed.
  if (!(clientId || clientSecret || refreshToken || parentFolder)) return null;

  if (!(clientId && clientSecret && refreshToken && parentFolder)) {
    console.error("[api] Drive upload configured but missing one of GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, or GOOGLE_DRIVE_FOLDER_ID");
    return {
      status: 500,
      body: { error: "Drive upload misconfigured (set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN and GOOGLE_DRIVE_FOLDER_ID)." }
    };
  }

  try {
    const pdfBuffer = await buildPdfBuffer(form, employees, signature, inspection, mechanicSignature);

    const { google } = await import("googleapis");
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    const drive = google.drive({ version: "v3", auth: oauth2Client });

    const targetFolderId = await ensureYearMonthFolder(drive, parentFolder);

    const now = new Date();
    const dtf = new Intl.DateTimeFormat("en", { timeZone: "Asia/Ulaanbaatar", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
    const parts = dtf.formatToParts(now).reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {});
    const dateStr = `${parts.year}-${parts.month}-${parts.day}_${parts.hour}${parts.minute}`;
    const safeNames = employees.map((e) => (e.name || "").replace(/[^a-zA-Z0-9\u0080-￿_-]+/g, "_")).filter(Boolean);
    const namePart = safeNames.length ? safeNames.join("_") : "submission";
    const filename = `${isBlast(form) ? "Blasting_Trip" : "Travel_Request"}_${namePart}_${dateStr}.pdf`;

    await uploadBufferToDrive(drive, pdfBuffer, filename, targetFolderId);
    return null;
  } catch (err) {
    console.error("[api] Drive upload failed:", err);
    return { status: 500, body: { error: `Drive upload failed: ${err.message || String(err)}` } };
  }
}

/** Emails the finished form (with the inspection, if any) to the final recipients. */
async function sendFinal(form, employees, signature, inspection, mechanicSignature) {
  const message = {
    to: recipients(),
    subject: buildSubject(form, employees, { inspection }),
    html: buildHtml(form, employees, { inspection }),
    text: buildText(form, employees, { inspection }),
    images: [[signature, SIGNATURE_CID], [mechanicSignature, MECHANIC_SIGNATURE_CID]]
  };

  let id;
  try {
    id = await deliver(message);
  } catch (error) {
    return deliveryFailed(error);
  }

  const driveError = await archiveToDrive(form, employees, signature, inspection, mechanicSignature);
  if (driveError) return driveError;

  return { status: 200, body: { ok: true, id, stage: "final", to: message.to } };
}

/**
 * Validates the submitted form and emails it: to the final recipients for
 * public transport, otherwise to the mechanics with a link to their
 * inspection form. `origin` is the site's base URL for that link.
 * Returns a { status, body } pair the HTTP layer can send as-is.
 */
export async function sendFormMail(payload, { origin } = {}) {
  const form = payload?.form;
  const employees = Array.isArray(payload?.employees) ? payload.employees : [];

  if (!form || typeof form !== "object") {
    return { status: 400, body: { error: "Маягтын мэдээлэл дутуу байна." } };
  }

  const missing = validate(form, employees);
  if (missing.length > 0) {
    return { status: 400, body: { error: `Дутуу байна: ${missing[0]}` } };
  }

  const signature = parseSignature(payload?.signature);
  if (signature.error) {
    return { status: 400, body: { error: signature.error } };
  }

  const configError = mailConfigError();
  if (configError) return configError;

  if (!needsMechanic(form)) return sendFinal(form, employees, signature);

  const thumb = parseSignature(payload?.signatureThumb, { maxBytes: MAX_THUMB_BYTES });
  if (thumb.error) {
    return { status: 400, body: { error: thumb.error } };
  }

  if (!hasLinkSecret() || mechanicRecipients().length === 0 || !origin) {
    console.error("[api/send] mechanic route needs MECHANIC_TO, MECHANIC_LINK_SECRET (16+ chars) and APP_URL or a Host header");
    return { status: 500, body: { error: "Механикийн имэйл тохиргоо дутуу байна (MECHANIC_TO, MECHANIC_LINK_SECRET)." } };
  }

  // The token carries the small signature copy; the mechanic's email
  // attaches the full-size one.
  const recordId = randomUUID();
  const token = signToken({ id: recordId, form, employees, signature: payload.signatureThumb });
  const mechanicLink = `${origin.replace(/\/+$/, "")}/mechanic#mechanic=${token}`;

  const message = {
    to: mechanicRecipients(),
    subject: buildSubject(form, employees, { mechanicLink }),
    html: buildHtml(form, employees, { mechanicLink }),
    text: buildText(form, employees, { mechanicLink }),
    images: [[signature, SIGNATURE_CID]]
  };

  try {
    const id = await deliver(message);
    await saveForMechanic({ id: recordId, token, form, employees });
    return { status: 200, body: { ok: true, id, stage: "mechanic", to: message.to } };
  } catch (error) {
    return deliveryFailed(error);
  }
}

/** Short description of a submission for the /mechanic list. */
const recordSummary = (form, employees) => ({
  tripType: form.tripType,
  company: form.company,
  vehicle: form.vehicle,
  driver: form.driver,
  date: form.travelDate,
  direction: directionOf(form),
  people: employees.map((employee) => employee.name).filter(Boolean)
});

/**
 * Lists the submission on /mechanic. The email has already gone out, so a
 * storage failure is logged rather than failing the employee's submit.
 */
async function saveForMechanic({ id, token, form, employees }) {
  try {
    const store = await getStore();
    await store?.savePending({ id, token, createdAt: Date.now(), status: "pending", summary: recordSummary(form, employees) });
  } catch (error) {
    console.error("[api] could not save submission for /mechanic:", error);
  }
}

function passwordMatches(given) {
  const expected = process.env.MECHANIC_PASSWORD;
  if (!expected || typeof given !== "string") return false;
  // Hash both, so the comparison takes the same time whatever the length.
  const digest = (value) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

/** The /mechanic list: every stored submission, password protected. */
export async function listForMechanic(payload) {
  if (!process.env.MECHANIC_PASSWORD) {
    return { status: 500, body: { error: "MECHANIC_PASSWORD тохируулаагүй байна." } };
  }
  if (!passwordMatches(payload?.password)) {
    return { status: 401, body: { error: "Нууц үг буруу байна." } };
  }

  const store = await getStore();
  if (!store) {
    return { status: 500, body: { error: "Механикийн жагсаалтын хадгалах сан (Vercel Blob) холбогдоогүй байна." } };
  }

  try {
    const records = await listRecords(store);
    return {
      status: 200,
      body: {
        records: records.map(({ id, token, createdAt, status, summary, done }) => ({ id, token, createdAt, status, summary, done }))
      }
    };
  } catch (error) {
    console.error("[api] could not list submissions:", error);
    return { status: 502, body: { error: "Жагсаалтыг уншиж чадсангүй. Дахин оролдоно уу." } };
  }
}

const invalidLink = {
  status: 400,
  body: { error: "Холбоос хүчингүй эсвэл хугацаа нь дууссан байна. Шинэ маягт илгээхийг хүснэ үү." }
};

/**
 * The mechanic page's backend. With only `token`, returns the submission
 * for display; with `inspection` and `signature` as well, validates the
 * mechanic's form and emails everything to the final recipients.
 */
export async function handleMechanic(payload) {
  const data = verifyToken(payload?.token);
  if (!data?.form || !Array.isArray(data.employees)) return invalidLink;

  const { form, employees } = data;

  // Links from before the /mechanic list have no id and no record.
  const store = data.id ? await getStore().catch(() => null) : null;
  const done = store ? (await store.getDone(data.id).catch(() => null))?.done ?? null : null;

  if (payload.inspection === undefined) {
    return {
      status: 200,
      body: {
        title: titleOf(form),
        rows: summaryRows(form),
        sheet: inspectionSheetFor(form),
        hasCount: inspectionHasCount(form),
        checklist: checklistFor(form),
        employees,
        signature: data.signature,
        done
      }
    };
  }

  if (done) {
    return { status: 409, body: { error: `Энэ маягтыг ${done.mechanic} аль хэдийн шалгаж илгээсэн байна.` } };
  }

  const given = payload.inspection ?? {};
  const field = (key) => String(given[key] ?? "").trim();

  // Keep only this trip's sheet items, so nothing else reaches the email.
  const items = {};
  inspectionSheetFor(form).forEach(({ items: groupItems }) => {
    groupItems.forEach(({ id }) => {
      const item = given.items?.[id];
      if (ITEM_STATUSES.includes(item?.status)) {
        items[id] = {
          status: item.status,
          count: inspectionHasCount(form) ? String(item.count ?? "").trim() : "",
          note: String(item.note ?? "").trim()
        };
      }
    });
  });

  const inspection = {
    odometer: field("odometer"),
    motoHours: field("motoHours"),
    mechanic: field("mechanic"),
    mechanicPhone: field("mechanicPhone"),
    result: given.result,
    note: field("note"),
    remarks: field("remarks"),
    items
  };

  const missing = validateInspection(form, inspection);
  if (missing.length > 0) {
    return { status: 400, body: { error: `Дутуу байна: ${missing[0]}` } };
  }

  const mechanicSignature = parseSignature(payload.signature, { name: "mekhanik-garyn-useg" });
  if (mechanicSignature.error) {
    return { status: 400, body: { error: mechanicSignature.error } };
  }

  const configError = mailConfigError();
  if (configError) return configError;

  const signature = parseSignature(data.signature, { maxBytes: MAX_THUMB_BYTES });

  // Claim the form before emailing, so two mechanics sending at once cannot
  // both get through; the claim is released if the email fails.
  if (store) {
    const claimed = await store
      .claimDone({
        id: data.id,
        token: payload.token,
        createdAt: data.iat,
        summary: recordSummary(form, employees),
        status: "done",
        done: { at: Date.now(), mechanic: inspection.mechanic, result: inspection.result }
      })
      .catch((error) => {
        // Storage trouble must not stop the inspection reaching the recipients.
        console.error("[api] could not claim submission:", error);
        return null;
      });

    if (claimed === false) {
      const other = await store.getDone(data.id).catch(() => null);
      return {
        status: 409,
        body: { error: `Энэ маягтыг ${other?.done?.mechanic || "өөр механик"} аль хэдийн шалгаж илгээсэн байна.` }
      };
    }
  }

  const sent = await sendFinal(form, employees, signature.error ? null : signature, inspection, mechanicSignature);

  if (store) {
    const settle = sent.status === 200 ? store.finishDone(data.id) : store.releaseDone(data.id);
    await settle.catch((error) => console.error("[api] could not update submission:", error));
  }

  return sent;
}
