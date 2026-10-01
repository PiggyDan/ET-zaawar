import React, { useEffect, useRef, useState } from "react";

function Page({ document, number }) {
  const canvas = useRef(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let disposed = false;
    let task;
    document.getPage(number).then((page) => {
      if (disposed) return;
      const viewport = page.getViewport({ scale: 2 });
      canvas.current.width = viewport.width;
      canvas.current.height = viewport.height;
      task = page.render({ canvasContext: canvas.current.getContext("2d"), viewport });
      return task.promise;
    }).catch(() => { if (!disposed) setError(true); });
    return () => { disposed = true; task?.cancel(); };
  }, [document, number]);

  return error ? <p role="alert">{number}-р хуудсыг харуулахад алдаа гарлаа.</p> : (
    <canvas ref={canvas} role="img" aria-label={`Журмын ${number}-р хуудас`} />
  );
}

export default function SafetyReader({ onClose }) {
  const dialog = useRef(null);
  const [document, setDocument] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    dialog.current.showModal();
    const previousOverflow = window.document.body.style.overflow;
    window.document.body.style.overflow = "hidden";
    let disposed = false;
    let loading;
    async function load() {
      try {
        const pdfjs = await import("pdfjs-dist");
        const { default: worker } = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
        if (disposed) return;
        pdfjs.GlobalWorkerOptions.workerSrc = worker;
        loading = pdfjs.getDocument({
          url: `${import.meta.env.BASE_URL}documents/long-distance-travel-policy.pdf`,
        });
        const pdf = await loading.promise;
        if (!disposed) setDocument(pdf);
      } catch (error) {
        console.error("Safety PDF could not be loaded", error);
        if (!disposed) setError(true);
      }
    }
    load();
    return () => {
      disposed = true;
      loading?.destroy();
      window.document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <dialog ref={dialog} className="safetyReader" aria-labelledby="readerTitle" onCancel={onClose}>
      <div className="safetyReaderHeader">
        <strong id="readerTitle">Холын аяллын журам</strong>
        <button type="button" autoFocus onClick={onClose}>Хаах / Үргэлжлүүлэх</button>
      </div>
      <div className="safetyReaderPages" tabIndex={0}>
        {error ? <p role="alert">Баримтыг ачаалж чадсангүй. Хаагаад дахин нээнэ үү.</p> : document ? (
          Array.from({ length: document.numPages }, (_, index) => (
            <Page key={index} document={document} number={index + 1} />
          ))
        ) : <p role="status">Ачаалж байна...</p>}
      </div>
    </dialog>
  );
}
