# DigiBook

Perpustakaan pribadi untuk membaca PDF, Word (.docx), Markdown, dan teks seperti buku: efek balik halaman 3D, mode satu/dua halaman, penanda, sorotan, catatan, pencarian, dan bacakan (Web Speech API).

**Tanpa AI dan tanpa akun.** Semua buku, catatan, dan progres baca tersimpan di IndexedDB peramban perangkat ini dan tidak dikirim ke server mana pun.

## Menjalankan

```
node build.mjs          # menyusun src/ menjadi index.html (satu file)
node test/server.mjs    # server lokal di http://localhost:8766 (ganti dengan PORT=xxxx)
```

`index.html` bisa dibuka lewat hosting statis mana pun (Netlify, GitHub Pages, Cloudflare Pages). Untuk dipublikasikan cukup unggah file itu (salinannya ada di `dist/`).

Pustaka dimuat dari CDN saat dibutuhkan, jadi pengunjung perlu internet: PDF.js 6.2.108, JSZip 3.10.1, marked 18.0.10, DOMPurify 3.4.14 (jsDelivr/unpkg/cdnjs), serta font Google Fonts.

## Isi folder

```
├── index.html            ← hasil build: SATU file berisi HTML + CSS + JS
├── build.mjs             ← menggabungkan src/ menjadi index.html
├── package.json          ← skrip npm + versi pustaka untuk pengujian
├── src/
│   ├── page.html         ← <title>, font, seluruh CSS (token warna terang/gelap), kerangka HTML
│   └── js/
│       ├── 00-util.js     ← helper DOM, format tanggal/ukuran, localStorage, IndexedDB, toast, dialog, menu
│       ├── 01-icons.js    ← ikon SVG garis (24px)
│       ├── 02-libs.js     ← pemuat pustaka dari CDN + sanitasi HTML
│       ├── 03-platform.js ← LocalStore (data rak) dan Files (file buku) di IndexedDB
│       ├── 04-convert.js  ← konverter Word → HTML, Markdown/teks → HTML, pemeriksa PDF + pembuat sampul
│       ├── 05-library.js  ← layar rak: kartu buku, filter, unggah, ubah info, detail, penyimpanan, ekspor, cadangan
│       ├── 06-reader.js   ← inti pembaca: tata letak 1/2 halaman, balik halaman 3D, gestur, keyboard, progres
│       ├── 07-pdf.js      ← render PDF (PDF.js), lapisan teks, tautan, sorotan, tampilan perbesar
│       ├── 08-flow.js     ← pemenggalan halaman untuk Word/Markdown/teks + jangkar posisi
│       ├── 09-reader-ui.js← panel daftar isi/penanda/catatan/miniatur, pencarian, pengaturan tampilan, sorotan
│       ├── 10-tts.js      ← bacakan (Web Speech API)
│       └── 99-main.js     ← boot dan statistik baca
├── test/                 ← server lokal, harness Playwright, lint, dan skenario uji (t*.mjs)
├── testdocs/             ← dokumen uji + make_docs.py untuk membuatnya ulang
└── seed/                 ← sisa buku panduan versi lama (belum diperbarui)
```

## Model data (IndexedDB `digibook`)

| Store | Isi |
|---|---|
| `kv/store` | katalog buku, pengaturan, statistik, progres per buku (`p_<bookId>`), penanda/sorotan/catatan |
| `files` | file asli, isi buku hasil konversi, dan sampul (blob) |

Karena data hanya ada di peramban, menghapus data situs menghapus rak. Gunakan menu **Cadangkan data (.json)** untuk membuat salinan.

## Catatan

- **Word (.docx)** diubah oleh konverter buatan sendiri (`04-convert.js`): judul, daftar bertingkat, tabel, gambar, tautan, catatan kaki, dan lainnya.
- **Pemenggalan halaman** (`08-flow.js`) mengukur tiap blok di elemen tersembunyi `#measure`, lalu memecah paragraf, daftar, dan tabel per halaman. Posisi baca disimpan sebagai jangkar `{b: blok, o: karakter}` sehingga tetap tepat walau ukuran huruf atau layar berubah.
- **Balik halaman** (`06-reader.js`) memakai CSS 3D, bayangan dinamis, dan bisa mengikuti jari/mouse; ada juga efek geser dan tanpa animasi (otomatis bila `prefers-reduced-motion`).
