import React, { useEffect, useState } from "react";
import { Bomb, Car, ChevronRight, Lock, LogOut, RefreshCw, Wrench } from "lucide-react";
import { AppBar, Field } from "./ui";
import { BLAST_TRIP, MECHANIC_PASS } from "../api/_trips.js";

const PASSWORD_KEY = "mechanicPassword";

// Session storage can be unavailable (private mode, blocked site data).
const remembered = () => {
  try {
    return sessionStorage.getItem(PASSWORD_KEY) || "";
  } catch {
    return "";
  }
};

const remember = (value) => {
  try {
    if (value) sessionStorage.setItem(PASSWORD_KEY, value);
    else sessionStorage.removeItem(PASSWORD_KEY);
  } catch {
    // Not remembered; the mechanic types it again next time.
  }
};

const formatTime = (ms) =>
  new Date(ms).toLocaleString("mn-MN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

/**
 * /mechanic: every submission waiting for a vehicle inspection, behind the
 * shared mechanic password. Opening one goes to the inspection form.
 */
export default function MechanicInbox() {
  const [password, setPassword] = useState(remembered);
  const [typed, setTyped] = useState("");
  const [records, setRecords] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("pending");

  const load = async (secret = password) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/mechanic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "list", password: secret })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401) {
          remember("");
          setPassword("");
        }
        throw new Error(data.error || "Жагсаалтыг ачаалж чадсангүй.");
      }
      remember(secret);
      setPassword(secret);
      setRecords(data.records);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (password) load(password);
  }, []);

  const logOut = () => {
    remember("");
    setPassword("");
    setRecords(null);
    setTyped("");
  };

  if (!password || !records) {
    return (
      <main className="page">
        <AppBar />
        <div className="formCard">
          <header className="hero hero--mechanic">
            <span className="heroChip">Механик</span>
            <h1>Үзлэг хүлээж буй маягтууд</h1>
            <p>Нэвтрэхийн тулд механикийн нууц үгээ оруулна уу.</p>
          </header>
          <form
            className="section loginCard"
            onSubmit={(e) => {
              e.preventDefault();
              if (typed) load(typed);
            }}
          >
            <Field label="Нууц үг">
              <input
                type="password"
                autoComplete="current-password"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoFocus
              />
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

  const pending = records.filter((record) => record.status !== "done");
  const done = records.filter((record) => record.status === "done");
  const shown = tab === "pending" ? pending : done;

  return (
    <main className="page">
      <AppBar />
      <div className="formCard">
        <header className="hero hero--mechanic">
          <span className="heroChip">Механик</span>
          <h1>Үзлэг хүлээж буй маягтууд</h1>
          <p>Маягтаа сонгоод авто машин үзлэгийн хуудсыг бөглөнө үү.</p>
        </header>

        <div className="inboxBar">
          <div className="choiceRow" role="tablist">
            <button type="button" role="tab" aria-selected={tab === "pending"} className={tab === "pending" ? "active" : ""} onClick={() => setTab("pending")}>
              Хүлээгдэж буй ({pending.length})
            </button>
            <button type="button" role="tab" aria-selected={tab === "done"} className={tab === "done" ? "active" : ""} onClick={() => setTab("done")}>
              Шалгасан ({done.length})
            </button>
          </div>
          <button type="button" className="iconBtn" onClick={() => load()} aria-label="Шинэчлэх" disabled={loading}>
            <RefreshCw size={18} className={loading ? "spin" : ""} />
          </button>
          <button type="button" className="iconBtn" onClick={logOut} aria-label="Гарах">
            <LogOut size={18} />
          </button>
        </div>

        {error && <p className="formError" role="alert">{error}</p>}

        {shown.length === 0 ? (
          <div className="emptyInbox">
            <Wrench size={28} aria-hidden="true" />
            <p>{tab === "pending" ? "Үзлэг хүлээж буй маягт алга." : "Шалгасан маягт алга."}</p>
          </div>
        ) : (
          <ul className="inboxList">
            {shown.map(({ id, token, createdAt, summary, done: doneInfo }) => {
              const isBlast = summary.tripType === BLAST_TRIP;
              const body = (
                <>
                  <span className={`inboxIcon${isBlast ? " blast" : ""}`}>
                    {isBlast ? <Bomb size={18} /> : <Car size={18} />}
                  </span>
                  <span className="inboxText">
                    <strong>{summary.vehicle || "-"}</strong>
                    <span>{summary.driver} · {summary.date} · {summary.direction}</span>
                    <small>
                      {summary.tripType} · {summary.people.join(", ")} · {formatTime(createdAt)}
                    </small>
                    {doneInfo && (
                      <small className={doneInfo.result === MECHANIC_PASS ? "resultPass" : "resultFail"}>
                        {doneInfo.result} · {doneInfo.mechanic} · {formatTime(doneInfo.at)}
                      </small>
                    )}
                  </span>
                  {!doneInfo && <ChevronRight size={18} aria-hidden="true" />}
                </>
              );
              return (
                <li key={id}>
                  {doneInfo ? (
                    <div className="inboxItem">{body}</div>
                  ) : (
                    <a className="inboxItem" href={`/mechanic#mechanic=${token}`}>{body}</a>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
