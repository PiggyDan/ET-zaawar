import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertTriangle,
  BadgeCheck,
  Bomb,
  CalendarClock,
  Car,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileText,
  Info,
  ListChecks,
  Plus,
  RotateCcw,
  Send,
  ShieldCheck,
  Trash2,
  Camera,
  UserRound,
  Users
} from "lucide-react";
import "./styles.css";
import SafetyReader from "./SafetyReader";
import MechanicForm, { NewInspection, isNewInspection, mechanicRequestId, mechanicToken } from "./MechanicForm";
import MechanicInbox from "./MechanicInbox";
import ApprovalPage from "./ApprovalPage";
import { AppBar, ChoiceField, Field, PhotoPicker, Section, SignaturePad, scaleDataUrl } from "./ui";
import {
  BLAST_TRIP,
  NORMAL_TRIP,
  PUBLIC_TRANSPORT,
  TRIP_TYPES,
  VEHICLE_OWNERS,
  YES,
  YES_NO,
  checklistFor,
  validateBlast,
  validateTravel
} from "../api/_trips.js";

const emptyEmployee = () => ({ name: "", position: "", phone: "" });

/** Passenger rows on the Аяллын хуудас; the blasting team stays small. */
const MAX_PASSENGERS = { [NORMAL_TRIP]: 18, [BLAST_TRIP]: 4 };

/** Photos of the group / vehicle the travelers attach. */
const MIN_PHOTOS = 2;
const MAX_PHOTOS = 8;

// Read in "Зааварчилгаа PDF унших". Each annex file's Аяллын хуудас (page 1)
// is replaced by the web form, and its Авто машин үзлэгийн хуудас (travel
// page 5, blasting page 2) by the mechanic's form, so both are left out.
const TRAVEL_DOCUMENTS = [{ file: "travel-annexes.pdf", from: 2, to: 4 }];
const BLAST_DOCUMENTS = [{ file: "blasting-annexes.pdf", from: 3 }];

/** "Аялах чиглэл" choices, outbound then return; "Бусад" is added after. */
const DIRECTION_GROUPS = [
  ["Явах", [
    "Улаанбаатар - Цогтцэций",
    "Улаанбаатар - Баянхонгор",
    "Улаанбаатар - Хотгор",
    "Улаанбаатар - Говь-Алтай",
    "Улаанбаатар - Зээгт",
    "Улаанбаатар - Даланзадгад",
    "Улаанбаатар - Эс Жи Эс",
    "Улаанбаатар - Сайншанд",
    "Улаанбаатар - Чойр",
    "Улаанбаатар - Шанжин",
    "Улаанбаатар - Засагчандмань",
    "Улаанбаатар - Замын-Үүд",
    "Улаанбаатар - Шарын гол",
    "Хотгор - Зээгт",
    "Улаанбаатар - Гурвантэс",
    "Эс Жи Эс - Цогтцэций",
    "Засагчандмань - Сайншанд"
  ]],
  ["Буцах", [
    "Цогтцэций - Улаанбаатар",
    "Баянхонгор - Улаанбаатар",
    "Хотгор - Улаанбаатар",
    "Говь-Алтай - Улаанбаатар",
    "Зээгт - Улаанбаатар",
    "Даланзадгад - Улаанбаатар",
    "Эс Жи Эс - Улаанбаатар",
    "Сайншанд - Улаанбаатар",
    "Чойр - Улаанбаатар",
    "Шанжин - Улаанбаатар",
    "Засагчандмань - Улаанбаатар",
    "Замын-Үүд - Улаанбаатар",
    "Шарын гол - Улаанбаатар",
    "Зээгт - Хотгор",
    "Гурвантэс - Улаанбаатар",
    "Цогтцэций - Эс Жи Эс",
    "Сайншанд - Засагчандмань"
  ]]
];

const companyOptions = [
  { value: "ЭРХЭТ ТҮНШ ХХК" },
  { value: "Хонгор Алтайн Тал ХХК" },
  { value: "Форчо Майнинг Экуйпмент Сервис ХХК" },
  { value: "Эйч Эйч Ай ХХК" },
  { value: "Хишиг Арвин Индустриал ХХК" },
  { value: "Бусад ХХК" }
];

const initialForm = (tripType = NORMAL_TRIP, company = companyOptions[0].value) => ({
  company,
  tripType,
  department: "",
  leader: "",
  leaderPosition: "",
  leaderPhone: "",
  purpose: "",
  travelDate: "",
  departTime: "",
  returnDate: "",
  returnTime: "",
  direction: "",
  otherDirection: "",
  route: "",
  transport: "Байгууллагын унаагаар",
  driver: "",
  driverPhone: "",
  driverAck: "",
  vehicle: "",
  vehiclePlate: "",
  vehicleOwner: "",
  starlink: "",
  gps: "",
  blackBox: "",
  approver: "",
  approverPosition: "",
  instructor: "",
  instructorPosition: "",
  routeFrom: "",
  routeTo: "",
  permitNo: "",
  explosiveType: "",
  explosiveQty: "",
  detonatorType: "",
  detonatorQty: "",
  escort: "",
  escortPhone: "",
  blaster: "",
  blasterPhone: ""
});

const digitsOnly = (value) => value.replace(/[^0-9]/g, "");

function App() {
  const [employees, setEmployees] = useState([emptyEmployee()]);
  const [showSafety, setShowSafety] = useState(false);
  const [showReader, setShowReader] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [signature, setSignature] = useState("");
  const [photos, setPhotos] = useState([]);
  const [sending, setSending] = useState(false);

  const [form, setForm] = useState(initialForm);
  const [checklist, setChecklist] = useState([]);
  // Workflow B: the mechanic's code, and the inspected vehicle it unlocks.
  const [codeInput, setCodeInput] = useState("");
  const [codeInfo, setCodeInfo] = useState(null);
  const [checkingCode, setCheckingCode] = useState(false);

  const isBlast = form.tripType === BLAST_TRIP;
  const isPublicTransport = !isBlast && form.transport === PUBLIC_TRANSPORT;
  const activeChecklist = checklistFor(form);
  const maxPassengers = MAX_PASSENGERS[form.tripType];

  const updateForm = (e) =>
    setForm({ ...form, [e.target.name]: e.target.value });

  const updateDigits = (e) =>
    setForm({ ...form, [e.target.name]: digitsOnly(e.target.value) });

  const setField = (name, value) => setForm({ ...form, [name]: value });

  // Switching between the travel and blasting forms starts the new form
  // fresh, so fields from the other form are never submitted.
  const changeTripType = (tripType) => {
    setForm(initialForm(tripType, form.company));
    setEmployees(employees.slice(0, MAX_PASSENGERS[tripType]));
    setChecklist([]);
    setAccepted(false);
    setShowSafety(false);
    setCodeInput("");
    setCodeInfo(null);
  };

  const checkCode = async () => {
    if (checkingCode) return;
    setCheckingCode(true);
    try {
      const response = await fetch("/api/workflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "code", code: codeInput })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Кодыг шалгаж чадсангүй.");
      if (data.tripType !== form.tripType) throw new Error(`Энэ механикийн код "${data.tripType}"-д зориулагдсан.`);
      setCodeInfo({ ...data, code: codeInput });
    } catch (error) {
      setCodeInfo(null);
      alert(error.message);
    } finally {
      setCheckingCode(false);
    }
  };

  const toggleCheck = (item) =>
    setChecklist(
      checklist.includes(item)
        ? checklist.filter((checked) => checked !== item)
        : [...checklist, item]
    );

  const updateEmployee = (index, key, value) => {
    const next = [...employees];
    next[index] = { ...next[index], [key]: value };
    setEmployees(next);
  };

  const addEmployee = () => {
    if (employees.length < maxPassengers) {
      setEmployees([...employees, emptyEmployee()]);
    }
  };

  const removeEmployee = (index) => {
    if (employees.length === 1) return;
    setEmployees(employees.filter((_, i) => i !== index));
  };

  /**
   * The form as the server expects it. With a mechanic code, the vehicle
   * and driver are the inspected ones (the server enforces that too);
   * without one, they are as typed and a mechanic inspects them later.
   */
  const payloadForm = () => ({
    ...form,
    inspectionCode: isPublicTransport ? "" : codeInfo?.code || "",
    driver: isPublicTransport ? "" : codeInfo ? codeInfo.driver : form.driver,
    driverPhone: isPublicTransport ? "" : codeInfo ? codeInfo.driverPhone : form.driverPhone,
    vehicle: isPublicTransport ? "" : codeInfo ? codeInfo.vehicle : `${form.vehicle.trim()}, ${form.vehiclePlate.trim()}`,
    vehiclePlate: isPublicTransport || codeInfo ? "" : form.vehiclePlate,
    starlink: isPublicTransport ? "" : form.starlink,
    gps: isPublicTransport ? "" : form.gps,
    checklist: activeChecklist.filter((item) => checklist.includes(item))
  });

  const submit = async (e) => {
    e.preventDefault();

    if (sending) return;

    const sent = payloadForm();
    // A typed code must be checked first, so it is not silently ignored.
    const missing = !isPublicTransport && codeInput && !codeInfo ? ["Механикийн код (шалгах товч дарна уу)"] : [];
    missing.push(...(isBlast ? validateBlast(sent) : validateTravel(sent)));

    if (!activeChecklist.every((item) => checklist.includes(item))) missing.push("Шалгах хуудас");

    // The main employee fills in everything; others only name and phone.
    employees.forEach((employee, index) => {
      const who = index === 0 ? "Үндсэн ажилтан" : `Зорчигч ${index + 1}`;
      if (!employee.name.trim()) missing.push(`${who} - Овог нэр`);
      if (index === 0 && !employee.position.trim()) missing.push(`${who} - Албан тушаал`);
      if (!employee.phone.trim()) missing.push(`${who} - Утасны дугаар`);
    });

    if (photos.length < MIN_PHOTOS) missing.push(`Зураг (хамгийн багадаа ${MIN_PHOTOS})`);
    if (!signature) missing.push("Гарын үсэг");
    if (!accepted) missing.push("Танилцсан нөхцөл");

    if (missing.length > 0) {
      alert(`Дутуу байна: ${missing[0]}`);
      return;
    }

    setSending(true);

    try {
      // A small copy of the signature is stored for the consolidated email.
      const signatureThumb = await scaleDataUrl(signature, 320, { quality: 0.6, force: true });

      const response = await fetch("/api/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          form: sent,
          employees: employees.map((employee, index) => (index === 0 ? employee : { ...employee, position: "" })),
          signature,
          signatureThumb,
          photos
        })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Failed to send the form.");
      }

      setSubmitted(data.stage || "waiting_approval");
      setAccepted(false);
      setSignature("");
      setPhotos([]);
      setEmployees([emptyEmployee()]);
      setChecklist([]);
      setForm(initialForm());
      setShowSafety(false);
      setCodeInput("");
      setCodeInfo(null);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      alert(error.message || "Илгээхэд асуудал гарлаа. Та дахин оролдоно уу.");
    } finally {
      setSending(false);
    }
  };

  if (submitted) {
    return (
      <main className="page">
        <AppBar />
        <div className="successScreen">
          <div className="successIcon">
            <CheckCircle2 size={44} strokeWidth={2.2} />
          </div>
          <h2>Амжилттай илгээгдлээ</h2>
          <p>
            {submitted === "waiting_mechanic"
              ? "Аяллын хуудас хадгалагдлаа. Механикт мэдэгдэнэ үү: механик машиныг шалгасны дараа батлагчид очно. Батлагдсаны дараа нэгдсэн имэйл илгээгдэнэ."
              : "Аяллын хуудас батлагчид илгээгдлээ. Батлагдсаны дараа хариуцсан ажилтнуудад нэгдсэн имэйл илгээгдэнэ."}
          </p>
          <button type="button" className="secondaryBtn" onClick={() => setSubmitted(false)}>
            <RotateCcw size={18} /> Шинэ маягт бөглөх
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <AppBar />
      <div className="formCard">
        <header className={`hero${isBlast ? " hero--blast" : ""}`}>
          <span className="heroChip">Аяллын хуудас</span>
          <h1>
            {isBlast
              ? "Тэсрэх бодис тээвэрлэх үеийн"
              : "АТҮТ болон замын унаагаар зорчих үеийн"}
          </h1>
          <p>Аюулгүй ажиллагааны зааварчилгаа</p>
        </header>

        <form onSubmit={submit}>
          <div className="segmented" role="radiogroup" aria-label="Аяллын төрөл">
            {TRIP_TYPES.map((tripType) => (
              <button
                key={tripType}
                type="button"
                role="radio"
                aria-checked={form.tripType === tripType}
                className={form.tripType === tripType ? "active" : ""}
                onClick={() => form.tripType !== tripType && changeTripType(tripType)}
              >
                {tripType === BLAST_TRIP ? <Bomb size={17} /> : <Car size={17} />}
                {tripType}
              </button>
            ))}
          </div>

          <div className="notice" role="note">
            <AlertTriangle size={18} aria-hidden="true" />
            <span><strong>АНХААР:</strong> Аялал эхлэх цаг хүйтний улирал 06:00, дулааны улирал 05:00 байна.</span>
          </div>

          <Section title="Үндсэн мэдээлэл" icon={<Info size={18} />}>
            <Field label="Компани">
              <select name="company" value={form.company} onChange={updateForm}>
                {companyOptions.map((company) => (
                  <option key={company.value} value={company.value}>
                    {company.value}
                  </option>
                ))}
              </select>
            </Field>

            {!isBlast && (
            <Field label="Харьяалагдах хэлтэс *">
              <select
                required
                name="department"
                value={form.department}
                onChange={updateForm}
              >
                <option value="">Сонгох</option>
                <option value="Захиргаа">Захиргаа</option>
                <option value="Хүний нөөц">Хүний нөөц</option>
                <option value="ХАБЭАБО">ХАБЭАБО</option>
                <option value="Уулын хэлтэс">Уулын хэлтэс</option>
                <option value="Тэсэлгээний хэлтэс">Тэсэлгээний хэлтэс</option>
                <option value="Удирдлага">Удирдлага</option>
                <option value="Санхүү">Санхүү</option>
                <option value="Хууль">Хууль</option>
                <option value="Үйл ажиллагаа">Үйл ажиллагаа</option>
                <option value="IT">IT</option>
                <option value="Бусад">Бусад</option>
              </select>
            </Field>
            )}

            <Field label="Аяллын зорилго *">
              <input
                required
                name="purpose"
                value={form.purpose}
                onChange={updateForm}
                placeholder={isBlast ? "Жишээ: Блок 3-ын тэсэлгээнд тэсрэх бодис хүргэх" : "Жишээ: Уурхайн ээлжинд ажиллах"}
              />
            </Field>

            {isBlast && <BlastBasicFields form={form} updateForm={updateForm} />}
          </Section>

          {!isBlast && (
            <Section title="Аяллын ахлагч" icon={<UserRound size={18} />}>
              <div className="twoCols">
                <Field label="Овог нэр *">
                  <input required name="leader" value={form.leader} onChange={updateForm} placeholder="Овог нэр" />
                </Field>
                <Field label="Албан тушаал *">
                  <input required name="leaderPosition" value={form.leaderPosition} onChange={updateForm} placeholder="Албан тушаал" />
                </Field>
              </div>
              <Field label="Утасны дугаар *">
                <input
                  required
                  name="leaderPhone"
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]+"
                  value={form.leaderPhone}
                  onChange={updateDigits}
                  placeholder="Жишээ: 99112233"
                />
              </Field>
            </Section>
          )}

          {!isBlast && (
            <Section title="Аяллын хугацаа ба маршрут" icon={<CalendarClock size={18} />}>
              <div className="twoCols">
                <Field label="Аялал эхлэх огноо *">
                  <input required type="date" name="travelDate" value={form.travelDate} onChange={updateForm} />
                </Field>
                <Field label="Аялал дуусах огноо *">
                  <input required type="date" name="returnDate" min={form.travelDate || undefined} value={form.returnDate} onChange={updateForm} />
                </Field>
              </div>

              <Field label="Аялах чиглэл *">
                <select
                  required
                  name="direction"
                  value={form.direction}
                  onChange={updateForm}
                >
                  <option value="">Сонгох</option>
                  {DIRECTION_GROUPS.map(([label, directions]) => (
                    <optgroup key={label} label={label}>
                      {directions.map((direction) => <option key={direction}>{direction}</option>)}
                    </optgroup>
                  ))}
                  <option>Бусад</option>
                </select>
              </Field>

              {form.direction === "Бусад" && (
                <Field label="Бусад явах чиглэл *">
                  <input
                    required
                    name="otherDirection"
                    value={form.otherDirection}
                    onChange={updateForm}
                    placeholder="Жишээ: Гурвантэс - Даланзадгад"
                  />
                </Field>
              )}

              <Field label="Аяллын маршрут *">
                <textarea
                  required
                  rows={3}
                  name="route"
                  value={form.route}
                  onChange={updateForm}
                  placeholder="Хаанаас хаана хүрэх, амрах суурин газрын нэр, буцах чиглэл, төв суурин газрын нэрийг тодорхой бичнэ үү."
                />
              </Field>
            </Section>
          )}

          {isBlast && (
            <BlastMaterialSection form={form} updateForm={updateForm} updateDigits={updateDigits} />
          )}

          <Section title="Тээврийн хэрэгсэл" icon={<Car size={18} />}>
            {!isBlast && (
            <Field label="Аялах тээврийн хэрэгсэл *">
              <select
                name="transport"
                value={form.transport}
                onChange={updateForm}
              >
                <option>Байгууллагын унаагаар</option>
                <option>Замын унаа</option>
                <option>Хувийн унаа</option>
                <option>{PUBLIC_TRANSPORT}</option>
                <option>Гэрээт компаний унаа</option>
                <option>Бусад</option>
              </select>
            </Field>
            )}

            {!isPublicTransport && (
              <MechanicCode
                value={codeInput}
                onChange={(value) => {
                  setCodeInput(value);
                  if (codeInfo && value !== codeInfo.code) setCodeInfo(null);
                }}
                onCheck={checkCode}
                checking={checkingCode}
                info={codeInfo}
              />
            )}

            {!isPublicTransport && !codeInfo && (
              <DriverVehicleFields form={form} setForm={setForm} updateForm={updateForm} />
            )}

            {isBlast && (
              <ChoiceField label="Тээврийн хэрэгслийн харьяалал *" options={VEHICLE_OWNERS} value={form.vehicleOwner} onChange={(value) => setField("vehicleOwner", value)} />
            )}

            {!isPublicTransport && (
              <>
                <ChoiceField label="Сансарын хөдөлгөөнт интернэт (Starlink) хэвийн эсэх *" options={YES_NO} value={form.starlink} onChange={(value) => setField("starlink", value)} />
                <ChoiceField label="Байршил тогтоогч, хурд хэмжигч (GPS) хэвийн эсэх *" options={YES_NO} value={form.gps} onChange={(value) => setField("gps", value)} />
              </>
            )}

            {isBlast && (
              <>
                <ChoiceField label="Хар хайрцаг буюу хяналтын тоног төхөөрөмж хэвийн эсэх *" options={YES_NO} value={form.blackBox} onChange={(value) => setField("blackBox", value)} />
                <BlastEscortFields form={form} updateForm={updateForm} updateDigits={updateDigits} />
              </>
            )}
          </Section>

          {isBlast && (
            <Section title="Жолоочийн ажиллагааны заавар" icon={<ShieldCheck size={18} />}>
              <ol className="ruleList">
                <li>Жолооч техникийн бүрэн бүтэн байдал, ачааны татлага, лац ломбо болон тэвшний хаалга хаалтуудад бүрэн хяналт тавих.</li>
                <li>Тэсрэх материалын тээвэрлэлтийг Цагдаагийн Ерөнхий газрын Бүртгэл, хяналтын төвөөс баталсан маршрутын дагуу заавал хөтчийн хамт гүйцэтгэнэ.</li>
                <li>Тээврийн хэрэгсэл нь шатахуунаар хүрэлцэхүйц цэнэглэгдсэн байна. Зайлшгүй шаардлагаар уурхайгаас бусад газарт цэнэглэх бол хот, суурин газрын захад, маршрутад тусгагдсан шатахуун түгээх станцаас цэнэглэх.</li>
                <li>Тээвэрлэх үед тээврийн хэрэгслээс 100 метрээс ойр зайд тамхи татах, ил гал гаргахыг хориглоно.</li>
                <li>Аянга цахилгаантай бороотой үед хөдөлгөөнийг зогсоож, ой мод, хавцал, жалга, хот суурин газраас 200 м, машин хооронд 50 м-ээс багагүй зайд замын баруун талд байрлуулж, урд хойно 100 м-т "Ослын зогсолтын тэмдэг" тавьж, 200 м-ээс багагүй зайнаас хянана.</li>
              </ol>
              <label className="checkRow accept">
                <input
                  type="checkbox"
                  checked={form.driverAck === YES}
                  onChange={(e) => setField("driverAck", e.target.checked ? YES : "")}
                />
                <span className="checkMark" aria-hidden="true"><Check size={14} strokeWidth={3} /></span>
                <span>Жолооч дээрх зааварчилгаатай танилцсан.</span>
              </label>
            </Section>
          )}

          <Section
            title={isBlast ? "Тэсэлгээний баг" : "Зорчигчид"}
            icon={<Users size={18} />}
            badge={`${employees.length}/${maxPassengers}`}
          >
            <p className="helper">Хамгийн ихдээ {maxPassengers} хүн бүртгэх боломжтой.</p>

            {!isBlast && (
              <p className="ruleNote">
                <strong>Зорчигчийн аюулгүй ажиллагааны заавар:</strong> Суудлын бүс хэрэглэнэ. Жолооч, аяллын ахлагчийн тавьж буй шаардлагыг биелүүлнэ. Хөдөлгөөний аюулгүй байдалд сөргөөр нөлөөлөхүйц үйлдэл гаргахыг хориглоно. Түр зогссон үед хөдөлгөөний аюулгүй байдлаа хангаж аливаа эрсдэлтэй үйлдэл хийхийг хориглоно.
              </p>
            )}

            <div className="employeeCard">
              <div className="employeeHead">
                <strong>Үндсэн ажилтан</strong>
                <small>Маягтыг бөглөж буй хүн</small>
              </div>

              <Field label="Овог нэр *">
                <input
                  required
                  name="employee-name"
                  value={employees[0].name}
                  onChange={(e) => updateEmployee(0, "name", e.target.value)}
                  placeholder="Овог нэр"
                />
              </Field>

              <div className="twoCols">
                <Field label="Албан тушаал *">
                  <input
                    required
                    name="employee-position"
                    value={employees[0].position}
                    onChange={(e) => updateEmployee(0, "position", e.target.value)}
                    placeholder="Албан тушаал"
                  />
                </Field>

                <Field label="Утасны дугаар *">
                  <input
                    required
                    name="employee-phone"
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]+"
                    value={employees[0].phone}
                    onChange={(e) => updateEmployee(0, "phone", digitsOnly(e.target.value))}
                    placeholder="Утас"
                  />
                </Field>
              </div>
            </div>

            {employees.length > 1 && (
              <ol className="passengerList" start={2}>
                {employees.slice(1).map((employee, offset) => {
                  const index = offset + 1;
                  return (
                    <li key={index} className="passengerRow">
                      <span className="passengerNumber" aria-hidden="true">{index + 1}</span>
                      <input
                        required
                        name="passenger-name"
                        aria-label={`Зорчигч ${index + 1} - Овог нэр`}
                        value={employee.name}
                        onChange={(e) => updateEmployee(index, "name", e.target.value)}
                        placeholder="Овог нэр"
                      />
                      <input
                        required
                        name="passenger-phone"
                        aria-label={`Зорчигч ${index + 1} - Утасны дугаар`}
                        type="tel"
                        inputMode="numeric"
                        pattern="[0-9]+"
                        value={employee.phone}
                        onChange={(e) => updateEmployee(index, "phone", digitsOnly(e.target.value))}
                        placeholder="Утас"
                      />
                      <button
                        type="button"
                        className="iconBtn danger"
                        onClick={() => removeEmployee(index)}
                        aria-label={`Зорчигч ${index + 1} устгах`}
                      >
                        <Trash2 size={17} />
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}

            {employees.length < maxPassengers && (
              <button type="button" className="addBtn" onClick={addEmployee}>
                <Plus size={17} /> {isBlast ? "Ажилтан нэмэх" : "Зорчигч нэмэх"}
              </button>
            )}
          </Section>

          <Section title="Зураг" icon={<Camera size={18} />} badge={`${photos.length}/${MAX_PHOTOS}`}>
            <PhotoPicker photos={photos} onChange={setPhotos} min={MIN_PHOTOS} max={MAX_PHOTOS} />
          </Section>

          {activeChecklist.length > 0 && (
            <Section
              title="Шалгах хуудас"
              icon={<ListChecks size={18} />}
              badge={`${activeChecklist.filter((item) => checklist.includes(item)).length}/${activeChecklist.length}`}
            >
              <p className="helper">Тээвэрлэлтийн өмнө бүх зүйлийг шалгаж тэмдэглэнэ үү.</p>
              <div className="checkList">
                {activeChecklist.map((item) => (
                  <label className="checkRow" key={item}>
                    <input
                      type="checkbox"
                      checked={checklist.includes(item)}
                      onChange={() => toggleCheck(item)}
                    />
                    <span className="checkMark" aria-hidden="true"><Check size={14} strokeWidth={3} /></span>
                    <span>{item}</span>
                  </label>
                ))}
              </div>
            </Section>
          )}

          <Section title={isBlast ? "Аялал хийх зөвшөөрөл" : "Зааварчилгаа өгсөн"} icon={<BadgeCheck size={18} />}>
            <p className="helper">
              {isBlast ? "Аялал хийхийг зөвшөөрсөн албан тушаалтан." : "Аюулгүй ажиллагааны зааварчилгаа өгсөн албан тушаалтан."}
            </p>
            {isBlast && (
              <div className="twoCols">
                <Field label="Зөвшөөрсөн: овог нэр *">
                  <input required name="approver" value={form.approver} onChange={updateForm} placeholder="Овог нэр" />
                </Field>
                <Field label="Албан тушаал *">
                  <input required name="approverPosition" value={form.approverPosition} onChange={updateForm} placeholder="Албан тушаал" />
                </Field>
              </div>
            )}
            {!isBlast && (
              <div className="twoCols">
                <Field label="Зааварчилгаа өгсөн: овог нэр *">
                  <input required name="instructor" value={form.instructor} onChange={updateForm} placeholder="Овог нэр" />
                </Field>
                <Field label="Албан тушаал *">
                  <input required name="instructorPosition" value={form.instructorPosition} onChange={updateForm} placeholder="Албан тушаал" />
                </Field>
              </div>
            )}
          </Section>

          <Section title="Зааварчилгаа ба гарын үсэг" icon={<ShieldCheck size={18} />}>
            <SignaturePad label="Гарын үсэг *" value={signature} onChange={setSignature} />

            <button
              type="button"
              className="safetyToggle"
              onClick={() => setShowSafety(!showSafety)}
            >
              <span>
                <strong>Зааварчилгаа унших</strong>
                <small>
                  {isBlast
                    ? "Ачилт, тээвэрлэлт, буулгалт, яаралтай үеийн арга хэмжээ"
                    : "Хувийн аюулгүй байдал, аяллын аюулгүй байдал, хүнсний эрүүл ахуй"}
                </small>
              </span>
              {showSafety ? <ChevronUp /> : <ChevronDown />}
            </button>

            <button
              type="button"
              className="safetyDownload"
              onClick={() => setShowReader(true)}
            >
              <FileText size={18} aria-hidden="true" />
              <span>Зааварчилгаа PDF унших</span>
            </button>
            {showReader && (
              <SafetyReader
                title={isBlast ? "Тэсрэх бодис тээвэрлэх журам" : "Холын аяллын журам"}
                sources={isBlast ? BLAST_DOCUMENTS : TRAVEL_DOCUMENTS}
                onClose={() => setShowReader(false)}
              />
            )}

            {showSafety && isBlast && <BlastSafety />}

            {showSafety && !isBlast && (
              <div className="safety">
                <SafetyBlock title="Хувь хүний аюулгүй байдал">
                  <li>Аялалд гарахын өмнө өөрийн эд зүйлсээ шалгах.</li>
                  <li>Эрүүл мэнд, биеийн байдалдаа анхаарах.</li>
                  <li>Шаардлагатай эм, хувийн хэрэгслээ биедээ авч явах.</li>
                  <li>Цаг агаар, нөхцөлдөө тохируулан хувцаслах.</li>
                  <li>Аяллын турш согтууруулах ундаа, сэтгэцэд нөлөөлөх бодис хэрэглэхгүй байх.</li>
                </SafetyBlock>

                <SafetyBlock title="Аяллын аюулгүй байдал">
                  <li>Тээврийн хэрэгслийн бүрэн бүтэн байдлыг шалгах.</li>
                  <li>Суудлын бүсийг тогтмол хэрэглэх.</li>
                  <li>Жолоочийн анхаарлыг сарниулахгүй байх.</li>
                  <li>Тээврийн хэрэгсэл бүрэн зогссоны дараа буух.</li>
                  <li>Аяллын замд зөвшөөрөлгүй бууж үлдэхгүй байх.</li>
                  <li>Жолооч хэт ядарсан бол хөдөлгөөнийг зогсоож, ахлах ажилтанд мэдэгдэх.</li>
                </SafetyBlock>

                <SafetyBlock title="Хүнсний эрүүл ахуй">
                  <li>Хүнсний бүтээгдэхүүний чанар, хугацааг шалгах.</li>
                  <li>Өөрийн эрүүл мэндэд тохирохгүй хүнс хэрэглэхгүй байх.</li>
                  <li>Замд хэрэглэх хүнс, усыг урьдчилан бэлтгэх.</li>
                </SafetyBlock>

                <div className="emergency">
                  <strong>Яаралтай үед холбоо барих</strong>
                  <span>Онцгой байдал: 105</span>
                  <span>Цагдаа: 102</span>
                  <span>Эмнэлэг: 103</span>
                  <span>Байгууллага: 75053443</span>
                </div>
              </div>
            )}

            <div className="reminder">
              <strong>Санамж</strong>
              {isBlast ? (
                <>
                  <p>Аялалд гарах болон зорьсон газарт очсон талаарх мэдээллийг ТӨСЛИЙН МЕНЕЖЕРТ мэдэгдэнэ үү (суурин газраас мэдээлнэ).</p>
                  <p>Тээвэрлэлтийн үед осол гарсан тохиолдолд ослын картад заасан ослын нөхцөлд зайлшгүй авах арга хэмжээнүүдийг яаралтай авч хэрэгжүүлнэ. Яаралтай тусламж: 85006933.</p>
                </>
              ) : (
                <>
                  <p>Аялалд гарах болон зорьсон газарт очсон талаарх мэдээллийг ХАБЭАБО-ны хэлтсийн удирдлагад мэдэгдэнэ үү (суурин газраас мэдээлнэ).</p>
                  <p>Аяллын үеийн чиглэл маршрут өөрчлөх, аяллын зорилго өөрчлөгдөх болон аялалтай хамааралтай аливаа шийдвэрийг аяллын ахлагч гаргах бөгөөд аяллын үеийн аюулгүй байдлыг аяллын ахлагч хариуцна. Томилогдсон жолооч нь аяллын ахлагчийн заавар зааварчилгааг биелүүлж ажиллана.</p>
                </>
              )}
            </div>

            <label className="checkRow accept">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
              />
              <span className="checkMark" aria-hidden="true"><Check size={14} strokeWidth={3} /></span>
              <span>
                Дээрх шаардлагыг бүрэн уншиж танилцсан, ойлгосон бөгөөд мөрдөхөө зөвшөөрч байна.
              </span>
            </label>
          </Section>

          <div className="submitArea">
            <button className="submitBtn" type="submit" disabled={!accepted || sending}>
              {sending ? "Илгээж байна..." : <><Send size={18} /> Илгээх</>}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

/**
 * Workflow B: the 6-digit code the mechanic gave after a passed inspection,
 * if the mechanic went first. Once checked, it shows the inspected vehicle
 * and driver, which the trip then uses as they are. Without a code, the
 * travelers type the vehicle and a mechanic inspects it afterwards.
 */
function MechanicCode({ value, onChange, onCheck, checking, info }) {
  return (
    <>
      <p className="ruleNote">
        Энэ аялалд механикийн үзлэг шаардлагатай. Механик аль хэдийн шалгасан бол өгсөн 6 оронтой кодыг оруулна уу. Үгүй бол машины мэдээллийг бөглөөд илгээнэ үү — механик дараа нь шалгана.
      </p>
      <Field label="Механикийн код (байвал)">
        <div className="codeRow">
          <input
            name="inspectionCode"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={value}
            onChange={(e) => onChange(digitsOnly(e.target.value))}
            placeholder="Жишээ: 482915"
          />
          <button type="button" className="codeBtn" onClick={onCheck} disabled={value.length !== 6 || checking}>
            {checking ? "Шалгаж байна..." : "Шалгах"}
          </button>
        </div>
      </Field>
      {info && (
        <dl className="summaryList codeInfo">
          <div><dt>Автомашин</dt><dd>{info.vehicle}</dd></div>
          <div><dt>Жолооч</dt><dd>{info.driver} · {info.driverPhone}</dd></div>
          <div><dt>Механик</dt><dd>{info.mechanic} · Тэнцсэн</dd></div>
        </dl>
      )}
    </>
  );
}

function DriverVehicleFields({ form, setForm, updateForm }) {
  return (
    <>
      <div className="twoCols">
      <Field label="Жолоочийн нэр *">
        <input
          required
          name="driver"
          value={form.driver}
          onChange={updateForm}
          placeholder="Жишээ: Бат"
        />
      </Field>
      <Field label="Жолоочийн утасны дугаар *">
        <input
          required
          name="driverPhone"
          type="tel"
          inputMode="numeric"
          pattern="[0-9]+"
          value={form.driverPhone}
          onChange={(e) => setForm({ ...form, driverPhone: digitsOnly(e.target.value) })}
          placeholder="Жишээ: 99112233"
        />
      </Field>
      </div>

      <div className="twoCols">
      <Field label="Автомашины марк *">
        <input
          required
          name="vehicle"
          value={form.vehicle}
          onChange={updateForm}
          placeholder="Жишээ: Lexus LX700"
        />
      </Field>
      <Field label="Улсын дугаар *">
        <div className="vehiclePlate">
          <span className="plateCountry" aria-hidden="true">MNG</span>
          <input
            required
            aria-label="Улсын дугаар"
            name="vehiclePlate"
            value={form.vehiclePlate}
            onChange={(e) => {
              const value = e.target.value.toUpperCase().replace(/[\s-]/g, "");
              setForm({ ...form, vehiclePlate: value.length > 4 ? `${value.slice(0, 4)} ${value.slice(4)}` : value });
            }}
            pattern="[0-9]{4} [А-ЯӨҮЁ]{3}"
            maxLength={8}
            placeholder="9911 УБА"
            title="4 орон тоо, 3 кирилл үсэг оруулна уу. Жишээ: 9911 УБА"
          />
        </div>
      </Field>
      </div>
    </>
  );
}

function BlastBasicFields({ form, updateForm }) {
  return (
    <>
      <div className="twoCols">
        <Field label="Тээвэрлэх өдөр *">
          <input required type="date" name="travelDate" value={form.travelDate} onChange={updateForm} />
        </Field>
        <Field label="Гарах цаг *">
          <input required type="time" name="departTime" value={form.departTime} onChange={updateForm} />
        </Field>
      </div>

      <div className="twoCols">
        <Field label="Хаанаас *">
          <input required name="routeFrom" value={form.routeFrom} onChange={updateForm} placeholder="Жишээ: Тэсрэх бодисын агуулах" />
        </Field>
        <Field label="Хаашаа *">
          <input required name="routeTo" value={form.routeTo} onChange={updateForm} placeholder="Жишээ: Чандмань уул, блок 3" />
        </Field>
      </div>

      <Field label="Тэсрэх бодис тээвэрлэх зөвшөөрлийн дугаар *">
        <input required name="permitNo" value={form.permitNo} onChange={updateForm} placeholder="Жишээ: ТБ-2026/045" />
      </Field>
    </>
  );
}

function BlastMaterialSection({ form, updateForm, updateDigits }) {
  return (
    <Section title="Тэсрэх бодис" icon={<Bomb size={18} />}>
      <div className="twoCols">
        <Field label="Тэсрэх бодисын төрөл *">
          <select required name="explosiveType" value={form.explosiveType} onChange={updateForm}>
            <option value="">Сонгох</option>
            <option>Аммонийн селитр (ANFO)</option>
            <option>Эмульс тэсрэх бодис</option>
            <option>Аммонит</option>
            <option>Бусад</option>
          </select>
        </Field>
        <Field label="Хэмжээ (кг) *">
          <input
            required
            name="explosiveQty"
            inputMode="decimal"
            value={form.explosiveQty}
            onChange={(e) => updateForm({ target: { name: "explosiveQty", value: e.target.value.replace(/[^0-9.,]/g, "") } })}
            placeholder="Жишээ: 500"
          />
        </Field>
      </div>

      <div className="twoCols">
        <Field label="Тэслэгчийн төрөл">
          <input name="detonatorType" value={form.detonatorType} onChange={updateForm} placeholder="Жишээ: Цахилгаан бус тэслэгч" />
        </Field>
        <Field label="Тэслэгчийн тоо (ш)">
          <input name="detonatorQty" inputMode="numeric" value={form.detonatorQty} onChange={updateDigits} placeholder="Жишээ: 40" />
        </Field>
      </div>
    </Section>
  );
}

function BlastEscortFields({ form, updateForm, updateDigits }) {
  return (
    <>
      <div className="twoCols">
        <Field label="Дагалдан хамгаалагч *">
          <input required name="escort" value={form.escort} onChange={updateForm} placeholder="Овог нэр" />
        </Field>
        <Field label="Хамгаалагчийн утас *">
          <input required name="escortPhone" type="tel" inputMode="numeric" value={form.escortPhone} onChange={updateDigits} placeholder="Жишээ: 99112233" />
        </Field>
      </div>

      <div className="twoCols">
        <Field label="Хариуцсан тэсэлгээчин *">
          <input required name="blaster" value={form.blaster} onChange={updateForm} placeholder="Овог нэр" />
        </Field>
        <Field label="Тэсэлгээчний утас *">
          <input required name="blasterPhone" type="tel" inputMode="numeric" value={form.blasterPhone} onChange={updateDigits} placeholder="Жишээ: 99112233" />
        </Field>
      </div>
    </>
  );
}

function BlastSafety() {
  return (
    <div className="safety">
      <SafetyBlock title="Ачилт, буулгалт">
        <li>Тэсрэх бодис, тэслэгчийг зөвхөн эрх бүхий тэсэлгээчний хяналтан дор ачиж буулгах.</li>
        <li>Тэсрэх бодис болон тэслэгчийг нэг хайрцаг, нэг тасалгаанд хамт ачихгүй байх.</li>
        <li>Ачааг унах, мөргөлдөх, үрэгдэхээс сэргийлж бэхлэх.</li>
        <li>Ачилт, буулгалтын үед хөдөлгүүрийг унтраах.</li>
      </SafetyBlock>

      <SafetyBlock title="Тээвэрлэлт">
        <li>Зөвшөөрөгдсөн маршрутаар, тогтоосон хурдаас хэтрүүлэхгүй явах.</li>
        <li>Суурин газар, шатахуун түгээх станцад зогсохгүй байх.</li>
        <li>Тээврийн хэрэгслийг хараа хяналтгүй орхихгүй байх.</li>
        <li>Тамхи татах, ил гал гаргахыг хатуу хориглоно.</li>
        <li>Аянга цахилгаантай үед тээвэрлэлтийг зогсоож, аюулгүй зайд байрлах.</li>
        <li>Зорчигч болон тэсэлгээний ажилд хамааралгүй хүн авч явахгүй байх.</li>
      </SafetyBlock>

      <SafetyBlock title="Яаралтай үед">
        <li>Гал гарвал хөдөлгөөнийг зогсоож, хүмүүсийг 300 м-ээс доошгүй зайд холдуулах.</li>
        <li>Ачаа гал авсан бол унтраах гэж оролдохгүй, нэн даруй холдох.</li>
        <li>Осол, зөрчлийг ХАБЭАБО болон тэсэлгээний хэлтэст нэн даруй мэдэгдэх.</li>
      </SafetyBlock>

      <div className="emergency">
        <strong>Яаралтай үед холбоо барих</strong>
        <span>Онцгой байдал: 105</span>
        <span>Цагдаа: 102</span>
        <span>Эмнэлэг: 103</span>
        <span>Байгууллага: 75053443</span>
      </div>
    </div>
  );
}

function SafetyBlock({ title, children }) {
  return (
    <div className="safetyBlock">
      <h3>{title}</h3>
      <ol>{children}</ol>
    </div>
  );
}

/**
 * Routes: /mechanic (inspections; #new starts one, #request=<id> inspects a
 * trip the travelers sent first, #mechanic=<token> a form saved before the
 * approval workflow), /approve (#request=<id> opens
 * one), and the travelers' form everywhere else.
 */
function Root() {
  const [hash, setHash] = useState(window.location.hash);

  useEffect(() => {
    const onHashChange = () => {
      setHash(window.location.hash);
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const path = window.location.pathname.replace(/\/+$/, "");
  const page = mechanicToken() || (path === "/mechanic" && mechanicRequestId())
    ? <MechanicForm key={hash} />
    : path === "/mechanic"
      ? isNewInspection() ? <NewInspection key={hash} /> : <MechanicInbox key={hash} />
      : path === "/approve"
        ? <ApprovalPage key={hash} />
        : <App />;

  return (
    <>
      {page}
      <footer className="siteFooter">Powered by Daniel Knight</footer>
    </>
  );
}

createRoot(document.getElementById("root")).render(<Root />);
