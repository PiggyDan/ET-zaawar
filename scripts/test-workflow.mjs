/**
 * End-to-end check of both workflows, without sending real email: messages
 * land in a temporary outbox directory as .eml/.html files, and storage is
 * a temporary folder.
 *
 *   node scripts/test-workflow.mjs
 */

import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const root = mkdtempSync(path.join(tmpdir(), "workflow-test-"));
const outbox = path.join(root, "outbox");

Object.assign(process.env, {
  MAIL_OUTBOX_DIR: outbox,
  MAIL_TO: "final@example.test",
  MECHANIC_LINK_SECRET: "test-secret-0123456789abcdef",
  MECHANIC_PASSWORD: "mechanic-pw",
  APPROVER_1_NAME: "Уянга",
  APPROVER_1_EMAIL: "uyanga@example.test",
  APPROVER_1_PASSWORD: "uyanga-pw",
  APPROVER_2_NAME: "Хоёрдугаар батлагч",
  APPROVER_2_EMAIL: "second@example.test",
  APPROVER_2_PASSWORD: "second-pw",
  MECHANIC_STORE_FILE: path.join(root, "legacy.json"),
  WORKFLOW_STORE_DIR: path.join(root, "workflow"),
  SMTP_HOST: "",
  RESEND_API_KEY: "",
  GOOGLE_CLIENT_ID: "",
  GOOGLE_CLIENT_SECRET: "",
  GOOGLE_REFRESH_TOKEN: "",
  GOOGLE_DRIVE_FOLDER_ID: "",
  BLOB_STORE_ID: "",
  BLOB_READ_WRITE_TOKEN: "",
  VERCEL: ""
});

const { handleWorkflow, submitTravel } = await import("../api/_workflow.js");
const { handleMechanic } = await import("../api/_form-mail.js");
const { signToken } = await import("../api/_link-token.js");
const { getStore } = await import("../api/_store.js");
const { BLAST_CHECKLIST, inspectionSheetFor } = await import("../api/_trips.js");

// A 1x1 white PNG stands in for every signature.
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=";
const ORIGIN = "https://et-zaawar.example";
const employees = [{ name: "Бат-Эрдэнэ", position: "Инженер", phone: "99112233" }];

const travel = (transport, extra = {}) => ({
  company: "ЭРХЭТ ТҮНШ ХХК",
  tripType: "Энгийн аялал",
  department: "IT",
  leader: "Ганзориг",
  leaderPosition: "Ахлах инженер",
  leaderPhone: "99001100",
  purpose: "Уурхайн ээлж",
  travelDate: "2026-10-21",
  departTime: "06:00",
  returnDate: "2026-10-22",
  returnTime: "18:00",
  direction: "Улаанбаатар - Сайншанд",
  route: "Улаанбаатар - Чойр (амрах) - Сайншанд",
  transport,
  driver: "Хэн нэгэн",
  driverPhone: "80000000",
  vehicle: "Өөр машин, 0000 ААА",
  starlink: "Тийм",
  gps: "Тийм",
  approver: "Батбаяр",
  approverPosition: "Хэлтсийн дарга",
  instructor: "Ч.Бямбабат",
  instructorPosition: "ХАБЭА менежер",
  checklist: [],
  ...extra
});

const atut = () => travel("АТҮТ / Нийтийн тээвэр", { driver: "", driverPhone: "", vehicle: "", starlink: "", gps: "" });

const blast = (extra = {}) => ({
  company: "ЭРХЭТ ТҮНШ ХХК",
  tripType: "Тэсэлгээний аялал",
  purpose: "Блок 3-ын тэсэлгээ",
  travelDate: "2026-10-22",
  departTime: "08:30",
  routeFrom: "Агуулах",
  routeTo: "Блок 3",
  permitNo: "ТБ-2026/045",
  explosiveType: "Эмульс тэсрэх бодис",
  explosiveQty: "500",
  detonatorType: "",
  detonatorQty: "",
  driverAck: "Тийм",
  vehicleOwner: "Компанийн үндсэн тээврийн хэрэгсэл",
  starlink: "Тийм",
  gps: "Тийм",
  blackBox: "Тийм",
  escort: "Болд",
  escortPhone: "99001122",
  blaster: "Ганаа",
  blasterPhone: "99334455",
  approver: "Э.Амарсайхан",
  approverPosition: "Тэсэлгээний инженер",
  checklist: BLAST_CHECKLIST,
  ...extra
});

/** A complete inspection for a trip type's sheet; `bad` item ids get "Хэвийн бус". */
function inspectionFor(tripType, extra = {}, bad = []) {
  const items = {};
  inspectionSheetFor({ tripType }).forEach(({ items: group }) =>
    group.forEach(({ id }) => {
      items[id] = { status: bad.includes(id) ? "Хэвийн бус" : "Хэвийн", count: "", note: bad.includes(id) ? "Элэгдсэн" : "" };
    })
  );
  return { odometer: "152340", motoHours: "", mechanic: "Ганбат", mechanicPhone: "95112233", result: "Тэнцсэн", note: "Хэвийн.", remarks: "", items, ...extra };
}

const wf = (payload) => handleWorkflow(payload, { origin: ORIGIN });
const submit = (form, extra = {}) => submitTravel({ form, employees, signature: PNG, signatureThumb: PNG, ...extra }, { origin: ORIGIN });
const inspect = (extra = {}) =>
  wf({
    action: "inspect",
    password: "mechanic-pw",
    tripType: "Энгийн аялал",
    vehicleMake: "Toyota Land Cruiser",
    vehiclePlate: "1234 УБА",
    driver: "Дорж",
    driverPhone: "88112233",
    inspection: inspectionFor(extra.tripType || "Энгийн аялал", {}, ["1.5"]),
    signature: PNG,
    ...extra
  });
const decide = (password, id, decision = "approve", note = "") => wf({ action: "decide", password, id, decision, note });
const stageOf = async (id) => (await wf({ action: "request", password: "uyanga-pw", id })).body.request?.stage;

let seen = new Set();
/** Messages written to the outbox since the last call. */
function newMail() {
  const files = readdirSync(outbox, { withFileTypes: true }).filter((f) => f.isFile() && f.name.endsWith(".eml") && !seen.has(f.name)).map((f) => f.name).sort();
  files.forEach((f) => seen.add(f));
  return files.map((f) => ({
    eml: readFileSync(path.join(outbox, f), "utf8").replace(/\r?\n[ \t]+/g, " "),
    html: readFileSync(path.join(outbox, f.replace(/\.eml$/, ".html")), "utf8")
  }));
}
const to = (mail) => /^To: (.*)$/mi.exec(mail.eml)?.[1] ?? "";
const finals = (mails) => mails.filter((mail) => to(mail).includes("final@example.test"));
const alerts = (mails) => mails.filter((mail) => to(mail).includes("uyanga@example.test"));

const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push(["PASS", name]);
  } catch (error) {
    results.push(["FAIL", name, error.message]);
  }
}

/* ---------- Workflow A: АТҮТ ---------- */

await test("A: АТҮТ needs no mechanic; travelers submit → approvers are alerted, no final email yet", async () => {
  const r = await submit(atut());
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.stage, "waiting_approval");
  const mail = newMail();
  assert.equal(finals(mail).length, 0, "no final email before approval");
  assert.equal(alerts(mail).length, 1, "one alert to both approvers");
  assert.match(to(alerts(mail)[0]), /second@example\.test/);
  assert.ok(alerts(mail)[0].html.includes(`${ORIGIN}/approve#request=${r.body.id}`), "alert links to the request");
});

await test("A: one approval is not enough; the second sends exactly one consolidated email", async () => {
  const { body } = await submit(atut());
  newMail();
  assert.equal((await decide("uyanga-pw", body.id)).body.stage, "waiting_approval");
  assert.equal(finals(newMail()).length, 0, "still waiting for the second approver");
  assert.equal((await decide("uyanga-pw", body.id)).status, 409, "same approver cannot approve twice");

  const second = await decide("second-pw", body.id);
  assert.equal(second.status, 200, JSON.stringify(second.body));
  assert.equal(second.body.stage, "sent");
  const [final, ...more] = finals(newMail());
  assert.equal(more.length, 0, "exactly one final email");
  assert.match(final.html, /Батлагдсан/);
  assert.match(final.html, /Уянга/);
  assert.match(final.html, /Хоёрдугаар батлагч/);
  assert.doesNotMatch(final.html, /Авто машин үзлэгийн хуудас/, "АТҮТ email has no inspection");
  assert.equal(await stageOf(body.id), "sent");

  assert.equal((await wf({ action: "resend", password: "uyanga-pw", id: body.id })).status, 409, "cannot resend a sent request");
  assert.equal(finals(newMail()).length, 0);
});

await test("A: a rejection stops the request, needs a reason, and sends nothing", async () => {
  const { body } = await submit(atut());
  newMail();
  assert.equal((await decide("second-pw", body.id, "reject", "")).status, 400, "reason required");
  assert.equal((await decide("second-pw", body.id, "reject", "Огноо буруу")).body.stage, "rejected");
  assert.equal((await decide("uyanga-pw", body.id)).status, 409, "no approving after rejection");
  assert.equal(finals(newMail()).length, 0);
  const history = (await wf({ action: "request", password: "uyanga-pw", id: body.id })).body.request.history;
  assert.ok(history.some((event) => event.what.includes("Огноо буруу")), "rejection reason in history");
});

await test("Both approvers approving at the same moment still send one email", async () => {
  const { body } = await submit(atut());
  newMail();
  const [a, b] = await Promise.all([decide("uyanga-pw", body.id), decide("second-pw", body.id)]);
  assert.equal(a.status, 200, JSON.stringify(a.body));
  assert.equal(b.status, 200, JSON.stringify(b.body));
  assert.equal(finals(newMail()).length, 1);
});

/* ---------- Workflow B: mechanic first ---------- */

let codeB;
await test("B: travelers cannot submit a non-АТҮТ trip without a mechanic code", async () => {
  const r = await submit(travel("Байгууллагын унаагаар"));
  assert.equal(r.status, 400);
  assert.match(r.body.error, /код/);
  for (const transport of ["Замын унаа", "Хувийн унаа", "Гэрээт компаний унаа", "Бусад"]) {
    assert.equal((await submit(travel(transport))).status, 400, transport);
  }
  assert.equal((await submit(blast())).status, 400, "blasting too");
  assert.equal(newMail().length, 0);
});

await test("B: a failed inspection gets no code", async () => {
  const r = await inspect({ inspection: inspectionFor("Энгийн аялал", { result: "Тэнцээгүй", note: "Тоормос муу" }) });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.code, null);
});

await test("B: a passed inspection gets a code; travelers see the inspected vehicle", async () => {
  const r = await inspect();
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.match(r.body.code, /^[0-9]{6}$/);
  codeB = r.body.code;
  const check = await wf({ action: "code", code: codeB });
  assert.equal(check.status, 200, JSON.stringify(check.body));
  assert.equal(check.body.vehicle, "Toyota Land Cruiser, 1234 УБА");
  assert.equal(check.body.driver, "Дорж");
  assert.equal((await wf({ action: "code", code: "000000" })).status, 404);
  assert.equal(newMail().length, 0, "the mechanic step sends no email");
});

await test("B: travelers submit with the code; vehicle and driver come from the inspection", async () => {
  const r = await submit(travel("Байгууллагын унаагаар", { inspectionCode: codeB }));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(alerts(newMail()).length, 1);
  const detail = (await wf({ action: "request", password: "second-pw", id: r.body.id })).body.request;
  assert.equal(detail.workflow, "B");
  assert.ok(detail.rows.some(([label, value]) => label === "Автомашин" && value === "Toyota Land Cruiser, 1234 УБА"));
  assert.ok(detail.rows.some(([label, value]) => label === "Жолооч" && value === "Дорж"));
  assert.equal(detail.inspection.result, "Тэнцсэн");

  assert.equal((await submit(travel("Байгууллагын унаагаар", { inspectionCode: codeB }))).status, 409, "a code works once");
  assert.equal((await wf({ action: "code", code: codeB })).status, 409);

  await decide("uyanga-pw", r.body.id);
  await decide("second-pw", r.body.id);
  const [final, ...more] = finals(newMail());
  assert.equal(more.length, 0);
  assert.match(final.html, /Авто машин үзлэгийн хуудас/);
  assert.match(final.html, /Хэвийн бус — Элэгдсэн/);
  assert.match(final.html, /Ганбат/);
  assert.match(final.html, /Батлагдсан/);
  assert.equal((final.eml.match(/Content-ID:/g) || []).length, 2, "traveler and mechanic signatures");
});

await test("B: a blasting code only fits a blasting trip, and uses the blasting sheet", async () => {
  const r = await inspect({ tripType: "Тэсэлгээний аялал", vehiclePlate: "5566 ӨМА", inspection: inspectionFor("Тэсэлгээний аялал") });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await submit(travel("Байгууллагын унаагаар", { inspectionCode: r.body.code }))).status, 409, "wrong trip type");
  const ok = await submit(blast({ inspectionCode: r.body.code }));
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  newMail();
  await decide("uyanga-pw", ok.body.id);
  await decide("second-pw", ok.body.id);
  const [final] = finals(newMail());
  assert.match(final.html, /Маяак/, "blasting sheet items");
  assert.match(final.html, /ТБ-2026\/045/);
});

await test("B: an expired code is refused", async () => {
  const r = await inspect();
  const file = path.join(process.env.WORKFLOW_STORE_DIR, "wf", "r", r.body.id, "inspection.json");
  const saved = JSON.parse(readFileSync(file, "utf8"));
  writeFileSync(file, JSON.stringify({ ...saved, expiresAt: Date.now() - 1 }));
  assert.equal((await wf({ action: "code", code: r.body.code })).status, 410);
  assert.equal((await submit(travel("Байгууллагын унаагаар", { inspectionCode: r.body.code }))).status, 410);
  const listed = (await wf({ action: "mechanicList", password: "mechanic-pw" })).body.inspections.find((item) => item.id === r.body.id);
  assert.equal(listed.stage, "code_expired");
});

/* ---------- Stage and access rules ---------- */

await test("Stages cannot be skipped; each role needs its own password", async () => {
  const r = await inspect();
  assert.equal((await decide("uyanga-pw", r.body.id)).status, 409, "no approving before travelers submit");
  assert.equal((await wf({ action: "approvals", password: "uyanga-pw" })).body.requests.some((item) => item.id === r.body.id), false);
  assert.equal((await wf({ action: "resend", password: "uyanga-pw", id: r.body.id })).status, 409);

  assert.equal((await wf({ action: "approvals", password: "mechanic-pw" })).status, 401, "mechanic cannot approve");
  assert.equal((await inspect({ password: "uyanga-pw" })).status, 401, "approver cannot inspect");
  assert.equal((await wf({ action: "approvals", password: "nope" })).status, 401);
  assert.equal((await wf({ action: "mechanicList", password: "nope" })).status, 401);
  assert.equal((await wf({ action: "request", password: "uyanga-pw", id: "../../etc" })).status, 404, "ids are checked");
});

await test("Inspection and travel forms are validated", async () => {
  assert.equal((await inspect({ vehiclePlate: "1234" })).status, 400);
  assert.equal((await inspect({ driver: "" })).status, 400);
  assert.equal((await inspect({ inspection: inspectionFor("Энгийн аялал", { odometer: "" }) })).status, 400);
  assert.equal((await inspect({ signature: "" })).status, 400);
  assert.equal((await submit(atut(), { signatureThumb: undefined })).status, 400);
  assert.equal((await submit({ ...atut(), leader: "" })).status, 400);
  assert.equal(newMail().length, 0);
});

/* ---------- Failure handling ---------- */

await test("If the final email fails, it can be sent again, and only once", async () => {
  const { body } = await submit(atut());
  newMail();
  await decide("uyanga-pw", body.id);

  // An outbox path under a file cannot be created, so delivery fails.
  const saved = process.env.MAIL_OUTBOX_DIR;
  process.env.MAIL_OUTBOX_DIR = path.join(root, "legacy.json", "nope");
  writeFileSync(path.join(root, "legacy.json"), "{}");
  const failed = await decide("second-pw", body.id);
  process.env.MAIL_OUTBOX_DIR = saved;
  assert.equal(failed.status, 502);
  assert.equal(await stageOf(body.id), "approved", "approved but not sent");

  const retry = await wf({ action: "resend", password: "second-pw", id: body.id });
  assert.equal(retry.status, 200, JSON.stringify(retry.body));
  assert.equal(finals(newMail()).length, 1);
  assert.equal((await wf({ action: "resend", password: "second-pw", id: body.id })).status, 409);
});

await test("Without email settings, travelers can still submit; approval waits for email to work", async () => {
  const saved = process.env.MAIL_OUTBOX_DIR;
  delete process.env.MAIL_OUTBOX_DIR;
  try {
    const { status, body } = await submit(atut());
    assert.equal(status, 200, "traveler submit does not need email settings");
    await decide("uyanga-pw", body.id);
    assert.equal((await decide("second-pw", body.id)).status, 500);
    assert.equal(await stageOf(body.id), "approved");
  } finally {
    process.env.MAIL_OUTBOX_DIR = saved;
  }
});

await test("Without two approvers configured, nothing can be submitted", async () => {
  const saved = process.env.APPROVER_2_PASSWORD;
  delete process.env.APPROVER_2_PASSWORD;
  const r = await submit(atut());
  process.env.APPROVER_2_PASSWORD = saved;
  assert.equal(r.status, 500);
  process.env.APPROVER_2_PASSWORD = process.env.APPROVER_1_PASSWORD;
  const same = await submit(atut());
  process.env.APPROVER_2_PASSWORD = saved;
  assert.equal(same.status, 500, "approvers need different passwords");
  assert.equal(newMail().length, 0);
});

/* ---------- Forms saved before the workflow ---------- */

await test("An old waiting form, once inspected, goes to approval instead of straight out", async () => {
  const store = await getStore();
  const id = "11111111-2222-3333-4444-555555555555";
  const form = travel("Замын унаа", { vehicle: "Toyota Land Cruiser, 1234 УБА", driver: "Дорж", driverPhone: "88112233" });
  const token = signToken({ id, form, employees, signature: PNG });
  await store.savePending({ id, token, createdAt: Date.now(), status: "pending", summary: { vehicle: form.vehicle, people: [] } });

  const listed = (await wf({ action: "mechanicList", password: "mechanic-pw" })).body.legacy;
  assert.ok(listed.some((record) => record.id === id), "old form still listed for the mechanic");

  const r = await handleMechanic({ token, inspection: inspectionFor("Энгийн аялал"), signature: PNG }, { origin: ORIGIN });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const mail = newMail();
  assert.equal(finals(mail).length, 0, "no direct email");
  assert.equal(alerts(mail).length, 1, "approvers alerted");
  assert.equal((await handleMechanic({ token, inspection: inspectionFor("Энгийн аялал"), signature: PNG })).status, 409);

  await decide("uyanga-pw", id);
  await decide("second-pw", id);
  assert.equal(finals(newMail()).length, 1);
});

rmSync(root, { recursive: true, force: true });

for (const [status, name, detail] of results) {
  console.log(`${status}  ${name}${detail ? `\n      ${detail}` : ""}`);
}
const failed = results.filter(([status]) => status === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
