// ---------- third-party libraries, loaded on demand from allowed CDNs ----------
const PDFJS_VER = '6.2.108';
const LIBS = {
  pdfjs: {
    module: true,
    urls: [
      `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VER}/legacy/build/pdf.min.mjs`,
      `https://unpkg.com/pdfjs-dist@${PDFJS_VER}/legacy/build/pdf.min.mjs`,
    ],
    worker: (url) => url.replace('/pdf.min.mjs', '/pdf.worker.min.mjs'),
  },
  jszip: {
    global: 'JSZip',
    urls: ['https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js', 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js'],
  },
  marked: {
    global: 'marked',
    urls: ['https://cdn.jsdelivr.net/npm/marked@18.0.10/lib/marked.umd.js', 'https://unpkg.com/marked@18.0.10/lib/marked.umd.js'],
  },
  purify: {
    global: 'DOMPurify',
    urls: ['https://cdn.jsdelivr.net/npm/dompurify@3.4.14/dist/purify.min.js', 'https://unpkg.com/dompurify@3.4.14/dist/purify.min.js'],
  },
};
const libPromises = {};
function loadClassic(url) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = url; s.async = true; s.crossOrigin = 'anonymous';
    s.onload = () => res(); s.onerror = () => { s.remove(); rej(new Error('gagal memuat ' + url)); };
    document.head.append(s);
  });
}
async function loadLib(name) {
  const spec = LIBS[name];
  let lastErr;
  for (const url of spec.urls) {
    try {
      if (spec.module) {
        const mod = await import(url);
        mod.GlobalWorkerOptions.workerSrc = spec.worker(url);
        return mod;
      }
      if (!window[spec.global]) await loadClassic(url);
      if (window[spec.global]) return window[spec.global];
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('Pustaka ' + name + ' tidak tersedia');
}
function need(name) {
  if (!libPromises[name]) {
    libPromises[name] = loadLib(name).catch((e) => { delete libPromises[name]; throw e; });
  }
  return libPromises[name];
}
async function sanitize(html, extra = {}) {
  try {
    const P = await need('purify');
    return P.sanitize(html, { ADD_ATTR: ['target'], FORBID_TAGS: ['style', 'form', 'input', 'button', 'iframe', 'object', 'embed'], ...extra });
  } catch (e) {
    // fallback: strip scripts, event handlers and javascript: urls
    const t = document.createElement('template');
    t.innerHTML = html;
    for (const el of t.content.querySelectorAll('script,style,iframe,object,embed,form,input,button,link,meta')) el.remove();
    for (const el of t.content.querySelectorAll('*')) {
      for (const a of [...el.attributes]) {
        if (/^on/i.test(a.name) || (/^(href|src|xlink:href)$/i.test(a.name) && /^\s*javascript:/i.test(a.value))) el.removeAttribute(a.name);
      }
    }
    return t.innerHTML;
  }
}
// Data pendukung PDF.js (font standar, CMap, ICC, wasm gambar); tanpa ini teks dengan font tak tertanam / CID tidak tergambar.
const PDFJS_BASE = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VER}/`;
const PDF_OPTS = { cMapUrl: PDFJS_BASE + 'cmaps/', cMapPacked: true, standardFontDataUrl: PDFJS_BASE + 'standard_fonts/', iccUrl: PDFJS_BASE + 'iccs/', wasmUrl: PDFJS_BASE + 'wasm/', isEvalSupported: false, useSystemFonts: true, enableXfa: false, disableAutoFetch: true, stopAtErrors: false };
