// ---------- read aloud (Web Speech synthesis, on-device) ----------
const TTS = {
  active: false, paused: false, gen: 0, page: -1, auto: false, oneShot: false,
  rate: LS.get('ttsRate', 1), voiceURI: LS.get('ttsVoice', ''),
  supported() { return 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function'; },
  voices() { try { return speechSynthesis.getVoices() || []; } catch (e) { return []; } },
  pickVoice() {
    const vs = this.voices();
    return vs.find((v) => v.voiceURI === this.voiceURI) || vs.find((v) => /^id(-|_|$)/i.test(v.lang)) || vs.find((v) => /indones/i.test(v.name)) || null;
  },
  chunks(text) {
    const flat = String(text || '').replace(/\s+/g, ' ').trim();
    if (!flat) return [];
    const sents = flat.match(/[^.!?…]+[.!?…]+["”’)\]]*\s*|[^.!?…]+$/g) || [flat];
    const out = [];
    let buf = '';
    for (let s of sents) {
      s = s.trim();
      while (s.length > 240) {
        let cut = s.lastIndexOf(', ', 220); if (cut < 80) cut = s.lastIndexOf(' ', 220); if (cut < 40) cut = 220;
        if (buf) { out.push(buf); buf = ''; }
        out.push(s.slice(0, cut + 1).trim()); s = s.slice(cut + 1).trim();
      }
      if ((buf + ' ' + s).length > 240) { if (buf) out.push(buf); buf = s; } else buf = buf ? buf + ' ' + s : s;
    }
    if (buf) out.push(buf);
    return out;
  },
  speak(parts, gen) {
    return new Promise((resolve) => {
      let i = 0, fast = 0;
      const fail = (msg) => { if (gen === this.gen) { this.stop(); toast(msg, { ms: 5000 }); } resolve(false); };
      const next = () => {
        if (gen !== this.gen) { resolve(false); return; }
        if (i >= parts.length) { resolve(true); return; }
        const u = new SpeechSynthesisUtterance(parts[i]);
        const v = this.pickVoice();
        if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'id-ID';
        u.rate = this.rate;
        const t0 = performance.now();
        u.onend = () => {
          // an utterance that "finishes" instantly means the device is not really speaking
          if (performance.now() - t0 < 120 && parts[i].length > 25) fast++; else fast = 0;
          if (fast >= 3) { fail('Suara bacaan tidak tersedia di perangkat ini.'); return; }
          i++; next();
        };
        u.onerror = (e) => {
          const code = e && e.error;
          if (code === 'interrupted' || code === 'canceled') { resolve(false); return; }
          if (code === 'not-allowed') { fail('Ketuk tombol Bacakan sekali lagi untuk mengizinkan suara.'); return; }
          if (/unavailable|failed|hardware|network/.test(code || '')) { fail('Suara bacaan tidak tersedia di perangkat ini.'); return; }
          i++; next();
        };
        this.showLine(parts[i]);
        speechSynthesis.speak(u);
      };
      next();
    });
  },
  async start() {
    if (!this.supported()) { toast('Fitur bacakan tidak tersedia di perangkat ini.'); return; }
    if (!R.open || !R.src) return;
    this.stop(true);
    this.active = true; this.paused = false; this.oneShot = false;
    this.renderBar();
    this.readFrom(firstPageOfView(R.view));
  },
  async readFrom(page) {
    const gen = ++this.gen;
    speechSynthesis.cancel();
    this.page = page;
    const pages = viewPages(viewOfPage(page)).filter((x) => x != null && x >= page);
    for (const p of pages) {
      if (gen !== this.gen) return;
      this.page = p;
      this.renderBar();
      const text = await R.src.textOf(p).catch(() => '');
      const ok = await this.speak(this.chunks(text), gen);
      if (!ok || gen !== this.gen) return;
    }
    if (gen !== this.gen || !R.open) return;
    if (canGo(1)) {
      this.auto = true;
      await turn(1);
      setTimeout(() => { this.auto = false; }, 50);
      if (gen === this.gen && this.active) this.readFrom(firstPageOfView(R.view));
    } else { this.stop(); toast('Selesai membacakan buku.'); }
  },
  async speakText(text) {
    if (!this.supported()) { toast('Fitur bacakan tidak tersedia di perangkat ini.'); return; }
    this.stop(true);
    this.active = true; this.oneShot = true;
    this.renderBar();
    const gen = ++this.gen;
    await this.speak(this.chunks(text), gen);
    if (gen === this.gen) this.stop();
  },
  onViewChanged() {
    if (!this.active || this.auto || this.oneShot) return;
    this.readFrom(firstPageOfView(R.view));
  },
  pause() { if (!this.active) return; this.paused = true; try { speechSynthesis.pause(); } catch (e) { /* ignore */ } this.renderBar(); },
  resume() { if (!this.active) return; this.paused = false; try { speechSynthesis.resume(); } catch (e) { /* ignore */ } this.renderBar(); },
  stop(quiet) {
    this.gen++;
    this.active = false; this.paused = false;
    try { if (this.supported()) speechSynthesis.cancel(); } catch (e) { /* ignore */ }
    if (!quiet) { const b = $('#ttsBar'); if (b) b.hidden = true; }
  },
  toggle() { if (this.active) this.stop(); else this.start(); },
  showLine(t) { const el = $('#ttsBar .t'); if (el) el.textContent = (this.oneShot ? 'Membacakan teks pilihan: ' : `Hal. ${this.page + 1}: `) + t; },
  renderBar() {
    const bar = $('#ttsBar');
    bar.replaceChildren();
    const pp = h('button', { class: 'icon-btn', type: 'button', 'aria-label': this.paused ? 'Lanjutkan' : 'Jeda', onclick: () => (this.paused ? this.resume() : this.pause()) }, icon(this.paused ? 'play' : 'pause'));
    const stop = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Berhenti membacakan', onclick: () => this.stop() }, icon('stop'));
    const rate = h('select', { class: 'select', 'aria-label': 'Kecepatan' });
    for (const r of [0.8, 1, 1.15, 1.3, 1.5, 1.8]) rate.append(h('option', { value: r, text: r + '×' }));
    rate.value = String(this.rate);
    rate.addEventListener('change', () => { this.rate = +rate.value; LS.set('ttsRate', this.rate); if (this.active && !this.oneShot) this.readFrom(this.page); });
    bar.append(pp, stop, h('div', { class: 't', text: this.oneShot ? 'Membacakan teks pilihan…' : `Membacakan hal. ${this.page + 1}…` }), rate);
    const vs = this.voices().filter((v) => /^id/i.test(v.lang) || /indones/i.test(v.name));
    if (vs.length > 1) {
      const vsel = h('select', { class: 'select', 'aria-label': 'Suara' });
      for (const v of vs) vsel.append(h('option', { value: v.voiceURI, text: v.name.replace(/\s*\(.*\)/, '').slice(0, 22) }));
      const cur = this.pickVoice(); if (cur) vsel.value = cur.voiceURI;
      vsel.addEventListener('change', () => { this.voiceURI = vsel.value; LS.set('ttsVoice', this.voiceURI); if (this.active && !this.oneShot) this.readFrom(this.page); });
      bar.append(vsel);
    }
    bar.hidden = false;
  },
};
if (TTS.supported()) { try { speechSynthesis.getVoices(); speechSynthesis.addEventListener && speechSynthesis.addEventListener('voiceschanged', () => {}); } catch (e) { /* ignore */ } }
