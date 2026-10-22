import React from "react";
import companyLogo from "./assets/logos/erkhet-tunsh.svg";

const SIGNATURE_MAX_EDGE = 900;

/** Scales an image data URL down to fit maxEdge, re-encoding as JPEG. */
export function scaleDataUrl(dataUrl, maxEdge, { quality = 0.85, force = false } = {}) {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onerror = () => reject(new Error("decode failed"));
    image.onload = () => {
      const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));

      if (!force && scale === 1 && dataUrl.length < 700_000) {
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

      resolve(canvas.toDataURL("image/jpeg", quality));
    };

    image.src = dataUrl;
  });
}

/**
 * Reads a signature image and scales it down, so a phone photo does not
 * exceed the request body limit once base64-encoded.
 */
export function readScaledImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error("read failed"));
    reader.onload = () => scaleDataUrl(reader.result, SIGNATURE_MAX_EDGE).then(resolve, reject);

    reader.readAsDataURL(file);
  });
}

// Session storage can be unavailable (private mode, blocked site data), in
// which case the password is simply asked for again.
export function sessionValue(key) {
  try {
    return sessionStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

export function setSessionValue(key, value) {
  try {
    if (value) sessionStorage.setItem(key, value);
    else sessionStorage.removeItem(key);
  } catch {
    // Not remembered.
  }
}

/** POSTs JSON to an /api route; throws the server's error message. */
export async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "Хүсэлт амжилтгүй боллоо.");
    error.status = response.status;
    throw error;
  }
  return data;
}

export const formatTime = (ms) =>
  new Date(ms).toLocaleString("mn-MN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

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

export function AppBar() {
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

export function Section({ title, icon, badge, children }) {
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

/**
 * A labelled row of choice buttons. Not a <label>, which would forward
 * every click to its first button.
 */
export function ChoiceField({ label, options, value, onChange, tone }) {
  return (
    <div className="field" role="radiogroup" aria-label={label}>
      <span>{label}</span>
      <div className="choiceRow">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={value === option}
            className={`${value === option ? "active" : ""} ${tone?.(option) || ""}`}
            onClick={() => onChange(option)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
