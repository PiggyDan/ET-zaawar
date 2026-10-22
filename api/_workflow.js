/**
 * The approval workflow.
 *
 * Workflow A — АТҮТ / Нийтийн тээвэр (no mechanic):
 *   travelers submit → the approver approves → one consolidated email.
 *
 * Workflow B — every other trip, and every Тэсэлгээний аялал. The mechanic
 * and the travelers fill in their forms in either order:
 *   - mechanic first: a passed inspection gets a 6-digit code, and the
 *     travelers submit with it;
 *   - travelers first: they submit without a code, typing the vehicle, and
 *     the request waits on /mechanic until a mechanic inspects it.
 * Only when both forms are in does the approver review it → one
 * consolidated email.
 *
 * The approver is Uyanga (APPROVER_1_*). Every configured approver must
 * approve, so adding APPROVER_2_* later makes it two, without code changes.
 *
 * Each request is a folder of write-once files (api/_store.js getRawStore):
 *
 *   wf/r/<id>/inspection.json      the mechanic's inspection (B only)
 *   wf/r/<id>/travel.json          the travelers' form
 *   wf/r/<id>/photos-<n>.json      the travelers' photos (named in travel.json;
 *                                  kept apart so lists stay small)
 *   wf/r/<id>/decision-<key>.json  one approver's approve / reject
 *   wf/r/<id>/sent.json            claim for the consolidated email
 *   wf/codes/<code>.json           mechanic code → request id
 *
 * The stage is worked out from which files exist, and a file can only be
 * written once, so a code cannot be used twice, an approver cannot decide
 * twice, and the email is claimed before it is sent so it goes out once.
 * Each file carries its time and author, which is the approval history.
 *
 * Files prefixed with "_" are not routed by Vercel.
 */

import { randomInt, randomUUID } from "crypto";
import {
  MECHANIC_PASS,
  TRIP_TYPES,
  inspectionHasCount,
  inspectionSheetFor,
  needsMechanic,
  validateInspection
} from "./_trips.js";
import {
  MAX_THUMB_BYTES,
  cleanInspection,
  deliver,
  directionOf,
  esc,
  listForMechanic,
  mailConfigError,
  parsePhotos,
  parseSignature,
  passwordMatches,
  recordSummary,
  secretMatches,
  sendFinal,
  summaryRows,
  titleOf,
  validate
} from "./_form-mail.js";
import { getRawStore } from "./_store.js";

/** A mechanic code is valid this long after the inspection. */
export const CODE_TTL_MS = 24 * 60 * 60 * 1000;


export const STAGES = {
  waitingTravel: "waiting_travel",
  waitingMechanic: "waiting_mechanic",
  codeExpired: "code_expired",
  failed: "inspection_failed",
  waitingApproval: "waiting_approval",
  rejected: "rejected",
  approved: "approved",
  sent: "sent"
};

const APPROVE = "approve";
const REJECT = "reject";

const paths = {
  inspection: (id) => `wf/r/${id}/inspection.json`,
  travel: (id) => `wf/r/${id}/travel.json`,
  decision: (id, key) => `wf/r/${id}/decision-${key}.json`,
  sent: (id) => `wf/r/${id}/sent.json`,
  code: (code) => `wf/codes/${code}.json`,
  photos: (id, name) => `wf/r/${id}/${name}`
};

/** A request's photos as data URLs ([] for requests from before photos). */
async function readPhotos(store, request) {
  const name = request.raw.travel?.photos;
  if (!name) return [];
  return (await store.read(paths.photos(request.id, name)).catch(() => null))?.photos || [];
}

const ok = (body) => ({ status: 200, body: { ok: true, ...body } });
const fail = (status, error) => ({ status, body: { error } });

const text = (value) => typeof value === "string" && value.trim() !== "";
const digits = (value) => typeof value === "string" && /^[0-9]+$/.test(value);
const vehicleValid = (value) => typeof value === "string" && /^\S[^\r\n]*, [0-9]{4} [А-ЯӨҮЁ]{3}$/u.test(value.trim());

/* ---------- Approvers ---------- */

/**
 * Approvers come from APPROVER_1_* (and optionally APPROVER_2_*): NAME,
 * EMAIL, PASSWORD. The key is the number, so renaming a person keeps history.
 */
export function approvers() {
  return [1, 2]
    .map((n) => ({
      key: String(n),
      name: (process.env[`APPROVER_${n}_NAME`] || "").trim(),
      email: (process.env[`APPROVER_${n}_EMAIL`] || "").trim(),
      password: process.env[`APPROVER_${n}_PASSWORD`] || ""
    }))
    .filter((approver) => approver.name && approver.password);
}

function approversError() {
  const list = approvers();
  if (list.length === 0) {
    return fail(500, "Батлагчийн тохиргоо дутуу байна (APPROVER_1_NAME, APPROVER_1_PASSWORD).");
  }
  const passwords = list.map((approver) => approver.password);
  if (new Set(passwords).size !== passwords.length || passwords.includes(process.env.MECHANIC_PASSWORD)) {
    return fail(500, "Батлагч бүр өөр нууц үгтэй байх ёстой (механикийн нууц үгээс ч өөр).");
  }
  return null;
}

const approverFor = (password) => approvers().find((approver) => secretMatches(password, approver.password)) || null;

/* ---------- Reading requests ---------- */

async function requireStore() {
  const store = await getRawStore();
  return store || null;
}

/** All requests, built from the stored files, newest first. */
async function loadRequests(store) {
  const files = await store.list("wf/r/");
  const byId = new Map();
  files.forEach(({ path, uploadedAt }) => {
    const [, , id, name] = path.split("/");
    if (!byId.has(id)) byId.set(id, new Map());
    byId.get(id).set(name, { path, uploadedAt });
  });

  const requests = await Promise.all(
    [...byId.entries()].map(async ([id, names]) => {
      const readIf = (name) => (names.has(name) ? store.read(names.get(name).path).catch(() => null) : null);
      const decisionNames = [...names.keys()].filter((name) => name.startsWith("decision-"));
      const [inspection, travel, sent, ...decisions] = await Promise.all([
        readIf("inspection.json"),
        readIf("travel.json"),
        readIf("sent.json"),
        ...decisionNames.map(readIf)
      ]);
      return describe(id, { inspection, travel, sent, decisions: decisions.filter(Boolean) });
    })
  );

  return requests.filter(Boolean).sort((a, b) => b.createdAt - a.createdAt);
}

/** The files of one request, read straight from storage. */
async function loadRequest(store, id) {
  if (!/^[0-9a-f-]{36}$/.test(id || "")) return null;
  const names = new Set((await store.list(`wf/r/${id}/`)).map(({ path }) => path.split("/")[3]));
  if (names.size === 0) return null;

  const readIf = (name) => (names.has(name) ? store.read(`wf/r/${id}/${name}`).catch(() => null) : null);
  const decisionNames = [...names].filter((name) => name.startsWith("decision-"));
  const [inspection, travel, sent, ...decisions] = await Promise.all([
    readIf("inspection.json"),
    readIf("travel.json"),
    readIf("sent.json"),
    ...decisionNames.map(readIf)
  ]);
  return describe(id, { inspection, travel, sent, decisions: decisions.filter(Boolean) });
}

/** Works out a request's stage and history from its files. */
export function describe(id, { inspection, travel, sent, decisions }, now = Date.now()) {
  if (!inspection && !travel) return null;

  const form = travel?.form;
  const tripType = inspection?.tripType || form?.tripType;
  const needsInspection = Boolean(inspection) || needsMechanic(form);
  const keys = approvers().map((approver) => approver.key);
  const approvals = decisions.filter((decision) => decision.decision === APPROVE);
  const rejection = decisions.find((decision) => decision.decision === REJECT);
  const allApproved = keys.length > 0 && keys.every((key) => approvals.some((a) => a.key === key));

  let stage;
  if (inspection && inspection.inspection.result !== MECHANIC_PASS) stage = STAGES.failed;
  else if (!travel) stage = now > inspection.expiresAt ? STAGES.codeExpired : STAGES.waitingTravel;
  else if (!inspection && needsInspection) stage = STAGES.waitingMechanic;
  else if (rejection) stage = STAGES.rejected;
  else if (sent) stage = STAGES.sent;
  else if (allApproved) stage = STAGES.approved;
  else stage = STAGES.waitingApproval;

  const history = [
    inspection && {
      at: inspection.createdAt,
      who: inspection.inspection.mechanic,
      what: `Механик үзлэг: ${inspection.inspection.result}`
    },
    travel && {
      at: travel.submittedAt,
      who: form.leader || travel.employees[0]?.name || "",
      what: "Аяллын хуудас илгээсэн"
    },
    ...decisions.map((decision) => ({
      at: decision.at,
      who: decision.name,
      what: decision.decision === APPROVE ? "Зөвшөөрсөн" : `Татгалзсан: ${decision.note}`
    })),
    sent && { at: sent.at, who: "", what: "Нэгдсэн имэйл илгээгдсэн" }
  ]
    .filter(Boolean)
    .sort((a, b) => a.at - b.at);

  return {
    id,
    workflow: needsInspection ? "B" : "A",
    tripType,
    stage,
    createdAt: inspection?.createdAt || travel?.submittedAt,
    code: inspection?.code || null,
    expiresAt: inspection?.expiresAt || null,
    summary: form
      ? recordSummary(form, travel.employees)
      : {
          tripType,
          vehicle: inspection.vehicle,
          driver: inspection.driver,
          date: "",
          direction: "",
          people: []
        },
    inspectionResult: inspection?.inspection.result || null,
    mechanic: inspection?.inspection.mechanic || null,
    decisions: decisions.map(({ key, name, decision, note, at }) => ({ key, name, decision, note, at })),
    history,
    // Kept for building the email; stripped before sending to the browser.
    raw: { inspection, travel }
  };
}

const forBrowser = ({ raw, ...request }) => request;

/* ---------- Emails ---------- */

/** Tells the approvers a request is waiting. Failure is logged, not fatal. */
async function alertApprovers(request, origin) {
  const to = approvers().map((approver) => approver.email).filter(Boolean);
  if (to.length === 0 || mailConfigError()) return;

  const { form, employees } = request.raw.travel;
  const link = `${origin}/approve#request=${request.id}`;
  const names = employees.map((employee) => employee.name).filter(Boolean).join(", ");
  const rows = [
    ...summaryRows(form).filter(([, value]) => value),
    ...(request.raw.inspection ? [["Механик үзлэг", `${request.inspectionResult} · ${request.mechanic}`]] : []),
    ["Зорчигчид", names]
  ];

  const html = `<!doctype html>
<html lang="mn">
  <body style="margin:0; padding:24px; background:#f3f4f6; font-family:Arial,Helvetica,sans-serif; color:#111827;">
    <div style="max-width:640px; margin:0 auto; background:#ffffff; border:1px solid #e5e7eb; border-radius:10px; padding:24px;">
      <div style="font-size:18px; font-weight:700; margin-bottom:8px;">Батлах хүсэлт ирлээ</div>
      <div style="font-size:14px; margin-bottom:16px;">${esc(titleOf(form))} таны баталгааг хүлээж байна. Батлагдсаны дараа нэгдсэн имэйл илгээгдэнэ.</div>
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse; width:100%; font-size:14px; margin-bottom:18px;">
        ${rows
          .map(
            ([label, value]) => `<tr>
          <td style="padding:6px 10px; background:#f9fafb; border:1px solid #e5e7eb; width:180px;">${esc(label)}</td>
          <td style="padding:6px 10px; border:1px solid #e5e7eb;">${esc(value)}</td>
        </tr>`
          )
          .join("")}
      </table>
      <a href="${esc(link)}" style="display:inline-block; padding:12px 20px; background:#1f8a43; color:#ffffff; text-decoration:none; font-weight:700; border-radius:8px;">Хүсэлтийг нээж батлах</a>
    </div>
  </body>
</html>`;

  try {
    await deliver({
      to,
      subject: `Батлах хүсэлт | ${form.tripType} | ${form.travelDate} | ${directionOf(form)} | ${names}`,
      html,
      text: [`Батлах хүсэлт: ${titleOf(form)}`, "", ...rows.map(([label, value]) => `${label}: ${value}`), "", link].join("\n"),
      images: []
    });
  } catch (error) {
    console.error("[workflow] could not alert approvers:", error);
  }
}

/**
 * Sends the consolidated email once: the "sent" file is claimed first, and
 * released only if delivery itself failed, so it can be retried.
 */
async function finalize(store, request) {
  const configError = mailConfigError();
  if (configError) return configError;

  const claimed = await store.putOnce(paths.sent(request.id), { at: Date.now() });
  if (!claimed) return ok({ stage: STAGES.sent, alreadySent: true });

  const { inspection, travel } = request.raw;
  const signature = parseSignature(travel.signature, { maxBytes: MAX_THUMB_BYTES });
  const mechanicSignature = inspection
    ? parseSignature(inspection.mechanicSignature, { name: "mekhanik-garyn-useg", maxBytes: MAX_THUMB_BYTES })
    : null;
  const approvals = request.decisions
    .filter((decision) => decision.decision === APPROVE)
    .sort((a, b) => a.at - b.at);
  const parsedPhotos = parsePhotos(await readPhotos(store, request));

  const sent = await sendFinal(
    travel.form,
    travel.employees,
    signature.error ? null : signature,
    inspection?.inspection,
    mechanicSignature && !mechanicSignature.error ? mechanicSignature : null,
    approvals,
    parsedPhotos.photos || []
  );

  // 502 means the email did not go out; anything else (such as a Drive
  // archive error) happens after delivery, so the claim must stay.
  if (sent.status === 502) {
    await store.remove([paths.sent(request.id)]).catch((error) => console.error("[workflow] could not release claim:", error));
    return sent;
  }
  if (sent.status !== 200) console.error("[workflow] sent, but:", sent.body);

  return ok({ stage: STAGES.sent });
}

/* ---------- Mechanic ---------- */

/** Saves a mechanic's inspection; a passed one gets a 6-digit code. */
async function inspect(store, payload) {
  const tripType = payload.tripType;
  if (!TRIP_TYPES.includes(tripType)) return fail(400, "Дутуу байна: Аяллын төрөл");

  const vehicle = `${String(payload.vehicleMake ?? "").trim()}, ${String(payload.vehiclePlate ?? "").trim()}`;
  const driver = String(payload.driver ?? "").trim();
  const driverPhone = String(payload.driverPhone ?? "");
  if (!vehicleValid(vehicle)) return fail(400, "Дутуу байна: Автомашины марк, улсын дугаар (9911 УБА)");
  if (!text(driver)) return fail(400, "Дутуу байна: Үзлэг хийсэн жолооч");
  if (!digits(driverPhone)) return fail(400, "Дутуу байна: Жолоочийн утасны дугаар");

  const sheetForm = { tripType, driver };
  const inspection = cleanInspection(sheetForm, payload.inspection);
  const missing = validateInspection(sheetForm, inspection);
  if (missing.length > 0) return fail(400, `Дутуу байна: ${missing[0]}`);

  const mechanicSignature = parseSignature(payload.signature, { maxBytes: MAX_THUMB_BYTES });
  if (mechanicSignature.error) return fail(400, mechanicSignature.error);

  const id = randomUUID();
  const createdAt = Date.now();
  const passed = inspection.result === MECHANIC_PASS;

  // Claim a free code first, so the inspection is saved with it.
  let code = null;
  if (passed) {
    for (let attempt = 0; attempt < 10 && !code; attempt++) {
      const candidate = String(randomInt(100000, 1000000));
      if (await store.putOnce(paths.code(candidate), { id, createdAt })) code = candidate;
    }
    if (!code) return fail(502, "Код үүсгэж чадсангүй. Дахин оролдоно уу.");
  }

  await store.putOnce(paths.inspection(id), {
    id,
    createdAt,
    expiresAt: createdAt + CODE_TTL_MS,
    tripType,
    vehicle,
    driver,
    driverPhone,
    code,
    inspection,
    mechanicSignature: payload.signature
  });

  return ok({ id, result: inspection.result, code, expiresAt: createdAt + CODE_TTL_MS });
}

/** The passed, unused, unexpired inspection a code points to, or an error. */
async function inspectionForCode(store, code) {
  if (!/^[0-9]{6}$/.test(code || "")) return { error: fail(400, "Механикийн код 6 оронтой тоо байна.") };

  // Fresh reads: a code typed just after the mechanic saved it must be found.
  const entry = await store.read(paths.code(code), { fresh: true });
  if (!entry) return { error: fail(404, "Ийм механикийн код олдсонгүй.") };

  const inspection = await store.read(paths.inspection(entry.id), { fresh: true });
  if (!inspection) return { error: fail(404, "Ийм механикийн код олдсонгүй.") };
  if (inspection.inspection.result !== MECHANIC_PASS) return { error: fail(409, "Энэ машин механикийн үзлэгт тэнцээгүй.") };
  if (Date.now() > inspection.expiresAt) return { error: fail(410, "Механикийн кодын хугацаа дууссан. Дахин үзлэг хийлгэнэ үү.") };
  if (await store.read(paths.travel(entry.id), { fresh: true })) {
    return { error: fail(409, "Энэ механикийн кодыг аль хэдийн ашигласан байна.") };
  }

  return { inspection };
}

/** What a traveler sees after entering a code. */
async function checkCode(store, payload) {
  const { inspection, error } = await inspectionForCode(store, String(payload.code ?? "").trim());
  if (error) return error;
  return ok({
    tripType: inspection.tripType,
    vehicle: inspection.vehicle,
    driver: inspection.driver,
    driverPhone: inspection.driverPhone,
    mechanic: inspection.inspection.mechanic,
    expiresAt: inspection.expiresAt
  });
}

/* ---------- Travelers ---------- */

/**
 * The travelers' form, for both workflows (POST /api/send). In workflow B,
 * with a mechanic code the inspected vehicle and driver replace whatever
 * the form had, so they always match the inspection; without one, the
 * request waits for a mechanic to inspect the vehicle the form names.
 */
export async function submitTravel(payload, { origin } = {}) {
  let form = payload?.form;
  const employees = Array.isArray(payload?.employees) ? payload.employees : [];
  if (!form || typeof form !== "object") return fail(400, "Маягтын мэдээлэл дутуу байна.");

  const store = await requireStore();
  if (!store) return fail(500, "Хадгалах сан (Vercel Blob) холбогдоогүй байна.");
  const setupError = approversError();
  if (setupError) return setupError;

  let id = randomUUID();
  const code = String(form.inspectionCode ?? "").trim();
  if (needsMechanic(form) && code) {
    const { inspection, error } = await inspectionForCode(store, code);
    if (error) return error;
    if (inspection.tripType !== form.tripType) {
      return fail(409, `Энэ механикийн код "${inspection.tripType}"-д зориулагдсан.`);
    }
    id = inspection.id;
    form = { ...form, vehicle: inspection.vehicle, driver: inspection.driver, driverPhone: inspection.driverPhone };
  }

  const missing = validate(form, employees);
  if (missing.length > 0) return fail(400, `Дутуу байна: ${missing[0]}`);

  const signature = parseSignature(payload?.signature);
  if (signature.error) return fail(400, signature.error);
  const thumb = parseSignature(payload?.signatureThumb, { maxBytes: MAX_THUMB_BYTES });
  if (thumb.error) return fail(400, thumb.error);
  const photos = parsePhotos(payload?.photos);
  if (photos.error) return fail(400, photos.error);

  // A fresh name, so a refused or retried submit never clashes with it.
  const photosName = `photos-${randomUUID()}.json`;
  await store.putOnce(paths.photos(id, photosName), { photos: payload.photos });

  // Write-once: a second form with the same code is refused here.
  const saved = await store.putOnce(paths.travel(id), {
    form,
    employees,
    signature: payload.signatureThumb,
    photos: photosName,
    photoCount: payload.photos.length,
    submittedAt: Date.now()
  });
  if (!saved) return fail(409, "Энэ механикийн кодыг аль хэдийн ашигласан байна.");

  // The approver hears about it once both forms are in.
  const request = await loadRequest(store, id);
  if (request.stage === STAGES.waitingApproval) await alertApprovers(request, origin);

  return ok({ id, stage: request.stage });
}

/** A request the travelers sent first, as the mechanic sees it. */
async function mechanicRequest(store, id) {
  const request = await loadRequest(store, id);
  const travel = request?.raw.travel;
  if (!travel || request.workflow !== "B") return fail(404, "Хүсэлт олдсонгүй.");

  const { inspection } = request.raw;
  return ok({
    title: titleOf(travel.form),
    rows: summaryRows(travel.form),
    sheet: inspectionSheetFor(travel.form),
    hasCount: inspectionHasCount(travel.form),
    employees: travel.employees,
    signature: travel.signature,
    done: inspection ? { mechanic: inspection.inspection.mechanic, at: inspection.createdAt, result: inspection.inspection.result } : null
  });
}

/**
 * The mechanic inspects a request the travelers sent first. Write-once, so
 * it can be inspected only once; then the approver is alerted.
 */
async function inspectRequest(store, payload, origin) {
  const request = await loadRequest(store, payload.id);
  if (!request?.raw.travel || request.workflow !== "B") return fail(404, "Хүсэлт олдсонгүй.");
  if (request.stage !== STAGES.waitingMechanic) return fail(409, "Энэ хүсэлтийг аль хэдийн шалгасан байна.");

  const { form } = request.raw.travel;
  const inspection = cleanInspection(form, payload.inspection);
  const missing = validateInspection(form, inspection);
  if (missing.length > 0) return fail(400, `Дутуу байна: ${missing[0]}`);

  const mechanicSignature = parseSignature(payload.signature, { maxBytes: MAX_THUMB_BYTES });
  if (mechanicSignature.error) return fail(400, mechanicSignature.error);

  const createdAt = Date.now();
  const saved = await store.putOnce(paths.inspection(request.id), {
    id: request.id,
    createdAt,
    expiresAt: createdAt,
    tripType: form.tripType,
    vehicle: form.vehicle,
    driver: form.driver,
    driverPhone: form.driverPhone,
    code: null,
    inspection,
    mechanicSignature: payload.signature
  });
  if (!saved) return fail(409, "Энэ хүсэлтийг аль хэдийн шалгасан байна.");

  const updated = await loadRequest(store, request.id);
  if (updated.stage === STAGES.waitingApproval) await alertApprovers(updated, origin);
  return ok({ stage: updated.stage, result: inspection.result });
}

/**
 * A form saved before this workflow, now inspected by a mechanic: it joins
 * the workflow at the approval stage rather than emailing straight away.
 */
export async function startFromLegacy({ id, form, employees, signature, inspection, mechanicSignature }, { origin } = {}) {
  const store = await requireStore();
  if (!store) return fail(500, "Хадгалах сан (Vercel Blob) холбогдоогүй байна.");
  const setupError = approversError();
  if (setupError) return setupError;

  const createdAt = Date.now();
  await store.putOnce(paths.inspection(id), {
    id,
    createdAt,
    expiresAt: createdAt,
    tripType: form.tripType,
    vehicle: form.vehicle,
    driver: form.driver,
    driverPhone: form.driverPhone,
    code: null,
    legacy: true,
    inspection,
    mechanicSignature
  });
  await store.putOnce(paths.travel(id), { form, employees, signature, submittedAt: createdAt });

  const request = await loadRequest(store, id);
  await alertApprovers(request, origin);
  return ok({ id, stage: STAGES.waitingApproval });
}

/* ---------- Approvers ---------- */

/** Full detail of one request, for the approval page. */
function requestDetail(request) {
  const { inspection, travel } = request.raw;
  const sheetForm = travel?.form || { tripType: request.tripType };

  return {
    ...forBrowser(request),
    title: travel ? titleOf(travel.form) : request.tripType,
    rows: travel ? summaryRows(travel.form) : [],
    employees: travel?.employees || [],
    signature: travel?.signature || null,
    inspection: inspection
      ? {
          ...inspection.inspection,
          vehicle: inspection.vehicle,
          driver: inspection.driver,
          at: inspection.createdAt,
          signature: inspection.mechanicSignature,
          hasCount: inspectionHasCount(sheetForm),
          sheet: inspectionSheetFor(sheetForm)
        }
      : null
  };
}

async function decide(store, approver, payload, origin) {
  const request = await loadRequest(store, payload.id);
  if (!request) return fail(404, "Хүсэлт олдсонгүй.");
  if (request.stage !== STAGES.waitingApproval) {
    return fail(409, "Энэ хүсэлт батлах шатанд байхгүй байна.");
  }

  const decision = payload.decision;
  const note = String(payload.note ?? "").trim();
  if (![APPROVE, REJECT].includes(decision)) return fail(400, "Шийдвэр буруу байна.");
  if (decision === REJECT && !note) return fail(400, "Дутуу байна: Татгалзсан шалтгаан");

  const saved = await store.putOnce(paths.decision(request.id, approver.key), {
    key: approver.key,
    name: approver.name,
    decision,
    note,
    at: Date.now()
  });
  if (!saved) return fail(409, "Та энэ хүсэлтэд аль хэдийн шийдвэр гаргасан байна.");

  const updated = await loadRequest(store, request.id);
  if (updated.stage === STAGES.approved) return finalize(store, updated);
  return ok({ stage: updated.stage });
}

/* ---------- Entry point ---------- */

/** POST /api/workflow. Every action but "code" needs a password. */
export async function handleWorkflow(payload, { origin } = {}) {
  const action = payload?.action;

  const store = await requireStore();
  if (!store) return fail(500, "Хадгалах сан (Vercel Blob) холбогдоогүй байна.");

  if (action === "code") return checkCode(store, payload);

  if (["inspect", "mechanicList", "mechanicRequest", "inspectRequest"].includes(action)) {
    if (!process.env.MECHANIC_PASSWORD) return fail(500, "MECHANIC_PASSWORD тохируулаагүй байна.");
    if (!passwordMatches(payload.password)) return fail(401, "Нууц үг буруу байна.");

    if (action === "inspect") return inspect(store, payload);
    if (action === "mechanicRequest") return mechanicRequest(store, payload.id);
    if (action === "inspectRequest") {
      const setupError = approversError();
      if (setupError) return setupError;
      return inspectRequest(store, payload, origin);
    }

    const requests = await loadRequests(store);
    const legacy = await listForMechanic(payload);
    return ok({
      inspections: requests.filter((request) => request.workflow === "B").map(forBrowser),
      legacy: legacy.status === 200 ? legacy.body.records.filter((record) => record.status !== "done") : []
    });
  }

  const setupError = approversError();
  if (setupError) return setupError;
  const approver = approverFor(payload.password);
  if (!approver) return fail(401, "Нууц үг буруу байна.");
  const me = { key: approver.key, name: approver.name };

  if (action === "approvals") {
    const requests = (await loadRequests(store)).filter((request) => request.raw.travel);
    return ok({ approver: me, requests: requests.map(forBrowser) });
  }

  if (action === "request") {
    const request = await loadRequest(store, payload.id);
    if (!request?.raw.travel) return fail(404, "Хүсэлт олдсонгүй.");
    return ok({ approver: me, request: { ...requestDetail(request), photos: await readPhotos(store, request) } });
  }

  if (action === "decide") return decide(store, approver, payload, origin);

  if (action === "resend") {
    const request = await loadRequest(store, payload.id);
    if (!request) return fail(404, "Хүсэлт олдсонгүй.");
    if (request.stage !== STAGES.approved) return fail(409, "Энэ хүсэлтийг илгээх боломжгүй байна.");
    return finalize(store, request);
  }

  return fail(400, "Үйлдэл буруу байна.");
}
