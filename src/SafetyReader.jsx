import React, { useEffect, useRef, useState } from "react";

function Page({ document, number, label }) {
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

  return error ? <p role="alert">{label}-р хуудсыг харуулахад алдаа гарлаа.</p> : (
    <canvas ref={canvas} role="img" aria-label={`Журмын ${label}-р хуудас`} />
  );
}

/**
 * Shows PDF pages in a modal. `sources` lists the files under
 * public/documents in reading order; `from` and `to` (1-based, inclusive) limit which pages of a file are shown.
 */
export default function SafetyReader({ title, sources, onClose }) {
  const dialog = useRef(null);
  const [pages, setPages] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    dialog.current.showModal();
    const previousOverflow = window.document.body.style.overflow;
    window.document.body.style.overflow = "hidden";
    let disposed = false;
    const loading = [];
    async function load() {
      try {
        const pdfjs = await import("pdfjs-dist");
        const { default: worker } = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
        if (disposed) return;
        pdfjs.GlobalWorkerOptions.workerSrc = worker;
        const documents = await Promise.all(sources.map(({ file }) => {
          const task = pdfjs.getDocument({
            url: `${import.meta.env.BASE_URL}documents/${file}`,
          });
          loading.push(task);
          return task.promise;
        }));
        if (!disposed) {
          setPages(documents.flatMap((pdf, index) =>
            Array.from({ length: pdf.numPages }, (_, page) => ({ pdf, number: page + 1 }))
              .slice((sources[index].from || 1) - 1, sources[index].to)
          ));
        }
      } catch (error) {
        console.error("Safety PDF could not be loaded", error);
        if (!disposed) setError(true);
      }
    }
    load();
    return () => {
      disposed = true;
      loading.forEach((task) => task.destroy());
      window.document.body.style.overflow = previousOverflow;
    };
  }, [sources]);

  return (
    <dialog ref={dialog} className="safetyReader" aria-labelledby="readerTitle" onCancel={onClose}>
      <div className="safetyReaderHeader">
        <strong id="readerTitle">{title}</strong>
        <button type="button" autoFocus onClick={onClose}>Хаах / Үргэлжлүүлэх</button>
      </div>
      <div className="safetyReaderPages" tabIndex={0}>
        {error ? <p role="alert">Баримтыг ачаалж чадсангүй. Хаагаад дахин нээнэ үү.</p> : pages ? (
          pages.map(({ pdf, number }, index) => (
            <Page key={index} document={pdf} number={number} label={index + 1} />
          ))
        ) : <p role="status">Ачаалж байна...</p>}
      </div>
    </dialog>
  );
}
