/**
 * Trip types ("Энгийн аялал" and the explosives-transport "Тэсэлгээний
 * аялал") and their pre-trip checklists. Imported by both the browser form
 * and the send logic, so the checklists and labels stay identical on both
 * sides.
 *
 * Files prefixed with "_" are not routed by Vercel.
 */

export const NORMAL_TRIP = "Энгийн аялал";
export const BLAST_TRIP = "Тэсэлгээний аялал";
export const TRIP_TYPES = [NORMAL_TRIP, BLAST_TRIP];

/** The only transport option that gets the vehicle checklist. */
export const COMPANY_VEHICLE = "Байгууллагын унаагаар";

export const VEHICLE_CHECKLIST = [
  "Тоормос, жолооны механизм хэвийн ажиллаж байна.",
  "Дугуйн хээ, даралт хэвийн, нөөц дугуйтай.",
  "Гэрэл, дохио, шил арчигч ажиллаж байна.",
  "Бүх суудал суудлын бүстэй, бүс ажиллагаатай.",
  "Анхны тусламжийн цүнх, гал унтраагуур, анхааруулах тэмдэгтэй.",
  "Шатахуун, тос, хөргөлтийн шингэн хангалттай.",
  "Жолооны үнэмлэх, гэрчилгээ, даатгал, техникийн үзлэг хүчинтэй."
];

export const BLAST_CHECKLIST = [
  "Тээврийн хэрэгсэл \"ТЭСРЭХ АЮУЛТАЙ\" тэмдэг, улаан тугтай.",
  "Гал унтраагуур 2-оос доошгүй, ашиглах боломжтой.",
  "Тэсрэх бодис болон тэслэгчийг тусад нь, бэхэлж ачсан.",
  "Тээврийн хэрэгслийн техникийн үзлэг хийгдсэн, гэмтэлгүй.",
  "Холбооны хэрэгсэл (радио, утас) ажиллагаатай.",
  "Тэсрэх бодис тээвэрлэх зөвшөөрөл, бичиг баримт бүрэн."
];

/** The checklist that must be fully ticked before this trip can be submitted. */
export function checklistFor(form) {
  if (form.tripType === BLAST_TRIP) return BLAST_CHECKLIST;
  if (form.transport === COMPANY_VEHICLE) return VEHICLE_CHECKLIST;
  return [];
}

/** Whether every item of the trip's checklist is in form.checklist. */
export function checklistComplete(form) {
  const checked = Array.isArray(form.checklist) ? form.checklist : [];
  return checklistFor(form).every((item) => checked.includes(item));
}

/** Label/value rows describing a blasting-trip submission, in display order. */
export function blastRows(form) {
  return [
    ["Компани", form.company],
    ["Аяллын төрөл", BLAST_TRIP],
    ["Тээвэрлэх өдөр", form.travelDate],
    ["Гарах цаг", form.departTime],
    ["Хаанаас", form.routeFrom],
    ["Хаашаа", form.routeTo],
    ["Зөвшөөрлийн дугаар", form.permitNo],
    ["Тэсрэх бодисын төрөл", form.explosiveType],
    ["Тэсрэх бодисын хэмжээ (кг)", form.explosiveQty],
    ["Тэслэгчийн төрөл", form.detonatorType],
    ["Тэслэгчийн тоо (ш)", form.detonatorQty],
    ["Жолооч", form.driver],
    ["Жолоочийн утасны дугаар", form.driverPhone],
    ["Автомашин", form.vehicle],
    ["Дагалдан хамгаалагч", form.escort],
    ["Хамгаалагчийн утас", form.escortPhone],
    ["Хариуцсан тэсэлгээчин", form.blaster],
    ["Тэсэлгээчний утас", form.blasterPhone]
  ];
}

/** Returns the label of each missing or malformed blasting-trip field. */
export function validateBlast(form) {
  const missing = [];
  const text = (value) => typeof value === "string" && value.trim() !== "";
  const digits = (value) => typeof value === "string" && /^[0-9]+$/.test(value);

  if (!form.travelDate) missing.push("Тээвэрлэх өдөр");
  if (!form.departTime) missing.push("Гарах цаг");
  if (!text(form.routeFrom)) missing.push("Хаанаас");
  if (!text(form.routeTo)) missing.push("Хаашаа");
  if (!text(form.permitNo)) missing.push("Зөвшөөрлийн дугаар");
  if (!text(form.explosiveType)) missing.push("Тэсрэх бодисын төрөл");
  if (!/^[0-9]+([.,][0-9]+)?$/.test(form.explosiveQty || "")) missing.push("Тэсрэх бодисын хэмжээ (кг)");
  if (form.detonatorQty && !digits(form.detonatorQty)) missing.push("Тэслэгчийн тоо (ш)");
  if (!text(form.driver)) missing.push("Жолоочийн нэр");
  if (!digits(form.driverPhone)) missing.push("Жолоочийн утасны дугаар");
  if (typeof form.vehicle !== "string" || !/^\S[^\r\n]*, [0-9]{4} [А-ЯӨҮЁ]{3}$/u.test(form.vehicle.trim())) {
    missing.push("Автомашины марк, улсын дугаар (9911 УБА)");
  }
  if (!text(form.escort)) missing.push("Дагалдан хамгаалагч");
  if (!digits(form.escortPhone)) missing.push("Хамгаалагчийн утас");
  if (!text(form.blaster)) missing.push("Хариуцсан тэсэлгээчин");
  if (!digits(form.blasterPhone)) missing.push("Тэсэлгээчний утас");

  return missing;
}
