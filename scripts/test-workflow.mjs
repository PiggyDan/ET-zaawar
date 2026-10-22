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
  APPROVER_2_NAME: "",
  APPROVER_2_EMAIL: "",
  APPROVER_2_PASSWORD: "",
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
// The main employee fills in everything; other passengers only name and phone.
const employees = [
  { name: "Бат-Эрдэнэ", position: "Инженер", phone: "99112233" },
  { name: "Сараа", position: "", phone: "99445566" }
];

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
const PHOTOS = [PNG, PNG];
const submit = (form, extra = {}) =>
  submitTravel({ form, employees, signature: PNG, signatureThumb: PNG, photos: PHOTOS, ...extra }, { origin: ORIGIN });
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

await test("A: АТҮТ needs no mechanic; travelers submit → Uyanga is alerted, no final email yet", async () => {
  const r = await submit(atut());
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.stage, "waiting_approval");
  const mail = newMail();
  assert.equal(finals(mail).length, 0, "no final email before approval");
  assert.equal(alerts(mail).length, 1, "one alert to Uyanga");
  assert.ok(alerts(mail)[0].html.includes(`${ORIGIN}/approve#request=${r.body.id}`), "alert links to the request");
});

await test("A: Uyanga's approval sends exactly one consolidated email", async () => {
  const { body } = await submit(atut());
  newMail();
  const approved = await decide("uyanga-pw", body.id);
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  assert.equal(approved.body.stage, "sent");
  const [final, ...more] = finals(newMail());
  assert.equal(more.length, 0, "exactly one final email");
  assert.match(final.html, /Батлагдсан/);
  assert.match(final.html, /Уянга/);
  assert.doesNotMatch(final.html, /Авто машин үзлэгийн хуудас/, "АТҮТ email has no inspection");
  assert.equal(await stageOf(body.id), "sent");

  assert.equal((await decide("uyanga-pw", body.id)).status, 409, "cannot approve twice");
  assert.equal((await wf({ action: "resend", password: "uyanga-pw", id: body.id })).status, 409, "cannot resend a sent request");
  assert.equal(finals(newMail()).length, 0);
});

await test("A: a rejection stops the request, needs a reason, and sends nothing", async () => {
  const { body } = await submit(atut());
  newMail();
  assert.equal((await decide("uyanga-pw", body.id, "reject", "")).status, 400, "reason required");
  assert.equal((await decide("uyanga-pw", body.id, "reject", "Огноо буруу")).body.stage, "rejected");
  assert.equal((await decide("uyanga-pw", body.id)).status, 409, "no approving after rejection");
  assert.equal(finals(newMail()).length, 0);
  const history = (await wf({ action: "request", password: "uyanga-pw", id: body.id })).body.request.history;
  assert.ok(history.some((event) => event.what.includes("Огноо буруу")), "rejection reason in history");
});

await test("Approving twice at the same moment (double click) sends one email", async () => {
  const { body } = await submit(atut());
  newMail();
  const results = await Promise.all([decide("uyanga-pw", body.id), decide("uyanga-pw", body.id)]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  assert.equal(finals(newMail()).length, 1);
});

await test("If a second approver is configured, both must approve", async () => {
  Object.assign(process.env, { APPROVER_2_NAME: "Хоёр дахь", APPROVER_2_EMAIL: "second@example.test", APPROVER_2_PASSWORD: "second-pw" });
  try {
    const { body } = await submit(atut());
    assert.match(to(alerts(newMail())[0]), /second@example.test/, "both alerted");
    assert.equal((await decide("uyanga-pw", body.id)).body.stage, "waiting_approval");
    assert.equal(finals(newMail()).length, 0, "one approval is not enough");
    assert.equal((await decide("second-pw", body.id)).body.stage, "sent");
    assert.equal(finals(newMail()).length, 1);
  } finally {
    Object.assign(process.env, { APPROVER_2_NAME: "", APPROVER_2_EMAIL: "", APPROVER_2_PASSWORD: "" });
  }
});

await test("Photos: at least 2, at most 8, images only; shown to the approver and in the final email", async () => {
  assert.equal((await submit(atut(), { photos: [PNG] })).status, 400, "one photo is not enough");
  assert.equal((await submit(atut(), { photos: undefined })).status, 400, "photos are required");
  assert.equal((await submit(atut(), { photos: Array(9).fill(PNG) })).status, 400, "at most 8");
  assert.equal((await submit(atut(), { photos: [PNG, "data:text/plain;base64,aGk="] })).status, 400, "images only");
  assert.equal(newMail().length, 0, "nothing is sent for a refused form");

  const { body } = await submit(atut(), { photos: [PNG, PNG, PNG] });
  newMail();
  const detail = (await wf({ action: "request", password: "uyanga-pw", id: body.id })).body.request;
  assert.equal(detail.photos.length, 3, "approver sees the photos");
  assert.equal(detail.signature, PNG, "approver sees the signature");

  await decide("uyanga-pw", body.id);
  const [final] = finals(newMail());
  assert.ok(final.html.includes("Зураг (3)"));
  assert.match(final.html, /cid:photo-3/);
  assert.equal((final.eml.match(/Content-ID:/g) || []).length, 4, "signature and 3 photos attached");
});

await test("Passengers: the main employee fills in everything, others only name and phone", async () => {
  const only = (list) => submitTravel({ form: atut(), employees: list, signature: PNG, signatureThumb: PNG, photos: PHOTOS }, { origin: ORIGIN });
  assert.equal((await only([{ name: "Бат", position: "", phone: "99112233" }])).status, 400, "main employee needs a position");
  assert.equal((await only([employees[0], { name: "Сараа", position: "", phone: "" }])).status, 400, "others need a phone");
  assert.equal((await only([employees[0], { name: "", position: "", phone: "99445566" }])).status, 400, "others need a name");
  const ok = await only([employees[0], { name: "Сараа", phone: "99445566" }, { name: "Дулмаа", phone: "88001122" }]);
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  newMail();
  await decide("uyanga-pw", ok.body.id);
  const [final] = finals(newMail());
  assert.match(final.html, /Үндсэн ажилтан/);
  assert.ok(final.html.includes("Бусад зорчигчид (2)"));
  assert.ok(final.html.includes("3. Дулмаа"));
});

await test("Normal trips no longer ask who approved (only who instructed); blasting still does", async () => {
  const r = await submit({ ...atut(), approver: "", approverPosition: "" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await submit({ ...atut(), instructor: "" })).status, 400, "instructor still required");
  assert.equal((await submit(blast({ approver: "", vehicle: "Howo, 7777 ӨМА", driver: "Дорж", driverPhone: "88112233" }))).status, 400, "blasting keeps its approver");
  newMail();
});

await test("Without an approver email, nobody is alerted, but approval and the final email still work", async () => {
  const saved = process.env.APPROVER_1_EMAIL;
  process.env.APPROVER_1_EMAIL = "";
  try {
    const many = [employees[0], ...Array.from({ length: 49 }, (_, i) => ({ name: `Зорчигч ${i + 2}`, phone: "99000000" }))];
    const { status, body } = await submitTravel({ form: atut(), employees: many, signature: PNG, signatureThumb: PNG, photos: PHOTOS }, { origin: ORIGIN });
    assert.equal(status, 200, "50 passengers accepted");
    assert.equal(newMail().length, 0, "no alert email");
    await decide("uyanga-pw", body.id);
    assert.equal(finals(newMail()).length, 1);
  } finally {
    process.env.APPROVER_1_EMAIL = saved;
  }
});

/* ---------- Workflow B: mechanic first ---------- */

let codeB;
const inspectRequest = (id, extra = {}) =>
  wf({ action: "inspectRequest", password: "mechanic-pw", id, inspection: inspectionFor("Энгийн аялал", {}, ["1.5"]), signature: PNG, ...extra });

await test("B, travelers first: without a code the request waits for the mechanic, not the approver", async () => {
  for (const transport of ["Байгууллагын унаагаар", "Замын унаа", "Хувийн унаа", "Гэрээт компаний унаа", "Бусад"]) {
    const r = await submit(travel(transport, { vehicle: "Toyota Prado, 5555 УНА", driver: "Батаа", driverPhone: "88110000" }));
    assert.equal(r.status, 200, `${transport}: ${JSON.stringify(r.body)}`);
    assert.equal(r.body.stage, "waiting_mechanic");
    assert.equal((await decide("uyanga-pw", r.body.id)).status, 409, "approver cannot review before the mechanic");
  }
  const blastFirst = await submit(blast({ vehicle: "Howo, 7777 ӨМА", driver: "Дорж", driverPhone: "88112233" }));
  assert.equal(blastFirst.body.stage, "waiting_mechanic", "blasting too");
  assert.equal(newMail().length, 0, "no alert until both forms are in");

  assert.equal((await submit(travel("Байгууллагын унаагаар", { vehicle: "" }))).status, 400, "the vehicle is required without a code");
  assert.equal((await submit(travel("Байгууллагын унаагаар", { inspectionCode: "123" }))).status, 400, "a bad code is still refused");
});

await test("B, travelers first: the mechanic inspects it once, then the approver reviews and the email goes out", async () => {
  const { body } = await submit(travel("Байгууллагын унаагаар", { vehicle: "Toyota Prado, 5555 УНА", driver: "Батаа", driverPhone: "88110000" }));

  const listed = (await wf({ action: "mechanicList", password: "mechanic-pw" })).body.inspections.find((item) => item.id === body.id);
  assert.equal(listed.stage, "waiting_mechanic", "listed for the mechanic");
  const view = await wf({ action: "mechanicRequest", password: "mechanic-pw", id: body.id });
  assert.equal(view.status, 200, JSON.stringify(view.body));
  assert.ok(view.body.rows.some(([label, value]) => label === "Автомашин" && value === "Toyota Prado, 5555 УНА"));
  assert.equal(view.body.done, null);
  assert.equal((await wf({ action: "mechanicRequest", password: "uyanga-pw", id: body.id })).status, 401, "mechanic password needed");

  assert.equal((await inspectRequest(body.id, { inspection: inspectionFor("Энгийн аялал", { odometer: "" }) })).status, 400);
  const inspected = await inspectRequest(body.id);
  assert.equal(inspected.status, 200, JSON.stringify(inspected.body));
  assert.equal(inspected.body.stage, "waiting_approval");
  assert.equal(alerts(newMail()).length, 1, "approver alerted once both forms are in");
  assert.equal((await inspectRequest(body.id)).status, 409, "inspected only once");
  assert.ok((await wf({ action: "mechanicRequest", password: "mechanic-pw", id: body.id })).body.done);

  await decide("uyanga-pw", body.id);
  const [final, ...more] = finals(newMail());
  assert.equal(more.length, 0);
  assert.match(final.html, /Авто машин үзлэгийн хуудас/);
  assert.match(final.html, /Toyota Prado, 5555 УНА/);
  assert.match(final.html, /Хэвийн бус — Элэгдсэн/);
});

await test("B, travelers first: a failed inspection stops the request", async () => {
  const { body } = await submit(travel("Замын унаа", { vehicle: "Toyota Prado, 5555 УНА", driver: "Батаа", driverPhone: "88110000" }));
  const r = await inspectRequest(body.id, { inspection: inspectionFor("Энгийн аялал", { result: "Тэнцээгүй", note: "Тоормос муу" }) });
  assert.equal(r.body.stage, "inspection_failed");
  assert.equal((await decide("uyanga-pw", body.id)).status, 409);
  assert.equal(newMail().length, 0);
});

await test("АТҮТ never waits for a mechanic, and cannot be inspected", async () => {
  const { body } = await submit(atut());
  assert.equal(body.stage, "waiting_approval");
  assert.equal((await inspectRequest(body.id)).status, 404);
  newMail();
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
  const detail = (await wf({ action: "request", password: "uyanga-pw", id: r.body.id })).body.request;
  assert.equal(detail.workflow, "B");
  assert.ok(detail.rows.some(([label, value]) => label === "Автомашин" && value === "Toyota Land Cruiser, 1234 УБА"));
  assert.ok(detail.rows.some(([label, value]) => label === "Жолооч" && value === "Дорж"));
  assert.equal(detail.inspection.result, "Тэнцсэн");

  assert.equal((await submit(travel("Байгууллагын унаагаар", { inspectionCode: codeB }))).status, 409, "a code works once");
  assert.equal((await wf({ action: "code", code: codeB })).status, 409);

  await decide("uyanga-pw", r.body.id);
  const [final, ...more] = finals(newMail());
  assert.equal(more.length, 0);
  assert.match(final.html, /Авто машин үзлэгийн хуудас/);
  assert.match(final.html, /Хэвийн бус — Элэгдсэн/);
  assert.match(final.html, /Ганбат/);
  assert.match(final.html, /Батлагдсан/);
  assert.equal((final.eml.match(/Content-ID:/g) || []).length, 4, "traveler and mechanic signatures, and 2 photos");
});

await test("B: a blasting code only fits a blasting trip, and uses the blasting sheet", async () => {
  const r = await inspect({ tripType: "Тэсэлгээний аялал", vehiclePlate: "5566 ӨМА", inspection: inspectionFor("Тэсэлгээний аялал") });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await submit(travel("Байгууллагын унаагаар", { inspectionCode: r.body.code }))).status, 409, "wrong trip type");
  const ok = await submit(blast({ inspectionCode: r.body.code }));
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  newMail();
  await decide("uyanga-pw", ok.body.id);
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

  // An outbox path under a file cannot be created, so delivery fails.
  const saved = process.env.MAIL_OUTBOX_DIR;
  process.env.MAIL_OUTBOX_DIR = path.join(root, "legacy.json", "nope");
  writeFileSync(path.join(root, "legacy.json"), "{}");
  const failed = await decide("uyanga-pw", body.id);
  process.env.MAIL_OUTBOX_DIR = saved;
  assert.equal(failed.status, 502);
  assert.equal(await stageOf(body.id), "approved", "approved but not sent");

  const retry = await wf({ action: "resend", password: "uyanga-pw", id: body.id });
  assert.equal(retry.status, 200, JSON.stringify(retry.body));
  assert.equal(finals(newMail()).length, 1);
  assert.equal((await wf({ action: "resend", password: "uyanga-pw", id: body.id })).status, 409);
});

await test("Without email settings, travelers can still submit; approval waits for email to work", async () => {
  const saved = process.env.MAIL_OUTBOX_DIR;
  delete process.env.MAIL_OUTBOX_DIR;
  try {
    const { status, body } = await submit(atut());
    assert.equal(status, 200, "traveler submit does not need email settings");
    assert.equal((await decide("uyanga-pw", body.id)).status, 500);
    assert.equal(await stageOf(body.id), "approved");
  } finally {
    process.env.MAIL_OUTBOX_DIR = saved;
  }
});

await test("Without an approver configured, nothing can be submitted", async () => {
  const saved = process.env.APPROVER_1_PASSWORD;
  delete process.env.APPROVER_1_PASSWORD;
  const r = await submit(atut());
  process.env.APPROVER_1_PASSWORD = "mechanic-pw";
  const same = await submit(atut());
  process.env.APPROVER_1_PASSWORD = saved;
  assert.equal(r.status, 500);
  assert.equal(same.status, 500, "approver password must differ from the mechanic's");
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
  assert.equal(finals(newMail()).length, 1);
});

rmSync(root, { recursive: true, force: true });

for (const [status, name, detail] of results) {
  console.log(`${status}  ${name}${detail ? `\n      ${detail}` : ""}`);
}
const failed = results.filter(([status]) => status === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
