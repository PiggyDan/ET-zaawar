import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Bomb,
  Car,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  FileText,
  Gauge,
  KeyRound,
  Send,
  ShieldCheck
} from "lucide-react";
import { AppBar, ChoiceField, Field, Section, postJson, readScaledImage, scaleDataUrl, sessionValue } from "./ui";
import {
  BLAST_TRIP,
  ITEM_BAD,
  ITEM_OK,
  ITEM_STATUSES,
  MECHANIC_FAIL,
  MECHANIC_PASS,
  MECHANIC_RESULTS,
  NORMAL_TRIP,
  TRIP_TYPES,
  inspectionHasCount,
  inspectionSheetFor
} from "../api/_trips.js";

export const MECHANIC_PASSWORD_KEY = "mechanicPassword";

/** The signed token of a form saved before the approval workflow (…/#mechanic=<token>), if any. */
export function mechanicToken() {
  const match = /^#mechanic=([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(window.location.hash);
  return match ? match[1] : "";
}

/** Whether the URL asks for a new inspection (/mechanic#new). */
export const isNewInspection = () => window.location.hash === "#new";

const digitsOnly = (value) => value.replace(/[^0-9]/g, "");

const emptyInspection = () => ({
  odometer: "",
  motoHours: "",
  mechanic: "",
  mechanicPhone: "",
  result: "",
  note: "",
  remarks: "",
  items: {}
});

function BackToList() {
  return <a className="backLink" href="/mechanic"><ArrowLeft size={16} /> Жагсаалт руу буцах</a>;
}

/** Full-page message: done, error or loading. */
function Notice({ icon, tone, title, children }) {
  return (
    <main className="page">
      <AppBar />
      <div className="successScreen">
        {icon && <div className={`successIcon${tone === "error" ? " errorIcon" : ""}`}>{icon}</div>}
        {title && <h2>{title}</h2>}
        {children}
        <BackToList />
      </div>
    </main>
  );
}

/** The inspection's state and the handlers both mechanic forms share. */
function useInspection() {
  const [inspection, setInspection] = useState(emptyInspection);
  const [signature, setSignature] = useState("");

  const update = (key, value) => setInspection((current) => ({ ...current, [key]: value }));

  const setItem = (id, change) =>
    setInspection((current) => ({
      ...current,
      items: { ...current.items, [id]: { status: "", count: "", note: "", ...current.items[id], ...change } }
    }));

  const markGroupOk = (items) =>
    setInspection((current) => {
      const next = { ...current.items };
      items.forEach(({ id }) => {
        if (!next[id]?.status) next[id] = { count: "", note: "", ...next[id], status: ITEM_OK };
      });
      return { ...current, items: next };
    });

  const uploadSignature = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setSignature(await readScaledImage(file));
    } catch {
      alert("Зургийг уншиж чадсангүй. Өөр зураг сонгоно уу.");
    }
  };

  /** Labels of what is still missing, in form order. */
  const missing = (sheet) => {
    const list = [];
    if (!/^[0-9]+$/.test(inspection.odometer)) list.push("Одометрийн заалт (км)");
    sheet.forEach(({ title, items }) =>
      items.forEach(({ id, label }) => {
        if (!ITEM_STATUSES.includes(inspection.items[id]?.status)) list.push(`${title} - ${label}`);
      })
    );
    if (!inspection.result) list.push("Тэнцсэн / Тэнцээгүй");
    if (!inspection.note.trim()) list.push("Механик дүгнэлт");
    if (!inspection.mechanic.trim()) list.push("Хянасан механикийн нэр");
    if (!/^[0-9]+$/.test(inspection.mechanicPhone)) list.push("Механикийн утасны дугаар");
    if (!signature) list.push("Механикийн гарын үсэг");
    return list;
  };

  // A small copy is stored for the consolidated email.
  const signatureThumb = () => scaleDataUrl(signature, 320, { quality: 0.6, force: true });

  return { inspection, setInspection, update, setItem, markGroupOk, signature, uploadSignature, missing, signatureThumb };
}

function OdometerFields({ inspection, update }) {
  return (
    <div className="twoCols topGap">
      <Field label="Одометрийн заалт (км) *">
        <input
          required
          inputMode="numeric"
          value={inspection.odometer}
          onChange={(e) => update("odometer", digitsOnly(e.target.value))}
          placeholder="Жишээ: 152340"
        />
      </Field>
      <Field label="Мото цаг">
        <input
          inputMode="decimal"
          value={inspection.motoHours}
          onChange={(e) => update("motoHours", e.target.value.replace(/[^0-9.,]/g, ""))}
          placeholder="Жишээ: 4200"
        />
      </Field>
    </div>
  );
}

/** The Авто машин үзлэгийн хуудас items, group by group. */
function SheetSections({ sheet, hasCount, inspection, setItem, markGroupOk }) {
  const allItems = sheet.flatMap(({ items }) => items);
  const marked = allItems.filter(({ id }) => inspection.items[id]?.status).length;
  const badCount = allItems.filter(({ id }) => inspection.items[id]?.status === ITEM_BAD).length;

  return (
    <>
      <p className="progressNote" role="status">
        <ClipboardList size={16} aria-hidden="true" />
        Шалгасан: {marked}/{allItems.length}
        {badCount > 0 && <span className="badCount"> · Хэвийн бус: {badCount}</span>}
      </p>

      {sheet.map(({ title, items }) => {
        const groupMarked = items.filter(({ id }) => inspection.items[id]?.status).length;
        return (
          <Section key={title} title={title} icon={<ClipboardList size={18} />} badge={`${groupMarked}/${items.length}`}>
            {groupMarked < items.length && (
              <button type="button" className="markAllBtn" onClick={() => markGroupOk(items)}>
                Үлдсэнийг "Хэвийн" болгох
              </button>
            )}
            <div className="inspectList">
              {items.map(({ id, label }) => {
                const item = inspection.items[id] || {};
                return (
                  <div className={`inspectRow${item.status === ITEM_BAD ? " bad" : ""}`} key={id}>
                    <span className="inspectLabel">{label}</span>
                    <div className="choiceRow compact" role="radiogroup" aria-label={label}>
                      {ITEM_STATUSES.map((status) => (
                        <button
                          key={status}
                          type="button"
                          role="radio"
                          aria-checked={item.status === status}
                          className={`${item.status === status ? "active" : ""} ${status === ITEM_BAD ? "fail" : "pass"}`}
                          onClick={() => setItem(id, { status })}
                        >
                          {status}
                        </button>
                      ))}
                    </div>
                    <div className={`inspectExtra${hasCount ? " withCount" : ""}`}>
                      {hasCount && (
                        <input
                          inputMode="numeric"
                          value={item.count || ""}
                          onChange={(e) => setItem(id, { count: digitsOnly(e.target.value) })}
                          placeholder="Тоо"
                          aria-label={`${label} - тоо`}
                        />
                      )}
                      <input
                        value={item.note || ""}
                        onChange={(e) => setItem(id, { note: e.target.value })}
                        placeholder={item.status === ITEM_BAD ? "Тэмдэглэл: юу нь хэвийн бус вэ?" : "Тэмдэглэл"}
                        aria-label={`${label} - тэмдэглэл`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>
        );
      })}
    </>
  );
}

/** Result, conclusion, mechanic and signature. */
function ConclusionSection({ inspection, update, signature, uploadSignature }) {
  return (
    <Section title="Механик дүгнэлт" icon={<ShieldCheck size={18} />}>
      <ChoiceField
        label="Тээврийн хэрэгсэл аялалд гарах *"
        options={MECHANIC_RESULTS}
        value={inspection.result}
        onChange={(result) => update("result", result)}
        tone={(option) => (option === MECHANIC_FAIL ? "fail" : "pass")}
      />

      <Field label="Механик дүгнэлт *">
        <textarea
          required
          rows={4}
          value={inspection.note}
          onChange={(e) => update("note", e.target.value)}
          placeholder={inspection.result === MECHANIC_FAIL ? "Ямар гэмтэл, дутагдал илэрсэн, юу засах шаардлагатай вэ?" : "Үзлэгийн дүгнэлт"}
        />
      </Field>

      <Field label="Тайлбар">
        <textarea
          rows={2}
          value={inspection.remarks}
          onChange={(e) => update("remarks", e.target.value)}
          placeholder="Нэмэлт тайлбар (заавал биш)"
        />
      </Field>

      <div className="twoCols">
        <Field label="Хянасан механик *">
          <input
            required
            value={inspection.mechanic}
            onChange={(e) => update("mechanic", e.target.value)}
            placeholder="Овог нэр"
          />
        </Field>
        <Field label="Утасны дугаар *">
          <input
            required
            type="tel"
            inputMode="numeric"
            pattern="[0-9]+"
            value={inspection.mechanicPhone}
            onChange={(e) => update("mechanicPhone", digitsOnly(e.target.value))}
            placeholder="Жишээ: 99112233"
          />
        </Field>
      </div>

      <div className="signatureBox">
        <div className="signatureHeader">
          <span>Механикийн гарын үсэг</span>
          <label className="uploadSignature">
            <input type="file" accept="image/*" onChange={uploadSignature} />
            <span>Зураг сонгох</span>
          </label>
        </div>

        {signature ? (
          <img className="signaturePreview" src={signature} alt="Гарын үсэг" />
        ) : (
          <div className="signaturePlaceholder">Гарын үсгийн зураг оруулна уу</div>
        )}
      </div>
    </Section>
  );
}

function SubmitBar({ result, sending }) {
  return (
    <div className="submitArea">
      <button className="submitBtn" type="submit" disabled={!result || sending}>
        {sending
          ? "Илгээж байна..."
          : <><Send size={18} /> {result === MECHANIC_PASS ? "Баталгаажуулж илгээх" : "Илгээх"}</>}
      </button>
    </div>
  );
}

/**
 * Workflow B, step 1 (/mechanic#new): the mechanic inspects a vehicle
 * before any trip. A passed inspection returns the 6-digit code the
 * travelers enter on their form.
 */
export function NewInspection() {
  const password = sessionValue(MECHANIC_PASSWORD_KEY);
  const [tripType, setTripType] = useState(NORMAL_TRIP);
  const [vehicle, setVehicle] = useState({ make: "", plate: "", driver: "", driverPhone: "" });
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const state = useInspection();

  const sheet = inspectionSheetFor({ tripType });
  const hasCount = inspectionHasCount({ tripType });

  const changeTripType = (next) => {
    if (next === tripType) return;
    setTripType(next);
    // The two sheets have different items.
    state.setInspection((current) => ({ ...current, items: {} }));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (sending) return;

    const missing = [];
    if (!vehicle.make.trim()) missing.push("Автомашины марк");
    if (!/^[0-9]{4} [А-ЯӨҮЁ]{3}$/.test(vehicle.plate.trim())) missing.push("Улсын дугаар (9911 УБА)");
    if (!vehicle.driver.trim()) missing.push("Үзлэг хийсэн жолооч");
    if (!/^[0-9]+$/.test(vehicle.driverPhone)) missing.push("Жолоочийн утасны дугаар");
    missing.push(...state.missing(sheet));
    if (missing.length > 0) {
      alert(`Дутуу байна: ${missing[0]}`);
      return;
    }

    setSending(true);
    try {
      const data = await postJson("/api/workflow", {
        action: "inspect",
        password,
        tripType,
        vehicleMake: vehicle.make.trim(),
        vehiclePlate: vehicle.plate.trim(),
        driver: vehicle.driver.trim(),
        driverPhone: vehicle.driverPhone,
        inspection: state.inspection,
        signature: await state.signatureThumb()
      });
      setResult(data);
      window.scrollTo({ top: 0 });
    } catch (error) {
      alert(error.message || "Илгээхэд асуудал гарлаа. Та дахин оролдоно уу.");
    } finally {
      setSending(false);
    }
  };

  if (!password) {
    return (
      <Notice icon={<KeyRound size={44} strokeWidth={2.2} />} title="Нэвтэрнэ үү">
        <p>Шинэ үзлэг хийхийн өмнө механикийн жагсаалт руу нэвтэрнэ үү.</p>
      </Notice>
    );
  }

  if (result) {
    return result.code ? (
      <Notice icon={<CheckCircle2 size={44} strokeWidth={2.2} />} title="Үзлэг тэнцлээ">
        <p>Энэ кодыг жолооч эсвэл аяллын ахлагчид өгнө үү. Тэд аяллын хуудсаа бөглөхдөө оруулна.</p>
        <div className="bigCode" aria-label="Механикийн код">{result.code}</div>
        <p className="helper">
          {tripType} · {vehicle.make}, {vehicle.plate} · {new Date(result.expiresAt).toLocaleString("mn-MN")} хүртэл хүчинтэй, нэг удаа ашиглана.
        </p>
      </Notice>
    ) : (
      <Notice icon={<AlertTriangle size={44} strokeWidth={2.2} />} tone="error" title="Үзлэгт тэнцээгүй">
        <p>Үзлэг хадгалагдлаа. Тэнцээгүй машинд код олгогдохгүй тул энэ машинаар аялал хийх боломжгүй. Засварын дараа дахин үзлэг хийнэ үү.</p>
      </Notice>
    );
  }

  return (
    <main className="page">
      <AppBar />
      <div className="formCard">
        <BackToList />
        <header className="hero hero--mechanic">
          <span className="heroChip">Шинэ үзлэг</span>
          <h1>Авто машин үзлэгийн хуудас</h1>
          <p>Тэнцсэн үзлэгт 6 оронтой код олгогдоно.</p>
        </header>

        <form onSubmit={submit}>
          <div className="segmented" role="radiogroup" aria-label="Аяллын төрөл">
            {TRIP_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                role="radio"
                aria-checked={tripType === type}
                className={tripType === type ? "active" : ""}
                onClick={() => changeTripType(type)}
              >
                {type === BLAST_TRIP ? <Bomb size={17} /> : <Car size={17} />}
                {type}
              </button>
            ))}
          </div>

          <Section title="Тээврийн хэрэгсэл" icon={<Gauge size={18} />}>
            <div className="twoCols">
              <Field label="Автомашины марк *">
                <input
                  required
                  value={vehicle.make}
                  onChange={(e) => setVehicle({ ...vehicle, make: e.target.value })}
                  placeholder="Жишээ: Toyota Land Cruiser"
                />
              </Field>
              <Field label="Улсын дугаар *">
                <div className="vehiclePlate">
                  <span className="plateCountry" aria-hidden="true">MNG</span>
                  <input
                    required
                    aria-label="Улсын дугаар"
                    value={vehicle.plate}
                    onChange={(e) => {
                      const value = e.target.value.toUpperCase().replace(/[\s-]/g, "");
                      setVehicle({ ...vehicle, plate: value.length > 4 ? `${value.slice(0, 4)} ${value.slice(4)}` : value });
                    }}
                    pattern="[0-9]{4} [А-ЯӨҮЁ]{3}"
                    maxLength={8}
                    placeholder="9911 УБА"
                    title="4 орон тоо, 3 кирилл үсэг оруулна уу. Жишээ: 9911 УБА"
                  />
                </div>
              </Field>
            </div>
            <div className="twoCols">
              <Field label="Үзлэг хийсэн жолооч *">
                <input
                  required
                  value={vehicle.driver}
                  onChange={(e) => setVehicle({ ...vehicle, driver: e.target.value })}
                  placeholder="Овог нэр"
                />
              </Field>
              <Field label="Жолоочийн утас *">
                <input
                  required
                  type="tel"
                  inputMode="numeric"
                  value={vehicle.driverPhone}
                  onChange={(e) => setVehicle({ ...vehicle, driverPhone: digitsOnly(e.target.value) })}
                  placeholder="Жишээ: 99112233"
                />
              </Field>
            </div>
            <OdometerFields inspection={state.inspection} update={state.update} />
          </Section>

          <SheetSections sheet={sheet} hasCount={hasCount} inspection={state.inspection} setItem={state.setItem} markGroupOk={state.markGroupOk} />
          <ConclusionSection inspection={state.inspection} update={state.update} signature={state.signature} uploadSignature={state.uploadSignature} />
          <SubmitBar result={state.inspection.result} sending={sending} />
        </form>
      </div>
    </main>
  );
}

/**
 * A form saved before the approval workflow (travelers first), opened from
 * the /mechanic list. Once inspected, it goes on to the approvers.
 */
export default function MechanicForm() {
  const [token] = useState(mechanicToken);
  const [submission, setSubmission] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const state = useInspection();

  useEffect(() => {
    postJson("/api/mechanic", { token }).then(setSubmission, (error) => setLoadError(error.message));
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    if (sending) return;

    const missing = state.missing(submission.sheet);
    if (missing.length > 0) {
      alert(`Дутуу байна: ${missing[0]}`);
      return;
    }

    setSending(true);
    try {
      await postJson("/api/mechanic", { token, inspection: state.inspection, signature: await state.signatureThumb() });
      setDone(true);
      window.scrollTo({ top: 0 });
    } catch (error) {
      alert(error.message || "Илгээхэд асуудал гарлаа. Та дахин оролдоно уу.");
    } finally {
      setSending(false);
    }
  };

  if (done) {
    return (
      <Notice icon={<CheckCircle2 size={44} strokeWidth={2.2} />} title="Үзлэг илгээгдлээ">
        <p>Аяллын хуудас болон таны үзлэг батлах хоёр хүнд илгээгдлээ.</p>
      </Notice>
    );
  }
  if (submission?.done) {
    return (
      <Notice icon={<CheckCircle2 size={44} strokeWidth={2.2} />} title="Аль хэдийн шалгасан">
        <p>
          Энэ маягтыг {submission.done.mechanic} {new Date(submission.done.at).toLocaleString("mn-MN")}-д шалгаж
          илгээсэн ({submission.done.result}).
        </p>
      </Notice>
    );
  }
  if (loadError) {
    return (
      <Notice icon={<AlertTriangle size={44} strokeWidth={2.2} />} tone="error" title="Маягтыг нээж чадсангүй">
        <p>{loadError}</p>
      </Notice>
    );
  }
  if (!submission) return <Notice><p>Ачаалж байна...</p></Notice>;

  const value = (label) => submission.rows.find(([rowLabel]) => rowLabel === label)?.[1] || "-";

  return (
    <main className="page">
      <AppBar />
      <div className="formCard">
        <BackToList />
        <header className="hero hero--mechanic">
          <span className="heroChip">Механикийн үзлэг</span>
          <h1>Авто машин үзлэгийн хуудас</h1>
          <p>{submission.title}</p>
        </header>

        <form onSubmit={submit}>
          <Section title="Тээврийн хэрэгсэл" icon={<Gauge size={18} />}>
            <dl className="summaryList">
              <div><dt>Машины марк, улсын дугаар</dt><dd>{value("Автомашин")}</dd></div>
              <div><dt>Үзлэг хийсэн жолооч</dt><dd>{value("Жолооч")} · {value("Жолоочийн утасны дугаар")}</dd></div>
              <div><dt>Огноо</dt><dd>{new Date().toLocaleDateString("mn-MN")}</dd></div>
            </dl>

            <OdometerFields inspection={state.inspection} update={state.update} />

            <details className="submissionDetails">
              <summary>
                <FileText size={16} aria-hidden="true" /> Илгээсэн аяллын хуудсыг харах
                <ChevronDown size={16} aria-hidden="true" />
              </summary>
              <dl className="summaryList">
                {submission.rows
                  .filter(([, rowValue]) => rowValue)
                  .map(([label, rowValue]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{rowValue}</dd>
                    </div>
                  ))}
                {submission.employees.map((employee, index) => (
                  <div key={index}>
                    <dt>Зорчигч {index + 1}</dt>
                    <dd>{employee.name} · {employee.position} · {employee.phone}</dd>
                  </div>
                ))}
              </dl>
              {submission.signature && (
                <img className="signaturePreview summarySignature" src={submission.signature} alt="Гарын үсэг" />
              )}
            </details>
          </Section>

          <SheetSections sheet={submission.sheet} hasCount={submission.hasCount} inspection={state.inspection} setItem={state.setItem} markGroupOk={state.markGroupOk} />
          <ConclusionSection inspection={state.inspection} update={state.update} signature={state.signature} uploadSignature={state.uploadSignature} />
          <SubmitBar result={state.inspection.result} sending={sending} />
        </form>
      </div>
    </main>
  );
}
