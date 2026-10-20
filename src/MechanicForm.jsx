import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  FileText,
  Gauge,
  Send,
  ShieldCheck
} from "lucide-react";
import { AppBar, ChoiceField, Field, Section, readScaledImage } from "./ui";
import {
  ITEM_BAD,
  ITEM_OK,
  ITEM_STATUSES,
  MECHANIC_FAIL,
  MECHANIC_PASS,
  MECHANIC_RESULTS
} from "../api/_trips.js";

/** The signed token from a mechanic's link (…/#mechanic=<token>), if any. */
export function mechanicToken() {
  const match = /^#mechanic=([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(window.location.hash);
  return match ? match[1] : "";
}

const post = async (body) => {
  const response = await fetch("/api/mechanic", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Хүсэлт амжилтгүй боллоо.");
  return data;
};

const digitsOnly = (value) => value.replace(/[^0-9]/g, "");

const fromList = () => window.location.pathname.replace(/\/+$/, "") === "/mechanic";

function BackToList() {
  return fromList() ? (
    <a className="backLink" href="/mechanic"><ArrowLeft size={16} /> Жагсаалт руу буцах</a>
  ) : null;
}

/**
 * The mechanic's "Авто машин үзлэгийн хуудас", opened from the link in their
 * email. Shows the submitted trip, collects the inspection, and sends both
 * on to the final recipients.
 */
export default function MechanicForm() {
  const [token] = useState(mechanicToken);
  const [submission, setSubmission] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [inspection, setInspection] = useState({
    odometer: "",
    motoHours: "",
    mechanic: "",
    mechanicPhone: "",
    result: "",
    note: "",
    remarks: "",
    items: {}
  });
  const [signature, setSignature] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    post({ token }).then(setSubmission, (error) => setLoadError(error.message));
  }, [token]);

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

  const handleSignatureUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setSignature(await readScaledImage(file));
    } catch {
      alert("Зургийг уншиж чадсангүй. Өөр зураг сонгоно уу.");
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (sending) return;

    const missing = [];
    if (!/^[0-9]+$/.test(inspection.odometer)) missing.push("Одометрийн заалт (км)");
    submission.sheet.forEach(({ title, items }) =>
      items.forEach(({ id, label }) => {
        if (!ITEM_STATUSES.includes(inspection.items[id]?.status)) missing.push(`${title} - ${label}`);
      })
    );
    if (!inspection.result) missing.push("Тэнцсэн / Тэнцээгүй");
    if (!inspection.note.trim()) missing.push("Механик дүгнэлт");
    if (!inspection.mechanic.trim()) missing.push("Хянасан механикийн нэр");
    if (!/^[0-9]+$/.test(inspection.mechanicPhone)) missing.push("Механикийн утасны дугаар");
    if (!signature) missing.push("Механикийн гарын үсэг");

    if (missing.length > 0) {
      alert(`Дутуу байна: ${missing[0]}`);
      return;
    }

    setSending(true);
    try {
      await post({ token, inspection, signature });
      setDone(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      alert(error.message || "Илгээхэд асуудал гарлаа. Та дахин оролдоно уу.");
    } finally {
      setSending(false);
    }
  };

  if (done || loadError || !submission || submission.done) {
    return (
      <main className="page">
        <AppBar />
        <div className="successScreen">
          {done ? (
            <>
              <div className="successIcon"><CheckCircle2 size={44} strokeWidth={2.2} /></div>
              <h2>Үзлэг илгээгдлээ</h2>
              <p>Аяллын хуудас болон таны үзлэгийн хуудас хариуцсан ажилтнуудад илгээгдлээ.</p>
            </>
          ) : submission?.done ? (
            <>
              <div className="successIcon"><CheckCircle2 size={44} strokeWidth={2.2} /></div>
              <h2>Аль хэдийн шалгасан</h2>
              <p>
                Энэ маягтыг {submission.done.mechanic} {new Date(submission.done.at).toLocaleString("mn-MN")}-д шалгаж
                илгээсэн ({submission.done.result}).
              </p>
            </>
          ) : loadError ? (
            <>
              <div className="successIcon errorIcon"><AlertTriangle size={44} strokeWidth={2.2} /></div>
              <h2>Маягтыг нээж чадсангүй</h2>
              <p>{loadError}</p>
            </>
          ) : (
            <p>Ачаалж байна...</p>
          )}
          <BackToList />
        </div>
      </main>
    );
  }

  const value = (label) => submission.rows.find(([rowLabel]) => rowLabel === label)?.[1] || "-";
  const allItems = submission.sheet.flatMap(({ items }) => items);
  const marked = allItems.filter(({ id }) => inspection.items[id]?.status).length;
  const badCount = allItems.filter(({ id }) => inspection.items[id]?.status === ITEM_BAD).length;

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

          <p className="progressNote" role="status">
            <ClipboardList size={16} aria-hidden="true" />
            Шалгасан: {marked}/{allItems.length}
            {badCount > 0 && <span className="badCount"> · Хэвийн бус: {badCount}</span>}
          </p>

          {submission.sheet.map(({ title, items }) => {
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
                        <div className={`inspectExtra${submission.hasCount ? " withCount" : ""}`}>
                          {submission.hasCount && (
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
                  <input type="file" accept="image/*" onChange={handleSignatureUpload} />
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

          <div className="submitArea">
            <button className="submitBtn" type="submit" disabled={!inspection.result || sending}>
              {sending
                ? "Илгээж байна..."
                : <><Send size={18} /> {inspection.result === MECHANIC_PASS ? "Баталгаажуулж илгээх" : "Илгээх"}</>}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
