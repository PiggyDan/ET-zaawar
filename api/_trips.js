/**
 * Trip types ("Энгийн аялал" and the explosives-transport "Тэсэлгээний
 * аялал"), their fields, and the mechanic's vehicle inspection sheets.
 * Imported by both the browser forms and the send logic, so labels and
 * validation stay identical on both sides.
 *
 * The fields follow the "Аяллын хуудас" (Холын аяллын журам, Хавсралт №1,
 * and the explosives-transport журам's first page); the inspection sheets
 * follow their "Авто машин үзлэгийн хуудас".
 *
 * Files prefixed with "_" are not routed by Vercel.
 */

export const NORMAL_TRIP = "Энгийн аялал";
export const BLAST_TRIP = "Тэсэлгээний аялал";
export const TRIP_TYPES = [NORMAL_TRIP, BLAST_TRIP];

/** Public transport has no vehicle to inspect, so it skips the mechanic. */
export const PUBLIC_TRANSPORT = "АТҮТ / Нийтийн тээвэр";

export const YES = "Тийм";
export const NO = "Үгүй";
export const YES_NO = [YES, NO];

export const VEHICLE_OWNERS = [
  "Компанийн үндсэн тээврийн хэрэгсэл",
  "Гэрээ компанийн тээврийн хэрэгсэл"
];

/**
 * Whether a submission goes to the mechanic first. Only public-transport
 * trips go straight to the final recipients; every other trip, and every
 * blasting trip, waits for the mechanic's inspection.
 */
export const needsMechanic = (form) =>
  form.tripType === BLAST_TRIP || form.transport !== PUBLIC_TRANSPORT;

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
  return form.tripType === BLAST_TRIP ? BLAST_CHECKLIST : [];
}

/** Whether every item of the trip's checklist is in form.checklist. */
export function checklistComplete(form) {
  const checked = Array.isArray(form.checklist) ? form.checklist : [];
  return checklistFor(form).every((item) => checked.includes(item));
}

const text = (value) => typeof value === "string" && value.trim() !== "";
const digits = (value) => typeof value === "string" && /^[0-9]+$/.test(value);
const vehicleValid = (value) =>
  typeof value === "string" && /^\S[^\r\n]*, [0-9]{4} [А-ЯӨҮЁ]{3}$/u.test(value.trim());

const when = (date, time) => [date, time].filter(Boolean).join(" ");

/** Label/value rows describing a normal-trip submission, in display order. */
export function travelRows(form) {
  const hasVehicle = form.transport !== PUBLIC_TRANSPORT;

  return [
    ["Компани", form.company],
    ["Харьяалагдах хэлтэс", form.department],
    ["Аяллын ахлагч", [form.leader, form.leaderPosition].filter(Boolean).join(", ")],
    ["Ахлагчийн утас", form.leaderPhone],
    ["Аяллын зорилго", form.purpose],
    ["Аялал эхлэх", when(form.travelDate, form.departTime)],
    ["Аялал дуусах", when(form.returnDate, form.returnTime)],
    ["Аялах чиглэл", form.direction === "Бусад" ? form.otherDirection : form.direction],
    ["Аяллын маршрут", form.route],
    ["Тээврийн хэрэгсэл", form.transport],
    ...(hasVehicle
      ? [
          ["Жолооч", form.driver],
          ["Жолоочийн утасны дугаар", form.driverPhone],
          ["Автомашин", form.vehicle],
          ["Starlink хэвийн эсэх", form.starlink],
          ["GPS хэвийн эсэх", form.gps]
        ]
      : []),
    ["Зөвшөөрсөн", [form.approver, form.approverPosition].filter(Boolean).join(", ")],
    ["Зааварчилгаа өгсөн", [form.instructor, form.instructorPosition].filter(Boolean).join(", ")]
  ];
}

/** Returns the label of each missing or malformed normal-trip field. */
export function validateTravel(form) {
  const missing = [];

  if (!text(form.department)) missing.push("Харьяалагдах хэлтэс");
  if (!text(form.leader)) missing.push("Аяллын ахлагчийн нэр");
  if (!text(form.leaderPosition)) missing.push("Аяллын ахлагчийн албан тушаал");
  if (!digits(form.leaderPhone)) missing.push("Аяллын ахлагчийн утас");
  if (!text(form.purpose)) missing.push("Аяллын зорилго");
  if (!form.travelDate) missing.push("Аялал эхлэх огноо");
  if (!form.departTime) missing.push("Аялал эхлэх цаг");
  if (!form.returnDate) missing.push("Аялал дуусах огноо");
  if (!form.returnTime) missing.push("Аялал дуусах цаг");
  if (form.travelDate && form.returnDate && form.returnDate < form.travelDate) {
    missing.push("Аялал дуусах огноо эхлэх огнооноос өмнө байна");
  }
  if (!text(form.direction)) missing.push("Аялах чиглэл");
  if (form.direction === "Бусад" && !text(form.otherDirection)) missing.push("Бусад явах чиглэл");
  if (!text(form.route)) missing.push("Аяллын маршрут");
  if (!text(form.transport)) missing.push("Аялах тээврийн хэрэгсэл");

  if (form.transport !== PUBLIC_TRANSPORT) {
    if (!text(form.driver)) missing.push("Жолоочийн нэр");
    if (!digits(form.driverPhone)) missing.push("Жолоочийн утасны дугаар");
    if (!vehicleValid(form.vehicle)) missing.push("Автомашины марк, улсын дугаар (9911 УБА)");
    if (!YES_NO.includes(form.starlink)) missing.push("Starlink хэвийн эсэх");
    if (!YES_NO.includes(form.gps)) missing.push("GPS хэвийн эсэх");
  }

  if (!text(form.approver)) missing.push("Зөвшөөрсөн албан тушаалтны нэр");
  if (!text(form.approverPosition)) missing.push("Зөвшөөрсөн албан тушаалтны албан тушаал");
  if (!text(form.instructor)) missing.push("Зааварчилгаа өгсөн албан тушаалтны нэр");
  if (!text(form.instructorPosition)) missing.push("Зааварчилгаа өгсөн албан тушаалтны албан тушаал");

  return missing;
}

/** Label/value rows describing a blasting-trip submission, in display order. */
export function blastRows(form) {
  return [
    ["Компани", form.company],
    ["Аяллын төрөл", BLAST_TRIP],
    ["Аяллын зорилго", form.purpose],
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
    ["Жолооч зааварчилгаатай танилцсан", form.driverAck],
    ["Автомашин", form.vehicle],
    ["Тээврийн хэрэгслийн харьяалал", form.vehicleOwner],
    ["Starlink хэвийн эсэх", form.starlink],
    ["GPS хэвийн эсэх", form.gps],
    ["Хар хайрцаг хэвийн эсэх", form.blackBox],
    ["Дагалдан хамгаалагч", form.escort],
    ["Хамгаалагчийн утас", form.escortPhone],
    ["Хариуцсан тэсэлгээчин", form.blaster],
    ["Тэсэлгээчний утас", form.blasterPhone],
    ["Аялал хийх зөвшөөрөл", [form.approver, form.approverPosition].filter(Boolean).join(", ")]
  ];
}

/** Returns the label of each missing or malformed blasting-trip field. */
export function validateBlast(form) {
  const missing = [];

  if (!text(form.purpose)) missing.push("Аяллын зорилго");
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
  if (form.driverAck !== YES) missing.push("Жолооч зааварчилгаатай танилцсан");
  if (!vehicleValid(form.vehicle)) missing.push("Автомашины марк, улсын дугаар (9911 УБА)");
  if (!VEHICLE_OWNERS.includes(form.vehicleOwner)) missing.push("Тээврийн хэрэгслийн харьяалал");
  if (!YES_NO.includes(form.starlink)) missing.push("Starlink хэвийн эсэх");
  if (!YES_NO.includes(form.gps)) missing.push("GPS хэвийн эсэх");
  if (!YES_NO.includes(form.blackBox)) missing.push("Хар хайрцаг хэвийн эсэх");
  if (!text(form.escort)) missing.push("Дагалдан хамгаалагч");
  if (!digits(form.escortPhone)) missing.push("Хамгаалагчийн утас");
  if (!text(form.blaster)) missing.push("Хариуцсан тэсэлгээчин");
  if (!digits(form.blasterPhone)) missing.push("Тэсэлгээчний утас");
  if (!text(form.approver)) missing.push("Зөвшөөрсөн албан тушаалтны нэр");
  if (!text(form.approverPosition)) missing.push("Зөвшөөрсөн албан тушаалтны албан тушаал");

  return missing;
}

/* ---------- Mechanic's vehicle inspection ---------- */

export const MECHANIC_PASS = "Тэнцсэн";
export const MECHANIC_FAIL = "Тэнцээгүй";
export const MECHANIC_RESULTS = [MECHANIC_PASS, MECHANIC_FAIL];

export const ITEM_OK = "Хэвийн";
export const ITEM_BAD = "Хэвийн бус";
export const ITEM_STATUSES = [ITEM_OK, ITEM_BAD];

/** "Авто машин үзлэгийн хуудас", Холын аяллын журам Хавсралт №4. */
const TRAVEL_INSPECTION = [
  ["Техникийн гадаад байдал", ["Будаг ба сэв", "Толь ба шил", "Хаалга бариул", "Хойд, урд гэрлүүд", "Дохионы, оврын гэрлүүд", "Дугуй, обуд"]],
  ["Тоноглолын ажиллагаа", ["Дугуйн болт, чангалгаа", "Дуут дохио", "Аваарын гэрэл", "Их гэрэл", "Оврын гэрэл", "Хөл тормоз", "Зогсоолын тормоз", "Шил арчигч", "Шил арчигчны шингэн", "GPS /байрлал, хурд хэмжигч/", "Хөдөлгөөнт интернет Starlink"]],
  ["Техникийн ажиллагаа", ["Хөдөлгүүрийн ажиллагаа", "Дискен холбоо", "Хурдны хайрцаг", "Туслах хурдны хайрцаг", "Хойд, урд тэнхлэг", "Амартизатор", "Нум", "Хийн систем"]],
  ["Салон", ["Суудал", "Суудалын даруулга", "Суудалын тохиргоо", "Шил өргүүр", "Дотор толь", "Хаалганы түгжээ"]],
  ["Цахилгаан тоноглолын ажиллагаа", ["Хянах самбар", "Салоны гэрэлтүүлэг", "Гал хамгаалагчууд", "А/С, Паар", "Аккумлятор", "Түлшний заагч", "КМ-н заагч", "GPS-н заагч"]],
  ["Шингэний хэмжээ түвшин", ["Түлшний хэмжээ", "Хөдөлгүүрийн тос", "Хөргөлтийн шингэн", "Үндсэн, туслах кроп", "Хойд, урд тэнхлэг", "Гидрийн систем", "Түлшний дадчик"]],
  ["Дагалдах хэрэгсэл", ["Багаж түлхүүр", "Домкрат", "Дугуйн дорцов", "Нөөц дугуй", "Эмийн сан", "Галын хор", "Зогсоолын тэмдэг", "Ивүүр", "Дугуй хийлэгч", "Татлага", "ОБ үед хэрэглэх хайрцаг"]],
  ["Бичиг баримт", ["Т/Х-ийн гэрчилгээ"]]
];

/** "Авто машин үзлэгийн хуудас" of the explosives-transport журам. */
const BLAST_INSPECTION = [
  ["Техникийн гадаад байдал", ["Будаг ба сэв", "Толь ба шил", "Хаалга бариул", "Хойд, урд гэрлүүд", "Дохионы, оврын гэрлүүд", "Дугуй, обуд"]],
  ["Тоноглолын ажиллагаа", ["Машины бүрэн ажиллагаа", "Дуут дохио", "Аваарын гэрэл", "Их гэрэл", "Оврын гэрэл", "Хөл тормоз", "Зогсоолын тормоз", "Шил арчигч", "Кондейшн", "Туг", "Маяак"]],
  ["Техникийн ажиллагаа", ["Хөдөлгүүрийн ажиллагаа", "Дискен холбоо", "Хурдны хайрцаг", "Туслах хурдны хайрцаг", "Хойд, урд тэнхлэг", "Амартизатор", "Нум", "Хийн систем"]],
  ["Салон", ["Суудал", "Суудалын даруулга", "Суудалын тохиргоо", "Шил өргүүр", "Дотор толь", "Хаалганы түгжээ"]],
  ["Цахилгаан тоноглолын ажиллагаа", ["Хянах самбар", "Салоны гэрэлтүүлэг", "Гал хамгаалагчууд", "Хөгжим", "Аккумлятор", "Түлшний заагч", "КМ-н заагч", "GPS-н заагч"]],
  ["Шингэний хэмжээ түвшин", ["Түлшний хэмжээ", "Хөдөлгүүрийн тос", "Хөргөлтийн шингэн", "Үндсэн, туслах кроп", "Хойд, урд тэнхлэг", "Гидрийн систем", "Түлшний дадчик"]],
  ["Дагалдах хэрэгсэл", ["Багаж түлхүүр", "Домкрат", "Дугуйн дорцов", "Запас дугуй", "Эмийн сан", "Галын хор", "Зогсоолын тэмдэг", "Ивүүр", "Суудлын бүрээс"]],
  ["Бичиг баримт", ["Т/Х-ийн гэрчилгээ", "Татварын гэрчилгээ", "Даатгалын гэрчилгээ"]]
];

/**
 * Whether the trip's inspection sheet has a "Тоо" (count) column, as the
 * explosives-transport one does.
 */
export const inspectionHasCount = (form) => form.tripType === BLAST_TRIP;

/**
 * The inspection sheet for a trip, as groups of { id, label } items. Ids are
 * positional ("2.5"), since some labels repeat across groups.
 */
export function inspectionSheetFor(form) {
  const sheet = form.tripType === BLAST_TRIP ? BLAST_INSPECTION : TRAVEL_INSPECTION;

  return sheet.map(([title, items], group) => ({
    title,
    items: items.map((label, index) => ({ id: `${group}.${index}`, label }))
  }));
}

/** Returns the label of each missing field in a mechanic's inspection. */
export function validateInspection(form, inspection) {
  const missing = [];
  const items = inspection?.items && typeof inspection.items === "object" ? inspection.items : {};

  if (!digits(inspection?.odometer)) missing.push("Одометрийн заалт (км)");
  if (inspection?.motoHours && !/^[0-9]+([.,][0-9]+)?$/.test(inspection.motoHours)) missing.push("Мото цаг");

  inspectionSheetFor(form).forEach(({ title, items: groupItems }) => {
    groupItems.forEach(({ id, label }) => {
      if (!ITEM_STATUSES.includes(items[id]?.status)) missing.push(`${title} - ${label}`);
      if (items[id]?.count && !digits(items[id].count)) missing.push(`${title} - ${label} (тоо)`);
    });
  });

  if (!text(inspection?.mechanic)) missing.push("Хянасан механикийн нэр");
  if (!digits(inspection?.mechanicPhone)) missing.push("Механикийн утасны дугаар");
  if (!MECHANIC_RESULTS.includes(inspection?.result)) missing.push("Тэнцсэн / Тэнцээгүй");
  if (!text(inspection?.note)) missing.push("Механик дүгнэлт");

  return missing;
}
