import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Bomb,
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
  Users
} from "lucide-react";
import companyLogo from "./assets/logos/erkhet-tunsh.svg";
import "./styles.css";
import SafetyReader from "./SafetyReader";
import { BLAST_TRIP, NORMAL_TRIP, TRIP_TYPES, checklistFor } from "../api/_trips.js";

const emptyEmployee = () => ({ name: "", position: "", phone: "" });

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
  travelDate: "",
  direction: "",
  otherDirection: "",
  transport: "Байгууллагын унаагаар",
  driver: "",
  driverPhone: "",
  vehicle: "",
  vehiclePlate: "",
  departTime: "",
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

const SIGNATURE_MAX_EDGE = 900;

/**
 * Reads a signature image and scales it down, so a phone photo does not
 * exceed the request body limit once base64-encoded.
 */
function readScaledImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error("read failed"));
    reader.onload = () => {
      const dataUrl = reader.result;
      const image = new Image();

      image.onerror = () => reject(new Error("decode failed"));
      image.onload = () => {
        const scale = Math.min(
          1,
          SIGNATURE_MAX_EDGE / Math.max(image.width, image.height)
        );

        if (scale === 1 && dataUrl.length < 700_000) {
          resolve(dataUrl);
          return;
        }

        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);

        const context = canvas.getContext("2d");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);

        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };

      image.src = dataUrl;
    };

    reader.readAsDataURL(file);
  });
}

function CompanyLogo() {
  return (
    <img
      src={companyLogo}
      alt="Лого"
      className="companyLogoSvg"
      draggable="false"
    />
  );
}

function App() {
  const [employees, setEmployees] = useState([emptyEmployee()]);
  const [showSafety, setShowSafety] = useState(false);
  const [showReader, setShowReader] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [signature, setSignature] = useState("");
  const [sending, setSending] = useState(false);

  const [form, setForm] = useState(initialForm);
  const [checklist, setChecklist] = useState([]);

  const isBlast = form.tripType === BLAST_TRIP;
  const isPublicTransport = !isBlast && form.transport === "АТҮТ / Нийтийн тээвэр";
  const activeChecklist = checklistFor(form);

  const updateForm = (e) =>
    setForm({ ...form, [e.target.name]: e.target.value });

  const updateDigits = (e) =>
    setForm({ ...form, [e.target.name]: digitsOnly(e.target.value) });

  // Switching between the travel and blasting forms starts the new form
  // fresh, so fields from the other form are never submitted.
  const changeTripType = (e) => {
    setForm(initialForm(e.target.value, form.company));
    setChecklist([]);
    setAccepted(false);
    setShowSafety(false);
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
    if (employees.length < 4) {
      setEmployees([...employees, emptyEmployee()]);
    }
  };

  const removeEmployee = (index) => {
    if (employees.length === 1) return;
    setEmployees(employees.filter((_, i) => i !== index));
  };

  const submit = async (e) => {
    e.preventDefault();

    if (sending) return;

    const missing = [];
    const plateValid = /^[0-9]{4} [А-ЯӨҮЁ]{3}$/.test(form.vehiclePlate.trim());

    if (isBlast) {
      if (!form.travelDate) missing.push("Тээвэрлэх өдөр");
      if (!form.departTime) missing.push("Гарах цаг");
      if (!form.routeFrom.trim()) missing.push("Хаанаас");
      if (!form.routeTo.trim()) missing.push("Хаашаа");
      if (!form.permitNo.trim()) missing.push("Зөвшөөрлийн дугаар");
      if (!form.explosiveType.trim()) missing.push("Тэсрэх бодисын төрөл");
      if (!/^[0-9]+([.,][0-9]+)?$/.test(form.explosiveQty)) missing.push("Тэсрэх бодисын хэмжээ (кг)");
      if (!form.driver.trim()) missing.push("Жолоочийн нэр");
      if (!/^[0-9]+$/.test(form.driverPhone)) missing.push("Жолоочийн утасны дугаар");
      if (!form.vehicle.trim()) missing.push("Автомашины марк");
      if (!plateValid) missing.push("Улсын дугаар (9911 УБА)");
      if (!form.escort.trim()) missing.push("Дагалдан хамгаалагч");
      if (!/^[0-9]+$/.test(form.escortPhone)) missing.push("Хамгаалагчийн утас");
      if (!form.blaster.trim()) missing.push("Хариуцсан тэсэлгээчин");
      if (!/^[0-9]+$/.test(form.blasterPhone)) missing.push("Тэсэлгээчний утас");
    } else {
    if (!isPublicTransport) {
    if (!form.driver.trim()) missing.push("Жолоочийн нэр");
    if (!/^[0-9]+$/.test(form.driverPhone)) missing.push("Жолоочийн утасны дугаар");
    if (!form.vehicle.trim()) missing.push("Автомашины марк");
    if (!plateValid) missing.push("Улсын дугаар (9911 УБА)");

    }

    if (!form.department.trim()) missing.push("Харьяалагдах хэлтэс");
    if (!form.travelDate) missing.push("Аялах өдөр");
    if (!form.direction) missing.push("Аялах чиглэл");
    if (form.direction === "Бусад" && !form.otherDirection.trim()) missing.push("Бусад явах чиглэл");
    if (!form.transport.trim()) missing.push("Аялах тээврийн хэрэгсэл");
    }

    if (!activeChecklist.every((item) => checklist.includes(item))) missing.push("Шалгах хуудас");

    employees.forEach((employee, index) => {
      if (!employee.name.trim()) missing.push(`Ажилтан ${index + 1} - Овог нэр`);
      if (!employee.position.trim()) missing.push(`Ажилтан ${index + 1} - Албан тушаал`);
      if (!employee.phone.trim()) missing.push(`Ажилтан ${index + 1} - Утасны дугаар`);
    });

    if (!signature) missing.push("Гарын үсэг");
    if (!accepted) missing.push("Танилцсан нөхцөл");

    if (missing.length > 0) {
      alert(`Дутуу байна: ${missing[0]}`);
      return;
    }

    setSending(true);

    try {
      const response = await fetch("/api/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          form: {
            ...form,
            driver: isPublicTransport ? "" : form.driver,
            driverPhone: isPublicTransport ? "" : form.driverPhone,
            vehicle: isPublicTransport ? "" : `${form.vehicle.trim()}, ${form.vehiclePlate.trim()}`,
            vehiclePlate: isPublicTransport ? "" : form.vehiclePlate,
            checklist: activeChecklist.filter((item) => checklist.includes(item))
          },
          employees,
          signature
        })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Failed to send the form.");
      }

      setSubmitted(true);
      setAccepted(false);
      setSignature("");
      setEmployees([emptyEmployee()]);
      setChecklist([]);
      setForm(initialForm());
      setShowSafety(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      alert(error.message || "Илгээхэд асуудал гарлаа. Та дахин оролдоно уу.");
    } finally {
      setSending(false);
    }
  };

  const handleSignatureUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setSignature(await readScaledImage(file));
    } catch {
      alert("Зургийг уншиж чадсангүй. Өөр зураг сонгоно уу.");
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
          <p>Аяллын мэдээлэл бүртгэгдэж, хариуцсан ажилтнуудад илгээгдлээ.</p>
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
          <span className="heroChip">Хувилбар 01</span>
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
                onClick={() => form.tripType !== tripType && changeTripType({ target: { value: tripType } })}
              >
                {tripType === BLAST_TRIP ? <Bomb size={17} /> : <Car size={17} />}
                {tripType}
              </button>
            ))}
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

            {isBlast ? (
              <BlastBasicFields form={form} updateForm={updateForm} />
            ) : (<>
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

            <Field label="Аялах өдөр *">
              <input
                required
                type="date"
                name="travelDate"
                value={form.travelDate}
                onChange={updateForm}
              />
            </Field>

            <Field label="Аялах чиглэл *">
              <select
                required
                name="direction"
                value={form.direction}
                onChange={updateForm}
              >
                <option value="">Сонгох</option>
                <option>Улаанбаатар-Сайншанд</option>
                <option>Улаанбаатар-Чандмань уул төмрийн хүдрийн уурхай</option>
                <option>Улаанбаатар-Дэлгэрэх сум</option>
                <option>Улаанбаатар-Гурвантэс</option>
                <option>Сайншанд-Чандмань уул төмрийн хүдрийн уурхай</option>
                <option>Сайншанд-Дэлгэрэх сум</option>
                <option>Сайншанд-Улаанбаатар</option>
                <option>Сайншанд-Гурвантэс</option>
                <option>Гурвантэс-Улаанбаатар</option>
                <option>Гурвантэс-Сайншанд</option>
                <option>Чандмань уул төмрийн уурхай-Улаанбаатар</option>
                <option>Чандмань уул төмрийн уурхай-Сайншанд</option>
                <option>Чандмань уул төмрийн уурхай-Чойр</option>
                <option>Чандмань уул төмрийн уурхай-Гурвантэс</option>                  
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
            </>)}
          </Section>

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
                <option>АТҮТ / Нийтийн тээвэр</option>
                <option>Гэрээт компаний унаа</option>                
                <option>Бусад</option>
              </select>
            </Field>
            )}

            {!isPublicTransport && (
              <DriverVehicleFields form={form} setForm={setForm} updateForm={updateForm} />
            )}

            {isBlast && (
              <BlastEscortFields form={form} updateForm={updateForm} updateDigits={updateDigits} />
            )}
          </Section>

          <Section
            title={isBlast ? "Тэсэлгээний баг" : "Зорчих ажилтан"}
            icon={<Users size={18} />}
            badge={`${employees.length}/4`}
          >
            <p className="helper">Хамгийн ихдээ 4 ажилтан бүртгэх боломжтой.</p>

            {employees.map((employee, index) => (
              <div className="employeeCard" key={index}>
                <div className="employeeHead">
                  <strong>Ажилтан {index + 1}</strong>
                  {employees.length > 1 && (
                    <button
                      type="button"
                      className="iconBtn danger"
                      onClick={() => removeEmployee(index)}
                      aria-label="Устгах"
                    >
                      <Trash2 size={17} />
                    </button>
                  )}
                </div>

                <Field label="Овог нэр *">
                  <input
                    required
                    name="employee-name"
                    value={employee.name}
                    onChange={(e) =>
                      updateEmployee(index, "name", e.target.value)
                    }
                    placeholder="Овог нэр"
                  />
                </Field>

                <div className="twoCols">
                  <Field label="Албан тушаал *">
                    <input
                      required
                      name="employee-position"
                      value={employee.position}
                      onChange={(e) =>
                        updateEmployee(index, "position", e.target.value)
                      }
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
                      value={employee.phone}
                      onChange={(e) =>
                        updateEmployee(index, "phone", e.target.value.replace(/[^0-9]/g, ""))
                      }
                      placeholder="Утас"
                    />
                  </Field>
                </div>
              </div>
            ))}

            {employees.length < 4 && (
              <button type="button" className="addBtn" onClick={addEmployee}>
                <Plus size={17} /> Ажилтан нэмэх
              </button>
            )}
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

          <Section title="Зааварчилгаа ба гарын үсэг" icon={<ShieldCheck size={18} />}>
            <div className="signatureBox">
              <div className="signatureHeader">
                <span>Гарын үсэг</span>
                <label className="uploadSignature">
                  <input type="file" accept="image/*" onChange={handleSignatureUpload} />
                  <span>Зураг сонгох</span>
                </label>
              </div>

              {signature ? (
                <img className="signaturePreview" src={signature} alt="Signature preview" />
              ) : (
                <div className="signaturePlaceholder">Гарын үсгийн зураг оруулна уу</div>
              )}
            </div>

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

            {!isBlast && (<>
            <button
              type="button"
              className="safetyDownload"
              onClick={() => setShowReader(true)}
            >
              <FileText size={18} aria-hidden="true" />
              <span>Зааварчилгаа PDF унших</span>
            </button>
            {showReader && <SafetyReader onClose={() => setShowReader(false)} />}
            </>)}

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
          onChange={(e) => setForm({ ...form, driverPhone: e.target.value.replace(/[^0-9]/g, "") })}
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

function AppBar() {
  return (
    <div className="appBar">
      <CompanyLogo />
      <div>
        <strong>ЭРХЭТ ТҮНШ ХХК</strong>
        <span>Аюулгүй ажиллагааны зааварчилгаа</span>
      </div>
    </div>
  );
}

function Section({ title, icon, badge, children }) {
  return (
    <section className="section">
      <div className="sectionTitle">
        {icon && <span className="sectionIcon">{icon}</span>}
        <span>{title}</span>
        {badge && <span className="sectionBadge">{badge}</span>}
      </div>
      <div className="sectionBody">{children}</div>
    </section>
  );
}

function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
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

createRoot(document.getElementById("root")).render(<App />);
