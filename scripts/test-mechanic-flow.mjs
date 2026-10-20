/**
 * End-to-end check of the mail routing, without sending real email:
 * messages land in a temporary outbox directory as .eml/.html files.
 *
 *   node scripts/test-mechanic-flow.mjs
 */

import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const outbox = mkdtempSync(path.join(tmpdir(), "mail-outbox-"));

Object.assign(process.env, {
  MAIL_OUTBOX_DIR: outbox,
  MAIL_TO: "final@example.test",
  MECHANIC_TO: "mechanic1@example.test, mechanic2@example.test",
  MECHANIC_LINK_SECRET: "test-secret-0123456789abcdef",
  MECHANIC_PASSWORD: "test-password",
  MECHANIC_STORE_FILE: path.join(outbox, "store", "submissions.json"),
  SMTP_HOST: "",
  RESEND_API_KEY: "",
  GOOGLE_CLIENT_ID: "",
  GOOGLE_CLIENT_SECRET: "",
  GOOGLE_REFRESH_TOKEN: "",
  GOOGLE_DRIVE_FOLDER_ID: ""
});

const { sendFormMail, handleMechanic, listForMechanic } = await import("../api/_form-mail.js");
const { BLAST_CHECKLIST, inspectionSheetFor } = await import("../api/_trips.js");

// A 1x1 white PNG stands in for both signatures.
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
  direction: "Улаанбаатар-Сайншанд",
  route: "Улаанбаатар - Чойр (амрах) - Сайншанд",
  transport,
  driver: "Дорж",
  driverPhone: "88112233",
  vehicle: "Toyota Land Cruiser, 1234 УБА",
  starlink: "Тийм",
  gps: "Тийм",
  approver: "Батбаяр",
  approverPosition: "Хэлтсийн дарга",
  instructor: "Ч.Бямбабат",
  instructorPosition: "ХАБЭА менежер",
  checklist: [],
  ...extra
});

const blast = {
  company: "ЭРХЭТ ТҮНШ ХХК",
  tripType: "Тэсэлгээний аялал",
  purpose: "Блок 3-ын тэсэлгээ",
  driverAck: "Тийм",
  vehicleOwner: "Компанийн үндсэн тээврийн хэрэгсэл",
  starlink: "Тийм",
  gps: "Тийм",
  blackBox: "Тийм",
  approver: "Э.Амарсайхан",
  approverPosition: "Тэсэлгээний инженер",
  travelDate: "2026-10-22",
  departTime: "08:30",
  routeFrom: "Агуулах",
  routeTo: "Блок 3",
  permitNo: "ТБ-2026/045",
  explosiveType: "Эмульс тэсрэх бодис",
  explosiveQty: "500",
  detonatorType: "",
  detonatorQty: "",
  driver: "Дорж",
  driverPhone: "88112233",
  vehicle: "Howo, 5566 ӨМА",
  escort: "Болд",
  escortPhone: "99001122",
  blaster: "Ганаа",
  blasterPhone: "99334455",
  checklist: BLAST_CHECKLIST
};

/** A complete inspection for the trip's sheet; `bad` item ids get "Хэвийн бус". */
function inspectionFor(form, extra = {}, bad = []) {
  const items = {};
  inspectionSheetFor(form).forEach(({ items: group }) =>
    group.forEach(({ id }) => {
      items[id] = { status: bad.includes(id) ? "Хэвийн бус" : "Хэвийн", count: "", note: bad.includes(id) ? "Элэгдсэн" : "" };
    })
  );
  return { odometer: "152340", motoHours: "", mechanic: "Ганбат", mechanicPhone: "95112233", result: "Тэнцсэн", note: "Хэвийн.", remarks: "", items, ...extra };
}

let seen = new Set();
/** Messages written to the outbox since the last call. */
function newMail() {
  const files = readdirSync(outbox).filter((f) => f.endsWith(".eml") && !seen.has(f)).sort();
  files.forEach((f) => seen.add(f));
  return files.map((f) => ({
    eml: readFileSync(path.join(outbox, f), "utf8"),
    html: readFileSync(path.join(outbox, f.replace(/\.eml$/, ".html")), "utf8")
  }));
}

const header = (eml, name) => new RegExp(`^${name}: (.*)$`, "mi").exec(eml)?.[1] ?? "";
const linkToken = (html) => /href="[^"]*#mechanic=([^"]+)"/.exec(html)?.[1];

const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push(["PASS", name]);
  } catch (error) {
    results.push(["FAIL", name, error.message]);
  }
}

await test("АТҮТ goes straight to the final recipients", async () => {
  const r = await sendFormMail(
    { form: travel("АТҮТ / Нийтийн тээвэр", { driver: "", driverPhone: "", vehicle: "", starlink: "", gps: "" }), employees, signature: PNG },
    { origin: ORIGIN }
  );
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.stage, "final");
  const mail = newMail();
  assert.equal(mail.length, 1);
  assert.match(header(mail[0].eml, "To"), /final@example\.test/);
  assert.doesNotMatch(mail[0].eml, /mechanic\d@example/);
  assert.equal(linkToken(mail[0].html), undefined, "final email must not carry a mechanic link");
});

let companyToken;
await test("Company vehicle goes to the mechanics with a link", async () => {
  const r = await sendFormMail(
    { form: travel("Байгууллагын унаагаар"), employees, signature: PNG, signatureThumb: PNG },
    { origin: ORIGIN }
  );
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.stage, "mechanic");
  const [mail, ...rest] = newMail();
  assert.equal(rest.length, 0);
  assert.match(header(mail.eml, "To"), /mechanic1@example\.test, mechanic2@example\.test/);
  assert.doesNotMatch(mail.eml, /final@example/, "final recipients must not get it yet");
  companyToken = linkToken(mail.html);
  assert.ok(companyToken, "mechanic email has a link");
  assert.ok(mail.html.includes(`${ORIGIN}/mechanic#mechanic=`));
});

await test("Other transports (Замын унаа, Хувийн, Гэрээт, Бусад) also go to the mechanics", async () => {
  for (const transport of ["Замын унаа", "Хувийн унаа", "Гэрээт компаний унаа", "Бусад"]) {
    const r = await sendFormMail(
      { form: travel(transport), employees, signature: PNG, signatureThumb: PNG },
      { origin: ORIGIN }
    );
    assert.equal(r.body.stage, "mechanic", `${transport}: ${JSON.stringify(r.body)}`);
  }
  assert.equal(newMail().length, 4);
});

await test("Mechanic page loads the submission from the link", async () => {
  const r = await handleMechanic({ token: companyToken });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.rows.some(([label, value]) => label === "Автомашин" && value === "Toyota Land Cruiser, 1234 УБА"));
  assert.equal(r.body.employees[0].name, "Бат-Эрдэнэ");
  assert.equal(r.body.signature, PNG);
  assert.equal(newMail().length, 0, "viewing sends nothing");
});

await test("Mechanic pass sends form + inspection to the final recipients", async () => {
  const r = await handleMechanic({
    token: companyToken,
    inspection: inspectionFor(travel("Байгууллагын унаагаар"), {}, ["1.5"]),
    signature: PNG
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.stage, "final");
  const [mail] = newMail();
  assert.match(header(mail.eml, "To"), /final@example\.test/);
  assert.doesNotMatch(header(mail.eml, "To"), /mechanic/);
  assert.match(mail.html, /Авто машин үзлэгийн хуудас/);
  assert.match(mail.html, /Хөл тормоз/);
  assert.match(mail.html, /Хэвийн бус — Элэгдсэн/);
  assert.match(mail.html, /152340/);
  assert.match(mail.html, /Ганзориг, Ахлах инженер/);
  assert.match(mail.html, /Ганбат/);
  assert.match(mail.html, /Toyota Land Cruiser, 1234 УБА/);
  assert.match(mail.html, /cid:signature/);
  assert.match(mail.html, /cid:mechanic-signature/);
  assert.equal((mail.eml.match(/Content-ID:/g) || []).length, 2, "both signatures attached");
  assert.equal(linkToken(mail.html), undefined);
});

await test("Blasting trip always goes to the mechanics, and a fail is reported", async () => {
  const r = await sendFormMail({ form: blast, employees, signature: PNG, signatureThumb: PNG }, { origin: ORIGIN });
  assert.equal(r.body.stage, "mechanic", JSON.stringify(r.body));
  const [mail] = newMail();
  assert.match(header(mail.eml, "To"), /mechanic1@example\.test/);
  const token = linkToken(mail.html);

  const done = await handleMechanic({
    token,
    inspection: (() => { const i = inspectionFor(blast, { result: "Тэнцээгүй", note: "Тоормосны дэвсгэр элэгдсэн" }); i.items["1.9"] = { status: "Хэвийн", count: "2", note: "" }; return i; })(),
    signature: PNG
  });
  assert.equal(done.status, 200, JSON.stringify(done.body));
  const [final] = newMail();
  assert.match(header(final.eml, "To"), /final@example\.test/);
  assert.match(final.html, /Тэнцээгүй/);
  assert.match(final.html, /Тоормосны дэвсгэр элэгдсэн/);
  assert.match(final.html, /Маяак/, "blasting sheet items");
  assert.match(final.html, /тоо: 2/, "blasting sheet count column");
  assert.match(final.html, /ТБ-2026\/045/);
});

await test("Tampered or forged links are rejected", async () => {
  const [body, mac] = companyToken.split(".");
  const flipped = body.slice(0, -2) + (body.at(-2) === "A" ? "B" : "A") + body.at(-1);
  for (const token of [`${flipped}.${mac}`, `${body}.${mac.slice(1)}x`, "garbage", "", undefined]) {
    const r = await handleMechanic({ token });
    assert.equal(r.status, 400, `token ${String(token).slice(0, 20)}`);
  }
  process.env.MECHANIC_LINK_SECRET = "a-different-secret-0123456789";
  assert.equal((await handleMechanic({ token: companyToken })).status, 400, "other secret");
  process.env.MECHANIC_LINK_SECRET = "test-secret-0123456789abcdef";
  assert.equal(newMail().length, 0);
});

await test("Incomplete inspections are rejected", async () => {
  // A fresh form: the one above was already checked, so it would get 409.
  await sendFormMail({ form: travel("Байгууллагын унаагаар"), employees, signature: PNG, signatureThumb: PNG }, { origin: ORIGIN });
  const freshToken = linkToken(newMail()[0].html);
  const base = inspectionFor(travel("Байгууллагын унаагаар"));
  const { ["3.2"]: _, ...missingItem } = base.items;
  const cases = [
    { ...base, mechanic: " " },
    { ...base, mechanicPhone: "abc" },
    { ...base, result: "Maybe" },
    { ...base, odometer: "" },
    { ...base, note: "" },
    { ...base, items: missingItem }
  ];
  for (const inspection of cases) {
    const r = await handleMechanic({ token: freshToken, inspection, signature: PNG });
    assert.equal(r.status, 400, JSON.stringify(inspection).slice(0, 120));
  }
  assert.equal((await handleMechanic({ token: freshToken, inspection: base })).status, 400, "no signature");
  assert.equal(newMail().length, 0);
});

await test("/mechanic lists submissions behind the password, and a checked form cannot be sent twice", async () => {
  assert.equal((await listForMechanic({ password: "wrong" })).status, 401);
  assert.equal((await listForMechanic({})).status, 401);

  const r = await sendFormMail({ form: travel("Хувийн унаа"), employees, signature: PNG, signatureThumb: PNG }, { origin: ORIGIN });
  assert.equal(r.body.stage, "mechanic");
  const [mail] = newMail();
  const token = linkToken(mail.html);
  assert.ok(mail.html.includes(`${ORIGIN}/mechanic#mechanic=`), "email links to the /mechanic page");

  const list = await listForMechanic({ password: "test-password" });
  assert.equal(list.status, 200, JSON.stringify(list.body));
  const record = list.body.records.find((item) => item.token === token);
  assert.ok(record, "new submission is listed");
  assert.equal(record.status, "pending");
  assert.equal(record.summary.vehicle, "Toyota Land Cruiser, 1234 УБА");
  assert.deepEqual(record.summary.people, ["Бат-Эрдэнэ"]);

  const submit = () => handleMechanic({ token, inspection: inspectionFor(travel("Хувийн унаа")), signature: PNG });
  assert.equal((await submit()).status, 200);
  assert.equal(newMail().length, 1);

  const after = (await listForMechanic({ password: "test-password" })).body.records.find((item) => item.token === token);
  assert.equal(after.status, "done");
  assert.equal(after.done.mechanic, "Ганбат");
  assert.equal(after.done.result, "Тэнцсэн");

  assert.equal((await handleMechanic({ token })).body.done.mechanic, "Ганбат", "view shows it was checked");
  assert.equal((await submit()).status, 409, "second submit refused");
  assert.equal(newMail().length, 0, "no second final email");
});

await test("If the final email fails, the form goes back to waiting", async () => {
  await sendFormMail({ form: travel("Замын унаа"), employees, signature: PNG, signatureThumb: PNG }, { origin: ORIGIN });
  const token = linkToken(newMail()[0].html);

  // An outbox path under a file cannot be created, so delivery fails.
  const saved = process.env.MAIL_OUTBOX_DIR;
  process.env.MAIL_OUTBOX_DIR = path.join(outbox, "store", "submissions.json", "nope");
  const failed = await handleMechanic({ token, inspection: inspectionFor(travel("Замын унаа")), signature: PNG });
  process.env.MAIL_OUTBOX_DIR = saved;
  assert.equal(failed.status, 502);

  const record = (await listForMechanic({ password: "test-password" })).body.records.find((item) => item.token === token);
  assert.equal(record.status, "pending", "claim released");
  assert.equal((await handleMechanic({ token, inspection: inspectionFor(travel("Замын унаа")), signature: PNG })).status, 200, "can retry");
  assert.equal(newMail().length, 1);
});

await test("New trip-sheet fields are required", async () => {
  for (const [form, field] of [
    [travel("Байгууллагын унаагаар", { leader: "" }), "leader"],
    [travel("Байгууллагын унаагаар", { route: "" }), "route"],
    [travel("Байгууллагын унаагаар", { starlink: "" }), "starlink"],
    [travel("Байгууллагын унаагаар", { returnDate: "2026-10-20" }), "return before start"],
    [travel("Байгууллагын унаагаар", { instructor: "" }), "instructor"],
    [{ ...blast, driverAck: "" }, "blast driverAck"],
    [{ ...blast, blackBox: "" }, "blast blackBox"],
    [{ ...blast, vehicleOwner: "" }, "blast vehicleOwner"]
  ]) {
    const r = await sendFormMail({ form, employees, signature: PNG, signatureThumb: PNG }, { origin: ORIGIN });
    assert.equal(r.status, 400, field);
  }
  assert.equal(newMail().length, 0);
});

await test("Mechanic route refuses to run without its configuration", async () => {
  const form = travel("Байгууллагын унаагаар");
  const saved = process.env.MECHANIC_TO;
  process.env.MECHANIC_TO = "";
  const r = await sendFormMail({ form, employees, signature: PNG, signatureThumb: PNG }, { origin: ORIGIN });
  process.env.MECHANIC_TO = saved;
  assert.equal(r.status, 500);
  const noThumb = await sendFormMail({ form, employees, signature: PNG }, { origin: ORIGIN });
  assert.equal(noThumb.status, 400);
  assert.equal(newMail().length, 0);
});

rmSync(outbox, { recursive: true, force: true });

for (const [status, name, detail] of results) {
  console.log(`${status}  ${name}${detail ? `\n      ${detail}` : ""}`);
}
const failed = results.filter(([status]) => status === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
