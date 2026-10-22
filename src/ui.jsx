import React, { useEffect, useRef } from "react";
import { ImagePlus, RefreshCw, X } from "lucide-react";
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

const PHOTO_MAX_EDGE = 1280;

/**
 * Reads a photo and re-encodes it smaller, so several phone photos fit in
 * one request (the server allows up to 900 KB each).
 */
export function readPhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read failed"));
    reader.onload = () => scaleDataUrl(reader.result, PHOTO_MAX_EDGE, { quality: 0.7, force: true }).then(resolve, reject);
    reader.readAsDataURL(file);
  });
}

/**
 * Draw-to-sign field for mouse, pen or finger. `value` is a PNG data URL,
 * or "" when empty; clearing the value from outside clears the pad.
 */
export function SignaturePad({ label, value, onChange }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const last = useRef(null);

  // Size the canvas to its box at the screen's pixel density.
  useEffect(() => {
    const canvas = canvasRef.current;
    const fit = () => {
      const { width, height } = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      if (canvas.width === Math.round(width * ratio)) return;
      const previous = canvas.width ? canvas.toDataURL() : null;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      const context = canvas.getContext("2d");
      context.scale(ratio, ratio);
      context.lineWidth = 2.4;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.strokeStyle = "#101828";
      if (previous && value) {
        const image = new Image();
        image.onload = () => context.drawImage(image, 0, 0, width, height);
        image.src = previous;
      }
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  useEffect(() => {
    if (value) return;
    const canvas = canvasRef.current;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
  }, [value]);

  const point = (event) => {
    const box = canvasRef.current.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  };

  const start = (event) => {
    event.preventDefault();
    canvasRef.current.setPointerCapture(event.pointerId);
    drawing.current = true;
    last.current = point(event);
    const context = canvasRef.current.getContext("2d");
    context.beginPath();
    context.arc(last.current.x, last.current.y, 1.2, 0, Math.PI * 2);
    context.fillStyle = "#101828";
    context.fill();
  };

  const move = (event) => {
    if (!drawing.current) return;
    const next = point(event);
    const context = canvasRef.current.getContext("2d");
    context.beginPath();
    context.moveTo(last.current.x, last.current.y);
    context.lineTo(next.x, next.y);
    context.stroke();
    last.current = next;
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(canvasRef.current.toDataURL("image/png"));
  };

  return (
    <div className="signatureBox">
      <div className="signatureHeader">
        <span>{label}</span>
        <button type="button" className="clearSignature" onClick={() => onChange("")} disabled={!value}>
          Гарын үсэг арилгах
        </button>
      </div>
      <div className="signaturePadWrap">
        <canvas
          ref={canvasRef}
          className="signaturePad"
          aria-label={`${label}: хулгана эсвэл хуруугаар зурна уу`}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
        />
        {!value && <span className="signatureHint" aria-hidden="true">Энд гарын үсгээ зурна уу</span>}
      </div>
    </div>
  );
}

/**
 * Several photos with previews; each can be replaced or removed. `photos`
 * is a list of shrunk JPEG data URLs.
 */
export function PhotoPicker({ photos, onChange, min, max }) {
  const add = async (event) => {
    const files = [...(event.target.files || [])].slice(0, max - photos.length);
    event.target.value = "";
    try {
      onChange([...photos, ...(await Promise.all(files.map(readPhoto)))]);
    } catch {
      alert("Зургийг уншиж чадсангүй. Өөр зураг сонгоно уу.");
    }
  };

  const replace = async (index, event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const next = [...photos];
      next[index] = await readPhoto(file);
      onChange(next);
    } catch {
      alert("Зургийг уншиж чадсангүй. Өөр зураг сонгоно уу.");
    }
  };

  return (
    <div className="photoPicker">
      <p className={`helper${photos.length > 0 && photos.length < min ? " helperWarn" : ""}`}>
        {photos.length}/{max} зураг · Хамгийн багадаа {min} зураг шаардлагатай.
      </p>
      {photos.length > 0 && (
        <ul className="photoGrid">
          {photos.map((photo, index) => (
            <li key={index} className="photoTile">
              <img src={photo} alt={`Зураг ${index + 1}`} />
              <span className="photoNumber">{index + 1}</span>
              <label className="photoAction" title="Солих">
                <input type="file" accept="image/*" onChange={(event) => replace(index, event)} />
                <RefreshCw size={15} aria-hidden="true" />
                <span className="srOnly">Зураг {index + 1} солих</span>
              </label>
              <button
                type="button"
                className="photoAction photoRemove"
                onClick={() => onChange(photos.filter((_, i) => i !== index))}
                aria-label={`Зураг ${index + 1} устгах`}
              >
                <X size={15} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {photos.length < max && (
        <label className="addBtn photoAdd">
          <input type="file" accept="image/*" multiple onChange={add} />
          <ImagePlus size={17} aria-hidden="true" /> Зураг нэмэх
        </label>
      )}
    </div>
  );
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
