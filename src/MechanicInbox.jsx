import React, { useEffect, useState } from "react";
import { Bomb, Car, ChevronRight, Lock, LogOut, Plus, RefreshCw, Wrench } from "lucide-react";
import { AppBar, Field, formatTime, postJson, sessionValue, setSessionValue } from "./ui";
import { MECHANIC_PASSWORD_KEY } from "./MechanicForm";
import { stageLabel, stageTone } from "./stages";
import { BLAST_TRIP } from "../api/_trips.js";

/**
 * /mechanic: behind the shared mechanic password. Starts new inspections
 * (workflow B, step 1), lists them with their codes and stages, and lists
 * forms saved before the approval workflow that still wait for a mechanic.
 */
export default function MechanicInbox() {
  const [password, setPassword] = useState(() => sessionValue(MECHANIC_PASSWORD_KEY));
  const [typed, setTyped] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("open");

  const load = async (secret = password) => {
    setLoading(true);
    setError("");
    try {
      const result = await postJson("/api/workflow", { action: "mechanicList", password: secret });
      setSessionValue(MECHANIC_PASSWORD_KEY, secret);
      setPassword(secret);
      setData(result);
    } catch (loadError) {
      if (loadError.status === 401) {
        setSessionValue(MECHANIC_PASSWORD_KEY, "");
        setPassword("");
      }
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (password) load(password);
  }, []);

  const logOut = () => {
    setSessionValue(MECHANIC_PASSWORD_KEY, "");
    setPassword("");
    setData(null);
    setTyped("");
  };

  if (!password || !data) {
    return (
      <main className="page">
        <AppBar />
        <div className="formCard">
          <header className="hero hero--mechanic">
            <span className="heroChip">Механик</span>
            <h1>Механикийн үзлэг</h1>
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

  const open = data.inspections.filter((item) => item.stage === "waiting_travel");
  const others = data.inspections.filter((item) => item.stage !== "waiting_travel");
  const shown = tab === "open" ? open : others;

  return (
    <main className="page">
      <AppBar />
      <div className="formCard">
        <header className="hero hero--mechanic">
          <span className="heroChip">Механик</span>
          <h1>Механикийн үзлэг</h1>
          <p>Аялалд гарах машиныг эхлээд шалгаж, тэнцвэл гарах кодыг жолоочид өгнө.</p>
        </header>

        <a className="submitBtn inline newInspection" href="/mechanic#new">
          <Plus size={18} /> Шинэ үзлэг хийх
        </a>

        <div className="inboxBar">
          <div className="choiceRow" role="tablist">
            <button type="button" role="tab" aria-selected={tab === "open"} className={tab === "open" ? "active" : ""} onClick={() => setTab("open")}>
              Код хүлээж буй ({open.length})
            </button>
            <button type="button" role="tab" aria-selected={tab === "others"} className={tab === "others" ? "active" : ""} onClick={() => setTab("others")}>
              Бусад ({others.length})
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
            <p>{tab === "open" ? "Аялагч хүлээж буй үзлэг алга." : "Өөр үзлэг алга."}</p>
          </div>
        ) : (
          <ul className="inboxList">
            {shown.map((item) => (
              <li key={item.id}>
                <div className="inboxItem">
                  <span className={`inboxIcon${item.tripType === BLAST_TRIP ? " blast" : ""}`}>
                    {item.tripType === BLAST_TRIP ? <Bomb size={18} /> : <Car size={18} />}
                  </span>
                  <span className="inboxText">
                    <strong>{item.summary.vehicle}</strong>
                    <span>{item.summary.driver} · {item.mechanic} · {formatTime(item.createdAt)}</span>
                    {item.summary.people.length > 0 && <small>{item.summary.people.join(", ")}</small>}
                    <small className={`stage stage--${stageTone(item.stage)}`}>{stageLabel(item.stage)}</small>
                  </span>
                  {item.code && item.stage === "waiting_travel" && <span className="codeBadge">{item.code}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}

        {data.legacy.length > 0 && (
          <>
            <h2 className="listHeading">Өмнөх маягтууд (механик хүлээж буй)</h2>
            <ul className="inboxList">
              {data.legacy.map(({ id, token, createdAt, summary }) => (
                <li key={id}>
                  <a className="inboxItem" href={`/mechanic#mechanic=${token}`}>
                    <span className={`inboxIcon${summary.tripType === BLAST_TRIP ? " blast" : ""}`}>
                      {summary.tripType === BLAST_TRIP ? <Bomb size={18} /> : <Car size={18} />}
                    </span>
                    <span className="inboxText">
                      <strong>{summary.vehicle || "-"}</strong>
                      <span>{summary.driver} · {summary.date} · {summary.direction}</span>
                      <small>{summary.tripType} · {(summary.people || []).join(", ")} · {formatTime(createdAt)}</small>
                    </span>
                    <ChevronRight size={18} aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </main>
  );
}
