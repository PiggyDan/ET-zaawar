import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Bomb,
  Car,
  Check,
  ChevronDown,
  ChevronRight,
  Camera,
  ClipboardList,
  FileText,
  History,
  Lock,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Users,
  X
} from "lucide-react";
import { AppBar, Field, Section, formatTime, postJson, sessionValue, setSessionValue } from "./ui";
import { stageLabel, stageTone } from "./stages";
import { BLAST_TRIP, ITEM_BAD, MECHANIC_PASS } from "../api/_trips.js";

const PASSWORD_KEY = "approverPassword";

/** The request id from /approve#request=<id>, if any. */
const requestIdFromHash = () => /^#request=([0-9a-f-]{36})$/.exec(window.location.hash)?.[1] || "";

const workflowLabel = (request) => (request.workflow === "B" ? "Механик үзлэгтэй" : "АТҮТ · механикгүй");

/**
 * /approve: the approver's page. Lists requests that wait for the
 * signed-in approver, and opens one to approve or reject. The consolidated
 * email goes out once every approver has approved.
 */
export default function ApprovalPage() {
  const [password, setPassword] = useState(() => sessionValue(PASSWORD_KEY));
  const [typed, setTyped] = useState("");
  const [me, setMe] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const requestId = requestIdFromHash();

  const signIn = async (secret) => {
    setLoading(true);
    setError("");
    try {
      const result = await postJson("/api/workflow", { action: "approvals", password: secret });
      setSessionValue(PASSWORD_KEY, secret);
      setPassword(secret);
      setMe(result.approver);
    } catch (signInError) {
      setSessionValue(PASSWORD_KEY, "");
      setPassword("");
      setError(signInError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (password) signIn(password);
  }, []);

  const logOut = () => {
    setSessionValue(PASSWORD_KEY, "");
    setPassword("");
    setMe(null);
    setTyped("");
  };

  if (!password || !me) {
    return (
      <main className="page">
        <AppBar />
        <div className="formCard">
          <header className="hero hero--approve">
            <span className="heroChip">Батлах</span>
            <h1>Аяллын хүсэлт батлах</h1>
            <p>Өөрийн нууц үгээр нэвтэрнэ үү.</p>
          </header>
          <form
            className="section loginCard"
            onSubmit={(e) => {
              e.preventDefault();
              if (typed) signIn(typed);
            }}
          >
            <Field label="Нууц үг">
              <input type="password" autoComplete="current-password" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
            </Field>
            {error && <p className="formError" role="alert">{error}</p>}
            <button className="submitBtn inline" type="submit" disabled={!typed || loading}>
              <Lock size={17} /> {loading ? "Шалгаж байна..." : "Нэвтрэх"}
            </button>
          </form>
        </div>
      </main>
    );
  }

  return requestId
    ? <RequestDetail id={requestId} password={password} me={me} />
    : <RequestList password={password} me={me} onLogOut={logOut} />;
}

function RequestList({ password, me, onLogOut }) {
  const [requests, setRequests] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("mine");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setRequests((await postJson("/api/workflow", { action: "approvals", password })).requests);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const mine = (requests || []).filter(
    (request) => request.stage === "waiting_approval" && !request.decisions.some((decision) => decision.key === me.key)
  );
  const others = (requests || []).filter((request) => !mine.includes(request));
  const shown = tab === "mine" ? mine : others;

  return (
    <main className="page">
      <AppBar />
      <div className="formCard">
        <header className="hero hero--approve">
          <span className="heroChip">{me.name}</span>
          <h1>Аяллын хүсэлт батлах</h1>
          <p>Батлагдсаны дараа нэгдсэн имэйл илгээгдэнэ.</p>
        </header>

        <div className="inboxBar">
          <div className="choiceRow" role="tablist">
            <button type="button" role="tab" aria-selected={tab === "mine"} className={tab === "mine" ? "active" : ""} onClick={() => setTab("mine")}>
              Миний батлах ({mine.length})
            </button>
            <button type="button" role="tab" aria-selected={tab === "others"} className={tab === "others" ? "active" : ""} onClick={() => setTab("others")}>
              Бусад ({others.length})
            </button>
          </div>
          <button type="button" className="iconBtn" onClick={load} aria-label="Шинэчлэх" disabled={loading}>
            <RefreshCw size={18} className={loading ? "spin" : ""} />
          </button>
          <button type="button" className="iconBtn" onClick={onLogOut} aria-label="Гарах">
            <LogOut size={18} />
          </button>
        </div>

        {error && <p className="formError" role="alert">{error}</p>}

        {!requests ? (
          <p className="emptyInbox">Ачаалж байна...</p>
        ) : shown.length === 0 ? (
          <div className="emptyInbox">
            <ShieldCheck size={28} aria-hidden="true" />
            <p>{tab === "mine" ? "Таны батлах хүсэлт алга." : "Өөр хүсэлт алга."}</p>
          </div>
        ) : (
          <ul className="inboxList">
            {shown.map((request) => (
              <li key={request.id}>
                <a className="inboxItem" href={`/approve#request=${request.id}`}>
                  <span className={`inboxIcon${request.tripType === BLAST_TRIP ? " blast" : ""}`}>
                    {request.tripType === BLAST_TRIP ? <Bomb size={18} /> : <Car size={18} />}
                  </span>
                  <span className="inboxText">
                    <strong>{request.summary.direction || request.summary.vehicle}</strong>
                    <span>{request.summary.date} · {request.summary.people.join(", ")}</span>
                    <small>{request.tripType} · {workflowLabel(request)} · {formatTime(request.createdAt)}</small>
                    <small className={`stage stage--${stageTone(request.stage)}`}>
                      {stageLabel(request.stage)}
                      {request.decisions.length > 0 && ` · ${request.decisions.map((d) => `${d.name}: ${d.decision === "approve" ? "✓" : "✕"}`).join(", ")}`}
                    </small>
                  </span>
                  <ChevronRight size={18} aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

function RequestDetail({ id, password, me }) {
  const [request, setRequest] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");

  const load = async () => {
    try {
      setRequest((await postJson("/api/workflow", { action: "request", password, id })).request);
    } catch (loadError) {
      setError(loadError.message);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  const act = async (body) => {
    if (busy) return;
    setBusy(true);
    try {
      await postJson("/api/workflow", { password, id, ...body });
      setRejecting(false);
      setNote("");
    } catch (actError) {
      alert(actError.message);
    } finally {
      setBusy(false);
      load();
      window.scrollTo({ top: 0 });
    }
  };

  const back = <a className="backLink" href="/approve"><ArrowLeft size={16} /> Жагсаалт руу буцах</a>;

  if (error || !request) {
    return (
      <main className="page">
        <AppBar />
        <div className="successScreen">
          {error ? (
            <>
              <div className="successIcon errorIcon"><AlertTriangle size={44} strokeWidth={2.2} /></div>
              <h2>Хүсэлтийг нээж чадсангүй</h2>
              <p>{error}</p>
            </>
          ) : (
            <p>Ачаалж байна...</p>
          )}
          {back}
        </div>
      </main>
    );
  }

  const myDecision = request.decisions.find((decision) => decision.key === me.key);
  const canDecide = request.stage === "waiting_approval" && !myDecision;
  const inspection = request.inspection;
  const badItems = inspection
    ? inspection.sheet.flatMap(({ title, items }) =>
        items
          .filter(({ id: itemId }) => inspection.items[itemId]?.status === ITEM_BAD)
          .map(({ id: itemId, label }) => ({ title, label, note: inspection.items[itemId].note }))
      )
    : [];

  return (
    <main className="page">
      <AppBar />
      <div className="formCard">
        {back}
        <header className={`hero ${request.tripType === BLAST_TRIP ? "hero--blast" : "hero--approve"}`}>
          <span className="heroChip">{workflowLabel(request)}</span>
          <h1>{request.summary.direction || request.tripType}</h1>
          <p>{request.title}</p>
        </header>

        <div className={`stageBanner stage--${stageTone(request.stage)}`} role="status">
          <strong>{stageLabel(request.stage)}</strong>
          {myDecision && <span>Таны шийдвэр: {myDecision.decision === "approve" ? "Зөвшөөрсөн" : "Татгалзсан"}</span>}
        </div>

        <Section title="Аяллын мэдээлэл" icon={<FileText size={18} />}>
          <dl className="summaryList">
            {request.rows
              .filter(([, value]) => value)
              .map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
          </dl>
          {request.signature && <img className="signaturePreview summarySignature" src={request.signature} alt="Гарын үсэг" />}
        </Section>

        <Section title={request.tripType === BLAST_TRIP ? "Тэсэлгээний баг" : "Зорчигчид"} icon={<Users size={18} />} badge={String(request.employees.length)}>
          <dl className="summaryList">
            {request.employees.map((employee, index) => (
              <div key={index}>
                <dt>{index + 1}. {employee.name}</dt>
                <dd>{[employee.position, employee.phone].filter(Boolean).join(" · ")}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section title="Зураг" icon={<Camera size={18} />} badge={String(request.photos.length)}>
          {request.photos.length === 0 ? (
            <p className="helper">Зураггүй (зураг нэмэхээс өмнөх маягт).</p>
          ) : (
            <ul className="photoGrid photoGrid--view">
              {request.photos.map((photo, index) => (
                <li key={index} className="photoTile">
                  <img src={photo} alt={`Зураг ${index + 1}`} />
                  <span className="photoNumber">{index + 1}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {inspection && (
          <Section title="Механикийн үзлэг" icon={<ClipboardList size={18} />}>
            <dl className="summaryList">
              <div>
                <dt>Дүгнэлт</dt>
                <dd className={inspection.result === MECHANIC_PASS ? "resultPass" : "resultFail"}>{inspection.result}</dd>
              </div>
              <div><dt>Автомашин</dt><dd>{inspection.vehicle}</dd></div>
              <div><dt>Механик</dt><dd>{inspection.mechanic} · {inspection.mechanicPhone}</dd></div>
              <div><dt>Огноо</dt><dd>{formatTime(inspection.at)}</dd></div>
              <div><dt>Одометр</dt><dd>{inspection.odometer} км</dd></div>
              <div><dt>Механик дүгнэлт</dt><dd>{inspection.note}</dd></div>
              <div>
                <dt>Хэвийн бус</dt>
                <dd>{badItems.length === 0 ? "Байхгүй" : badItems.map((item) => `${item.label}${item.note ? ` (${item.note})` : ""}`).join("; ")}</dd>
              </div>
            </dl>
            <details className="submissionDetails">
              <summary>
                <ClipboardList size={16} aria-hidden="true" /> Үзлэгийн хуудсыг бүтнээр харах
                <ChevronDown size={16} aria-hidden="true" />
              </summary>
              <dl className="summaryList">
                {inspection.sheet.flatMap(({ title, items }) =>
                  items.map(({ id: itemId, label }) => {
                    const item = inspection.items[itemId] || {};
                    return (
                      <div key={itemId}>
                        <dt>{title} · {label}</dt>
                        <dd className={item.status === ITEM_BAD ? "resultFail" : ""}>
                          {item.status}{item.count ? ` · тоо ${item.count}` : ""}{item.note ? ` · ${item.note}` : ""}
                        </dd>
                      </div>
                    );
                  })
                )}
              </dl>
            </details>
          </Section>
        )}

        <Section title="Түүх" icon={<History size={18} />}>
          <ol className="timeline">
            {request.history.map((event, index) => (
              <li key={index}>
                <span className="timelineWhen">{formatTime(event.at)}</span>
                <span>{event.what}{event.who ? ` — ${event.who}` : ""}</span>
              </li>
            ))}
          </ol>
        </Section>

        {canDecide && (
          <Section title="Шийдвэр" icon={<ShieldCheck size={18} />}>
            {rejecting ? (
              <>
                <Field label="Татгалзсан шалтгаан *">
                  <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Юуг засах шаардлагатай вэ?" autoFocus />
                </Field>
                <div className="decisionRow">
                  <button type="button" className="secondaryBtn" onClick={() => setRejecting(false)} disabled={busy}>Болих</button>
                  <button
                    type="button"
                    className="rejectBtn"
                    disabled={!note.trim() || busy}
                    onClick={() => act({ action: "decide", decision: "reject", note })}
                  >
                    <X size={18} /> Татгалзах
                  </button>
                </div>
              </>
            ) : (
              <div className="decisionRow">
                <button type="button" className="rejectBtn outline" onClick={() => setRejecting(true)} disabled={busy}>
                  <X size={18} /> Татгалзах
                </button>
                <button type="button" className="approveBtn" onClick={() => act({ action: "decide", decision: "approve" })} disabled={busy}>
                  <Check size={18} /> {busy ? "Илгээж байна..." : "Зөвшөөрөх"}
                </button>
              </div>
            )}
          </Section>
        )}

        {request.stage === "approved" && (
          <Section title="Имэйл илгээгдээгүй" icon={<AlertTriangle size={18} />}>
            <p className="helper">Батлагдсан боловч нэгдсэн имэйл илгээгдээгүй байна. Дахин оролдоно уу.</p>
            <button type="button" className="approveBtn" onClick={() => act({ action: "resend" })} disabled={busy}>
              {busy ? "Илгээж байна..." : "Имэйл илгээх"}
            </button>
          </Section>
        )}
      </div>
    </main>
  );
}
