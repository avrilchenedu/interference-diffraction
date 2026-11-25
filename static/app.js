/* 干涉與繞射｜互動教材 前端 */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const h = (tag, attrs = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") e.className = v;
      else if (k === "html") e.innerHTML = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? "" : v);
    }
    kids.flat().forEach((c) => c !== null && c !== undefined && c !== false && e.append(c.nodeType ? c : document.createTextNode(c)));
    return e;
  };
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const S = {
    C: null,
    code: "",
    answers: {},
    dialog: [],
    pos: { last: null, max: {} },
    online: true,
    evbuf: [],
  };

  /* ---------------- 儲存與同步 ---------------- */
  const LS = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };
  const cacheKey = () => "ib_cache_" + S.code;
  function cache() { LS.set(cacheKey(), { answers: S.answers, dialog: S.dialog, pos: S.pos }); }
  function setOnline(v) { S.online = v; $(".net-banner").hidden = v; }

  async function post(path, body) {
    path = path.replace(/^\//, "");
    if (window.LocalAPI && LocalAPI.active) return LocalAPI.handle(path, body);
    const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.status);
    return r.json();
  }
  function queue(item) { const q = LS.get("ib_queue", []); q.push(item); LS.set("ib_queue", q); }
  async function flushQueue() {
    const q = LS.get("ib_queue", []);
    if (!q.length) return;
    const rest = [];
    for (const it of q) {
      try { await post(it.path, it.body); } catch { rest.push(it); }
    }
    LS.set("ib_queue", rest);
    setOnline(rest.length === 0);
  }
  async function save(qid, data) {
    S.answers[qid] = Object.assign(S.answers[qid] || {}, data);
    cache();
    const body = { code: S.code, qid, data };
    try { const r = await post("/api/save", body); setOnline(true); return r; }
    catch { queue({ path: "/api/save", body }); setOnline(false); return { saved: "（暫存於本機）" }; }
  }
  function log(action, detail, ch) {
    S.evbuf.push({ ts: Date.now() / 1000, chapter: ch ?? curCh(), action, detail: detail || {} });
  }
  async function flushEvents() {
    if (!S.code) return;
    const evs = S.evbuf.splice(0);
    const body = { code: S.code, events: evs, position: S.pos };
    try { await post("/api/events", body); setOnline(true); flushQueue(); }
    catch { if (evs.length) queue({ path: "/api/events", body }); setOnline(false); }
  }
  setInterval(flushEvents, 4000);
  window.addEventListener("beforeunload", () => {
    if (S.code && S.evbuf.length && window.LocalAPI && LocalAPI.active) { LocalAPI.handle("api/events", { code: S.code, events: S.evbuf, position: S.pos }); return; }
    if (S.code && S.evbuf.length) navigator.sendBeacon("api/events", new Blob([JSON.stringify({ code: S.code, events: S.evbuf, position: S.pos })], { type: "application/json" }));
  });

  /* ---------------- 小波（互動小人物） ---------------- */
  const FACES = {
    normal: '<path d="M27 47 q9 7 18 0" stroke="#173a63" stroke-width="3" fill="none" stroke-linecap="round"/>',
    think: '<path d="M28 49 h16" stroke="#173a63" stroke-width="3" stroke-linecap="round"/><circle cx="56" cy="20" r="3" fill="#fff"/><circle cx="62" cy="12" r="2" fill="#fff"/>',
    happy: '<path d="M25 44 q11 12 22 0 z" fill="#173a63"/>',
  };
  function mascotSVG(mood = "normal") {
    return `<svg viewBox="0 0 72 72" aria-hidden="true">
      <path d="M36 6 C18 24 10 34 10 46 a26 24 0 0 0 52 0 C62 34 54 24 36 6z" fill="#4f8fe6"/>
      <path d="M14 44 q6 -6 11 0 t11 0 t11 0 t11 0" stroke="#bfe0ff" stroke-width="3" fill="none" stroke-linecap="round"/>
      <circle cx="27" cy="36" r="4" fill="#173a63"/><circle cx="45" cy="36" r="4" fill="#173a63"/>
      <circle cx="28.5" cy="34.5" r="1.3" fill="#fff"/><circle cx="46.5" cy="34.5" r="1.3" fill="#fff"/>
      <circle cx="21" cy="43" r="3" fill="#ffb3c0" opacity=".7"/><circle cx="51" cy="43" r="3" fill="#ffb3c0" opacity=".7"/>
      ${FACES[mood] || FACES.normal}</svg>`;
  }
  let bubbleTimer;
  function say(text, mood = "normal") {
    $(".mascot-btn").innerHTML = mascotSVG(mood);
    clearTimeout(bubbleTimer);
    if (!text) { $(".mascot .bubble").hidden = true; return; }
    $(".bubble-text").textContent = text;
    $(".mascot .bubble").hidden = false;
    $(".ask-open").hidden = !S.code;
    // 不擋住操作：幾秒後自動收起，點小波可再打開
    bubbleTimer = setTimeout(() => ($(".mascot .bubble").hidden = true), Math.max(7000, text.length * 220));
  }
  $(".bubble-x").onclick = () => ($(".mascot .bubble").hidden = true);
  $(".mascot-btn").onclick = () => {
    const b = $(".mascot .bubble");
    if (b.hidden && $(".bubble-text").textContent) { b.hidden = false; clearTimeout(bubbleTimer); }
    else openChat();
  };
  $(".ask-open").onclick = () => openChat();
  $(".chat-x").onclick = () => ($(".chat").hidden = true);

  let chatCtx = { ch: 0, qid: "chat_home", stage: "explain" };
  function openChat() {
    if (!S.code) return;
    $(".chat").hidden = false;
    renderChat();
    $(".chat-in").focus();
  }
  function renderChat() {
    const box = $(".chat-log");
    box.innerHTML = "";
    const items = S.dialog.filter((d) => d.qid === chatCtx.qid);
    if (!items.length)
      box.append(h("div", { class: "msg guide" }, "有什麼卡住的地方都可以問我！不過我不會直接給答案——我會問你問題，陪你從教材裡找到答案。"));
    items.forEach((d) => box.append(h("div", { class: "msg " + (d.role === "student" ? "me" : "guide") + (d.handoff ? " handoff" : "") }, d.text)));
    box.scrollTop = box.scrollHeight;
  }
  $(".chat-form").onsubmit = async (e) => {
    e.preventDefault();
    const t = $(".chat-in").value.trim();
    if (!t) return;
    $(".chat-in").value = "";
    await ask(chatCtx.ch, chatCtx.qid, t, "", chatCtx.stage);
    renderChat();
  };

  async function ask(ch, qid, message, draftText, stage) {
    const stu = { ts: Date.now() / 1000, chapter: ch, qid, role: "student", text: message || "（請小波追問）", handoff: 0 };
    S.dialog.push(stu);
    say("嗯……讓我想想怎麼問你。", "think");
    try {
      const r = await post("/api/guide", { code: S.code, chapter: ch, qid, message, draft: draftText, stage });
      setOnline(true);
      S.dialog.push({ ts: Date.now() / 1000, chapter: ch, qid, role: "guide", text: r.reply, handoff: r.handoff ? 1 : 0, topic: r.topic, level: r.level });
      say(r.reply, r.handoff ? "think" : "normal");
      cache();
      return r;
    } catch {
      S.dialog.pop();
      setOnline(false);
      say("我現在連不上線……你可以按「重試」，或先略過、自己修訂，作答都還在。", "think");
      return { error: true };
    }
  }

  /* ---------------- 共用元件 ---------------- */
  function photoCard(key, opts = {}) {
    const p = S.C.photos[key];
    if (!p) return h("div");
    const fig = h("figure", { class: "photo" });
    const img = h("img", { src: "assets/" + p.file, alt: p.use, loading: "lazy" });
    const cap = h("figcaption", {},
      h("span", { class: "tag " + (p.kind.includes("實拍") ? "real" : "") }, p.kind),
      " ", p.use, h("br"), h("span", { class: "tiny" }, "攝影／作者：" + p.author + "｜授權：",
        p.licenseUrl ? h("a", { href: p.licenseUrl, target: "_blank", rel: "noopener" }, p.license) : p.license,
        "｜", h("a", { href: p.url, target: "_blank", rel: "noopener" }, "Wikimedia Commons 來源頁")));
    img.onerror = () => {
      const ph = h("div", { class: "photo-ph" },
        h("div", { class: "ph-icon" }, "🖼"),
        h("div", {}, h("b", {}, p.kind + "（照片尚未放入）")),
        h("div", { class: "tiny" }, "請老師把照片放到 static/assets/" + p.file),
        h("a", { href: p.url, target: "_blank", rel: "noopener", class: "btn small" }, "開啟原始照片來源"));
      img.replaceWith(ph);
    };
    img.onclick = () => { lightbox(h("img", { src: img.src, alt: p.use })); log("放大照片", { 照片: p.file }); };
    fig.append(img, cap);
    return fig;
  }
  function lightbox(node) {
    $(".lb-body").innerHTML = "";
    $(".lb-body").append(node);
    $(".lightbox").hidden = false;
  }
  $(".lb-x").onclick = () => ($(".lightbox").hidden = true);
  $(".lightbox").onclick = (e) => { if (e.target === $(".lightbox")) $(".lightbox").hidden = true; };

  function figure(name, caption) {
    const f = h("figure", { class: "figure", html: Sims.FIG[name] ? Sims.FIG[name]() : "" });
    if (caption) f.append(h("figcaption", {}, caption));
    return f;
  }
  function paras(list) { return (list || []).map((t) => h("p", {}, t)); }
  function savedTag() { return h("span", { class: "saved tiny" }); }
  function markSaved(tag, r) { tag.textContent = "✓ 已儲存 " + (r && r.saved ? String(r.saved).slice(11, 16) || r.saved : ""); }
  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
  function textarea(val, rows, ph, oninput) {
    const t = h("textarea", { rows: rows || 2, placeholder: ph || "" });
    t.value = val || "";
    t.addEventListener("input", () => oninput && oninput(t.value));
    return t;
  }
  function choiceButtons(options, current, onPick, cls = "") {
    const box = h("div", { class: "options " + cls, role: "radiogroup" });
    options.forEach((o) => {
      const b = h("button", { class: "opt" + (o === current ? " on" : ""), role: "radio", "aria-checked": o === current ? "true" : "false" }, o);
      b.onclick = () => { box.querySelectorAll(".opt").forEach((x) => { x.classList.toggle("on", x === b); x.setAttribute("aria-checked", x === b); }); onPick(o); };
      box.append(b);
    });
    return box;
  }
  function download(fmt) {
    flushEvents().then(() => {
      let a;
      if (window.LocalAPI && LocalAPI.active) {
        const f = LocalAPI.exportFile(S.code, fmt);
        a = h("a", { href: URL.createObjectURL(f.blob), download: f.name });
      } else a = h("a", { href: `api/export?code=${encodeURIComponent(S.code)}&fmt=${fmt}` });
      document.body.append(a); a.click(); a.remove();
      log("下載紀錄", { 格式: fmt });
    });
  }
  const textOf = (obj) => Object.values(obj || {}).filter(Boolean).join("\n");

  /* ---------------- 寫作題：初稿 → 小波追問 → 自行修訂 ---------------- */
  function writeFlow(step, ch, opts = {}) {
    const qid = step.qid;
    const a = S.answers[qid] || {};
    const draft = Object.assign({}, a.draft || {});
    const wrap = h("div", { class: "write" });
    const tag = savedTag();
    const fields = opts.fields || step.fields;

    // ② 我的初稿
    const sec2 = h("section", { class: "panel" }, h("div", { class: "panel-h" }, h("span", { class: "num" }, "②"), h("b", {}, "我的初稿"), tag));
    const persist = debounce(async () => markSaved(tag, await save(qid, { draft })), 800);
    let draftUI;
    if (opts.renderDraft) draftUI = opts.renderDraft(draft, () => { persist(); refresh(); });
    else {
      draftUI = h("div");
      fields.forEach((f) => {
        draftUI.append(h("label", { class: "field" }, h("span", {}, f.label), textarea(draft[f.key], f.rows, f.ph, (v) => { draft[f.key] = v; persist(); refresh(); })));
      });
    }
    sec2.append(draftUI);
    wrap.append(sec2);
    const complete = () => (opts.isComplete ? opts.isComplete(draft) : fields.every((f) => (draft[f.key] || "").trim()));
    const draftText = () => (opts.draftText ? opts.draftText(draft) : fields.map((f) => f.label + "：" + (draft[f.key] || "")).join("\n"));

    // ③ 小波追問
    let sec3, askBtn, hint, logBox, replyRow;
    if (!step.noAI) {
      askBtn = h("button", { class: "btn primary" }, "請小波追問");
      const skipBtn = h("button", { class: "btn" }, "略過，直接修訂");
      hint = h("span", { class: "tiny warn" }, "請先完成所有欄位");
      logBox = h("div", { class: "qlog" });
      const rin = h("input", { placeholder: "回答小波，或說說你的想法……" });
      const rsend = h("button", { class: "btn" }, "回覆");
      replyRow = h("form", { class: "reply-row" }, rin, rsend);
      replyRow.hidden = true;
      sec3 = h("section", { class: "panel" },
        h("div", { class: "panel-h" }, h("span", { class: "num" }, "③"), h("b", {}, "小波追問"), h("span", { class: "tiny" }, "選用；一次一個問題，不代答")),
        h("div", { class: "btn-row" }, askBtn, skipBtn, hint), logBox, replyRow);
      askBtn.onclick = async () => {
        if (!complete()) return;
        await save(qid, { draft, asked: true });
        log("請小波追問", { 題號: qid });
        askBtn.disabled = true;
        const r = await ask(ch, qid, "", draftText(), "explain");
        askBtn.disabled = !complete();
        if (r.error) askBtn.textContent = "重試";
        else askBtn.textContent = "再追問一次";
        renderLog(); refresh();
      };
      skipBtn.onclick = async () => { await save(qid, { draft, skipped: true }); log("略過小波追問", { 題號: qid }); refresh(); };
      replyRow.onsubmit = async (e) => {
        e.preventDefault();
        const t = rin.value.trim();
        if (!t) return;
        rin.value = "";
        await ask(ch, qid, t, draftText(), "explain");
        renderLog();
      };
      wrap.append(sec3);
    }
    function renderLog() {
      if (!logBox) return;
      logBox.innerHTML = "";
      const items = S.dialog.filter((d) => d.qid === qid);
      items.forEach((d) => logBox.append(h("div", { class: "msg " + (d.role === "student" ? "me" : "guide") + (d.handoff ? " handoff" : "") }, d.role === "guide" ? "小波：" + d.text : d.text)));
      if (items.some((d) => d.handoff)) logBox.append(h("div", { class: "handoff-note" }, "🙋 已標記「轉教師」：老師在後台看得到你的初稿與對話，可以舉手請老師一起看。"));
      replyRow.hidden = !items.length;
    }

    // ④ 我的修訂
    const sec4 = h("section", { class: "panel" }, h("div", { class: "panel-h" }, h("span", { class: "num" }, step.noAI ? "③" : "④"), h("b", {}, step.noAI ? "完成" : "我的修訂")));
    const rev = Object.assign({}, a.revision || {});
    const revTag = savedTag();
    const revUI = h("div");
    let revBuilt = false;
    function buildRev() {
      if (revBuilt || step.noAI) return;
      revBuilt = true;
      if (opts.renderRevision) revUI.append(opts.renderRevision(rev, draft));
      else
        fields.forEach((f) => {
          if (rev[f.key] === undefined) rev[f.key] = draft[f.key];
          revUI.append(h("label", { class: "field" }, h("span", {}, f.label + "（修訂）"), textarea(rev[f.key], f.rows, f.ph, (v) => (rev[f.key] = v))));
        });
    }
    if (!step.noAI) {
      sec4.append(h("p", { class: "tiny" }, "用觀察證據修訂你的解釋；如果你決定保留初稿，也請寫下理由。"));
      const reason = textarea(a.reason, 2, "簡述原因……", (v) => (a.reason = v));
      sec4.append(revUI, h("label", { class: "field" }, h("span", {}, "修訂理由／保留初稿的理由"), reason));
    }
    const doneBtn = h("button", { class: "btn primary" }, step.noAI ? "儲存" : "完成本題");
    doneBtn.onclick = async () => {
      const payload = step.noAI ? { draft, done: new Date().toLocaleString() } : { draft, revision: rev, reason: a.reason || "", done: new Date().toLocaleString() };
      if (!step.noAI) fields && fields.forEach((f) => { if (rev[f.key] === undefined) rev[f.key] = draft[f.key]; });
      markSaved(revTag, await save(qid, payload));
      log("完成題目", { 題號: qid });
      say(step.noAI ? "記下來了！這些反思會出現在你的學習紀錄裡。" : "你的初稿和修訂都分別保存了。可以繼續下一步！", "happy");
      opts.onDone && opts.onDone();
    };
    sec4.append(h("div", { class: "btn-row" }, doneBtn, revTag));
    wrap.append(sec4);

    function refresh() {
      const ok = complete();
      if (askBtn) { askBtn.disabled = !ok; hint.hidden = ok; }
      const cur = S.answers[qid] || {};
      sec4.hidden = !step.noAI && !(cur.asked || cur.skipped || cur.done);
      if (!sec4.hidden) buildRev();
    }
    renderLog();
    refresh();
    return wrap;
  }

  /* ---------------- 各類步驟 ---------------- */
  const R = {};
  R.intro = (st, ch) => {
    const c = S.C.chapters[ch - 1];
    const n = S.C.unit.nodes[ch - 1];
    return h("div", {},
      h("div", { class: "meta-grid" },
        h("div", {}, h("span", { class: "tiny" }, "知識節點"), h("b", {}, n.no + "　" + n.name)),
        h("div", {}, h("span", { class: "tiny" }, "課堂對應"), h("b", {}, c.period)),
        h("div", {}, h("span", { class: "tiny" }, "學習目標"), h("b", {}, c.goal)),
        h("div", {}, h("span", { class: "tiny" }, "銜接"), h("b", {}, n.link))),
      h("div", { class: "core-q" }, "核心問題：" + c.question),
      paras(st.paras));
  };
  R.read = (st) => h("div", {},
    paras(st.paras),
    st.figure ? figure(st.figure, st.figCaption) : null,
    st.photos ? h("div", { class: "photo-grid" }, st.photos.map((k) => photoCard(k))) : null);
  R.photos = (st) => h("div", {},
    st.figure ? figure(st.figure, st.figCaption) : null,
    h("div", { class: "photo-grid" }, (st.photos || []).map((k) => photoCard(k))),
    st.safety ? h("div", { class: "callout warn" }, "⚠️ 安全：" + st.safety) : null);

  R.predict = (st, ch, ctl) => {
    const a = S.answers[st.qid] || {};
    const d = { choice: a.choice || "", other: a.other || "", reason: a.reason || "", draw: a.draw || null };
    const box = h("div", {}, h("p", { class: "q" }, st.prompt));
    const locked = !!a.submitted;
    if (locked) {
      box.append(h("div", { class: "callout" }, "✓ 你的預測已保留（", a.submitted, "）。等一下會拿觀察來比較，現在不用改。"),
        h("p", {}, h("b", {}, "我的預測："), a.choice + (a.other ? "（" + a.other + "）" : "")),
        a.draw ? (() => { const z = h("div"); Sims.screenDraw(z, a.draw, null, true); return z; })() : null,
        h("p", {}, h("b", {}, "理由："), a.reason));
      return box;
    }
    const other = h("input", { placeholder: "其他：請說明", class: "other-in" });
    other.value = d.other;
    other.hidden = d.choice !== "其他";
    other.oninput = () => { d.other = other.value; check(); };
    box.append(choiceButtons(st.options, d.choice, (o) => { d.choice = o; other.hidden = o !== "其他"; check(); }), other);
    if (st.draw) {
      const z = h("div", { class: "draw-wrap" }, h("div", { class: "lbl" }, "我的屏幕圖樣預測："));
      const zz = h("div");
      Sims.screenDraw(zz, d.draw, (v) => { d.draw = v; check(); });
      z.append(zz);
      box.append(z);
    }
    box.append(h("label", { class: "field" }, h("span", {}, st.reason), textarea(d.reason, 2, "", (v) => { d.reason = v; check(); })));
    const btn = h("button", { class: "btn primary", disabled: true }, "送出並保留預測");
    const warn = h("span", { class: "tiny warn" }, "請選一項並寫下理由");
    function check() { const ok = d.choice && d.reason.trim() && (d.choice !== "其他" || d.other.trim()); btn.disabled = !ok; warn.hidden = !!ok; }
    btn.onclick = async () => {
      await save(st.qid, { ...d, submitted: new Date().toLocaleString() });
      log("送出預測", { 題號: st.qid, 預測: d.choice });
      say("預測保留好了！猜對猜錯都沒關係，重點是等一下用觀察來檢查。", "happy");
      ctl.rerender();
    };
    box.append(h("div", { class: "btn-row" }, btn, warn));
    check();
    return box;
  };
  R.predict.canNext = (st) => !!(S.answers[st.qid] || {}).submitted;
  R.predict.lockMsg = "先送出你的預測，才能看下一步的觀察喔！";

  R.sim = (st, ch) => {
    const host = h("div", { class: "sim-host" });
    const ctx = {
      log: (a, d) => log(a, d, ch),
      get: () => S.answers[st.qid] || {},
      save: (d) => save(st.qid, d),
    };
    setTimeout(() => Sims[st.sim](host, ctx), 0);
    return h("div", {}, host, st.note ? h("p", { class: "note" }, "ℹ️ " + st.note) : null);
  };

  R.choice = (st, ch) => {
    const a = S.answers[st.qid] || {};
    const attempts = (a.attempts || []).slice();
    const fb = h("div", { class: "fb", "aria-live": "polite" });
    const box = h("div", {}, h("p", { class: "q" }, st.prompt));
    const opts = h("div", { class: "options col" });
    st.options.forEach((o) => {
      const b = h("button", { class: "opt" + (a.choice === o.t ? (o.ok ? " ok" : " no") : "") }, o.t);
      b.onclick = async () => {
        opts.querySelectorAll(".opt").forEach((x) => x.classList.remove("ok", "no"));
        b.classList.add(o.ok ? "ok" : "no");
        attempts.push(o.t);
        show(o);
        await save(st.qid, { choice: o.t, correct: !!o.ok, attempts });
        log("選答", { 題號: st.qid, 選擇: o.t, 符合: !!o.ok });
      };
      opts.append(b);
    });
    function show(o) {
      fb.className = "fb " + (o.ok ? "good" : "hmm");
      fb.innerHTML = "";
      fb.append(h("div", { class: "fb-face", html: mascotSVG(o.ok ? "happy" : "think") }), h("div", {}, h("b", {}, o.ok ? "你的判斷有依據！" : "再想想看："), h("br"), o.fb));
      say(o.fb, o.ok ? "happy" : "think");
    }
    box.append(opts, fb);
    const prev = st.options.find((o) => o.t === a.choice);
    if (prev) show(prev);
    return box;
  };

  R.write = (st, ch) => {
    const box = h("div", {}, h("p", { class: "q" }, st.prompt));
    if (st.showPrev) {
      const p = S.answers[st.showPrev];
      if (p) box.append(h("div", { class: "callout" }, h("b", {}, "你在 Q1 的預測："), p.choice + (p.other ? "（" + p.other + "）" : ""), "；理由：", p.reason || "（未填）"));
    }
    box.append(writeFlow(st, ch));
    return box;
  };

  R.revisit = (st, ch) => {
    const src = S.answers[st.source] || {};
    const srcStep = findStep(st.source);
    const base = Object.assign({}, src.draft || {}, src.revision || {});
    const fields = srcStep ? srcStep.fields : [{ key: "text", label: "內容", rows: 4 }];
    const a = S.answers[st.qid] || {};
    const rev = Object.assign({}, base, a.revised || {});
    const tag = savedTag();
    const box = h("div", {}, h("p", { class: "q" }, st.prompt));
    if (!Object.keys(base).length) box.append(h("div", { class: "callout" }, "你還沒有完成那一題。可以先回去作答，或在這裡直接寫。"));
    fields.forEach((f) => box.append(h("label", { class: "field" }, h("span", {}, f.label), textarea(rev[f.key], f.rows, "", (v) => (rev[f.key] = v)))));
    const reason = textarea(a.reason, 2, "我補上了……／我保留原稿，因為……", null);
    box.append(h("label", { class: "field" }, h("span", {}, "修訂理由／保留理由"), reason));
    const b = h("button", { class: "btn primary" }, "儲存修訂");
    b.onclick = async () => {
      markSaved(tag, await save(st.qid, { source: st.source, before: base, revised: rev, reason: reason.value }));
      log("修訂前一章作答", { 來源: st.source });
      say("修訂前後稿都留下來了，老師可以看到你的進步。", "happy");
    };
    box.append(h("div", { class: "btn-row" }, b, tag));
    return box;
  };

  R.observe = (st, ch) => {
    const a = S.answers[st.qid] || {};
    const d = { sources: a.sources || [], draw: a.draw || null };
    const tag = savedTag();
    const box = h("div", {}, h("p", { class: "q" }, st.prompt));
    const pics = h("div", { class: "photo-grid" }, photoCard(st.photo), st.photo2 ? photoCard(st.photo2) : null);
    box.append(h("div", { class: "lbl" }, "真實觀察（先看實拍）"), pics);
    const det = h("details", { class: "model-cmp" }, h("summary", {}, "對照：理想模型圖樣（只協助辨認規律，不是實拍）"));
    const pz = h("div");
    det.append(pz);
    det.addEventListener("toggle", () => { if (det.open) { Sims.pattern(pz, st.model === "single_pattern" ? "single" : "double"); log("開啟模型對照", { 題號: st.qid }); } });
    box.append(det);
    const srcBox = h("div", { class: "options" });
    st.sourceOptions.forEach((o) => {
      const b = h("button", { class: "opt" + (d.sources.includes(o) ? " on" : ""), "aria-pressed": d.sources.includes(o) }, "☐ " + o);
      const sync = () => { const on = d.sources.includes(o); b.classList.toggle("on", on); b.textContent = (on ? "☑ " : "☐ ") + o; };
      b.onclick = () => { d.sources = d.sources.includes(o) ? d.sources.filter((x) => x !== o) : [...d.sources, o]; sync(); };
      sync();
      srcBox.append(b);
    });
    box.append(h("div", { class: "lbl" }, "資料來源（可複選）"), srcBox);
    if (st.draw) {
      const z = h("div");
      Sims.screenDraw(z, d.draw, (v) => (d.draw = v));
      box.append(h("div", { class: "lbl" }, "我的觀察（點出屏幕亮暗）："), z);
    }
    st.fields.forEach((f) => box.append(h("label", { class: "field" }, h("span", {}, f.label), textarea(a[f.key], f.rows, f.ph, (v) => (d[f.key] = v)))));
    const b = h("button", { class: "btn primary" }, "儲存觀察");
    b.onclick = async () => {
      markSaved(tag, await save(st.qid, { ...d }));
      log("儲存觀察", { 題號: st.qid, 來源: d.sources });
      if (d.sources.includes("僅理想模型")) say("你標示了「僅理想模型」——很誠實！記得：模型結果還需要真實觀察來支持。", "think");
      else say("觀察記下來了。現在先不解釋，下一步再比較。", "happy");
    };
    box.append(h("div", { class: "btn-row" }, b, tag));
    return box;
  };

  R.compare = (st, ch) => {
    const A = S.answers[st.a] || {}, B = S.answers[st.b] || {};
    const a = S.answers[st.qid] || {};
    const d = { match: a.match || "", keep: a.keep || "" };
    const tag = savedTag();
    const col = (title, ans) => {
      const z = h("div");
      if (ans && ans.draw) Sims.screenDraw(z, ans.draw, null, true);
      else z.append(h("p", { class: "tiny" }, "（沒有作圖紀錄）"));
      return h("div", { class: "cmp-col" }, h("b", {}, title), z, ans && ans.choice ? h("p", { class: "tiny" }, "選項：" + ans.choice) : null);
    };
    const box = h("div", {},
      h("div", { class: "cmp" }, col("Q1 我的預測", A), col("Q2 我的觀察", B)),
      h("p", { class: "q" }, "與 Q1 比較後，你保留或修正哪一點？請引用一項觀察。"),
      choiceButtons(st.options, d.match, (o) => (d.match = o)));
    st.fields.forEach((f) => box.append(h("label", { class: "field" }, h("span", {}, f.label), textarea(d[f.key], f.rows, f.ph, (v) => (d[f.key] = v)))));
    const b = h("button", { class: "btn primary" }, "儲存比較");
    b.onclick = async () => {
      markSaved(tag, await save(st.qid, d));
      log("儲存比較", { 題號: st.qid, 結果: d.match });
      if (d.match === "不同" && !/依據|觀察|看到|實拍/.test(d.keep)) say("你寫了「不同」——是哪個觀察讓你修改了哪一部分？", "think");
      else say("很好，你把預測和觀察放在一起比了。", "happy");
    };
    box.append(h("div", { class: "btn-row" }, b, tag));
    return box;
  };

  R.q4board = (st, ch) => {
    // ① 教材與模型
    const left = h("section", { class: "panel" }, h("div", { class: "panel-h" }, h("span", { class: "num" }, "①"), h("b", {}, "教材與模型")));
    const tabs = h("div", { class: "tabs", role: "tablist" });
    const pane = h("div", { class: "tab-pane" });
    const panes = {
      正文: () => h("div", {}, h("div", { class: "callout" }, st.context), paras(S.C.chapters[1].steps.find((x) => x.type === "read" && x.figure === "huygens").paras), paras(st.paras)),
      實拍: () => h("div", {}, photoCard("double_red"), h("p", { class: "tiny" }, "點照片可放大；關閉後回到原頁。")),
      模型: () => { const z = h("div"); setTimeout(() => Sims.bd(z, { log: (x, d) => log(x, d, ch) }), 0); return h("div", {}, h("b", {}, "M02 次波模型"), h("p", { class: "tiny" }, "比較 B、D 兩點的波。"), z); },
    };
    let curTab = "模型";
    Object.keys(panes).forEach((k) => {
      const b = h("button", { class: "tab" + (k === curTab ? " on" : ""), role: "tab" }, k);
      b.onclick = () => {
        Sims.stopAll();
        curTab = k;
        tabs.querySelectorAll(".tab").forEach((x) => x.classList.toggle("on", x === b));
        pane.innerHTML = "";
        pane.append(panes[k]());
        log("切換素材", { 分頁: k });
      };
      tabs.append(b);
    });
    pane.append(panes[curTab]());
    left.append(tabs, pane, h("p", { class: "tiny" }, "切換正文、實拍與模型，已填答案會保留。"));

    const keys = [];
    st.rows.forEach((r) => st.cols.forEach((c) => keys.push(r.pt + "_" + c.key)));
    const table = (vals, onPick) =>
      h("div", { class: "q4pts" }, st.rows.map((r) => h("div", { class: "q4pt" }, h("b", {}, r.label),
        st.cols.map((c) => h("div", { class: "q4row" }, h("span", { class: "tiny" }, c.label),
          choiceButtons(c.opts, vals[r.pt + "_" + c.key], (o) => onPick(r.pt + "_" + c.key, o), "mini"))))));
    const right = writeFlow(st, ch, {
      fields: [{ key: "sentence", label: st.sentence }],
      renderDraft: (draft, changed) => h("div", {}, st.q4text ? h("p", { class: "q" }, st.q4text) : null, table(draft, (k, o) => { draft[k] = o; changed(); }),
        h("label", { class: "field" }, h("span", {}, "一句解釋：" + st.sentence), textarea(draft.sentence, 3, "", (v) => { draft.sentence = v; changed(); }))),
      isComplete: (d) => keys.every((k) => d[k]) && (d.sentence || "").trim(),
      draftText: (d) => st.rows.map((r) => r.pt + "：" + st.cols.map((c) => c.label + d[r.pt + "_" + c.key]).join("、")).join("；") + "。解釋：" + (d.sentence || ""),
      renderRevision: (rev, draft) => {
        keys.forEach((k) => { if (rev[k] === undefined) rev[k] = draft[k]; });
        if (rev.sentence === undefined) rev.sentence = draft.sentence;
        return h("div", {}, table(rev, (k, o) => (rev[k] = o)), h("label", { class: "field" }, h("span", {}, "修訂後的解釋（用觀察證據）"), textarea(rev.sentence, 3, "", (v) => (rev.sentence = v))));
      },
      onDone: () => {},
    });
    const dl = h("button", { class: "btn" }, "下載本次作答（JSON）");
    dl.onclick = () => download("json");
    return h("div", {}, h("div", { class: "flow" }, ["觀察教材", "填寫初稿", "小波追問", "自行修訂"].map((x, i) => h("span", {}, (i ? "→ " : "") + x))),
      h("div", { class: "q4" }, left, h("div", {}, right, h("div", { class: "btn-row" }, dl))));
  };

  R.sort = (st, ch) => {
    const a = S.answers[st.qid] || {};
    const placed = Object.assign({}, a.placed || {});
    const tries = Object.assign({}, a.tries || {});
    const wrongHint = [
      "看看它的結構：是不是有一層透明薄膜，上下兩個表面都會反射？",
      "它的表面是一層薄膜，還是有規律的細紋或開口、邊緣？",
      "這類生物的顏色只用一種機制就能解釋嗎？",
    ];
    const grid = h("div", { class: "sort-grid" });
    st.items.forEach((it) => {
      const fb = h("div", { class: "tiny fb-line" });
      const row = h("div", { class: "sort-item" });
      const thumb = h("div", { class: "sort-thumb" }, photoCard(it.photo));
      const btns = h("div", { class: "options col" });
      st.cats.forEach((c, i) => {
        const b = h("button", { class: "opt small" + (placed[it.id] === i ? (i === it.ans ? " ok" : " no") : "") }, c);
        b.onclick = async () => {
          btns.querySelectorAll(".opt").forEach((x) => x.classList.remove("ok", "no"));
          b.classList.add(i === it.ans ? "ok" : "no");
          placed[it.id] = i;
          tries[it.id] = (tries[it.id] || 0) + 1;
          fb.textContent = i === it.ans ? "✓ " + it.fb : "🤔 " + wrongHint[it.ans];
          await save(st.qid, { placed, tries });
          log("現象分類", { 現象: it.name, 選擇: c, 符合: i === it.ans });
        };
        btns.append(b);
      });
      if (placed[it.id] !== undefined) fb.textContent = placed[it.id] === it.ans ? "✓ " + it.fb : "🤔 " + wrongHint[it.ans];
      row.append(thumb, h("div", {}, h("b", {}, it.name), btns, fb));
      grid.append(row);
    });
    return h("div", {}, grid);
  };

  R.table = (st) => h("div", {}, h("div", { class: "tbl-wrap" }, h("table", { class: "tbl" },
    h("tr", {}, st.head.map((x) => h("th", {}, x))),
    st.rows.map((r) => h("tr", {}, r.map((c, i) => (i ? h("td", {}, c) : h("th", {}, c))))))),
    st.paras ? h("div", { class: "callout good" }, paras(st.paras)) : null);

  R.recap = (st, ch) => {
    const qid = "c" + ch + "_recap";
    const a = S.answers[qid] || {};
    const self = textarea(a.self, 2, "", null);
    const reveal = h("div", { class: "recap-reveal" });
    const checks = Object.assign({}, a.checks || {});
    function show() {
      reveal.innerHTML = "";
      reveal.append(
        h("div", { class: "callout good" }, h("b", {}, "核心理解："), st.core),
        h("div", { class: "callout" }, h("b", {}, "成立條件與易混淆處："), st.conditions),
        h("b", {}, "常見迷思——我能說明為什麼這是錯的："),
        h("div", { class: "checklist" }, st.misconceptions.map((m, i) => {
          const cb = h("input", { type: "checkbox" });
          cb.checked = !!checks[i];
          cb.onchange = () => { checks[i] = cb.checked; save(qid, { checks }); };
          return h("label", {}, cb, " ", m);
        })),
        h("p", { class: "tiny" }, st.ref.focus, h("br"), "查核依據：", h("a", { href: st.ref.url, target: "_blank", rel: "noopener" }, st.ref.label)));
    }
    const b = h("button", { class: "btn primary" }, "對照本章重點");
    b.onclick = async () => {
      await save(qid, { self: self.value, revealed: true });
      log("對照章節重點", {});
      show();
      say("比一比你寫的和整理的重點，有沒有漏掉「條件」？", "normal");
    };
    const box = h("div", {}, h("label", { class: "field" }, h("span", {}, st.selfCheck), self), h("div", { class: "btn-row" }, b), reveal);
    if (a.revealed) show();
    return box;
  };

  /* ---------------- 頁面 ---------------- */
  function curCh() { const m = location.hash.match(/#\/c\/(\d)/); return m ? +m[1] : 0; }
  function findStep(qid) {
    for (const c of S.C.chapters) for (const s of c.steps) if (s.qid === qid) return s;
    return null;
  }
  function chapterProgress(ch) {
    const n = S.C.chapters[ch - 1].steps.length;
    const m = S.pos.max[ch] ?? -1;
    return Math.round(((m + 1) / n) * 100);
  }
  function overallProgress() {
    let tot = 0, done = 0;
    S.C.chapters.forEach((c) => { tot += c.steps.length; done += Math.min(c.steps.length, (S.pos.max[c.id] ?? -1) + 1); });
    return Math.round((done / tot) * 100);
  }
  function renderNav() {
    const nav = $(".chap-nav");
    nav.innerHTML = "";
    const gp = $(".gprog");
    if (!S.code) { gp.hidden = true; $(".who").textContent = ""; return; }
    nav.append(h("a", { href: "#/home/summary", class: location.hash.startsWith("#/home") || location.hash === "#/" || !location.hash ? "on" : "" }, h("span", { class: "cn" }, "⌂"), h("span", { class: "ct" }, "主頁")));
    S.C.chapters.forEach((c) => {
      nav.append(h("a", { href: `#/c/${c.id}/${Math.max(0, Math.min(S.pos.max[c.id] ?? 0, c.steps.length - 1))}`, class: curCh() === c.id ? "on" : "" },
        h("span", { class: "cn" }, c.id), h("span", { class: "ct" }, c.short)));
    });
    const p = overallProgress();
    gp.hidden = false;
    gp.querySelector(".bar span").style.width = p + "%";
    gp.querySelector(".pct").textContent = "已學習 " + p + "%";
    gp.title = "全單元學習進度：" + p + "%";
    $(".who").textContent = (S.anon ? "匿名：" : "代碼：") + S.code;
  }

  function viewLogin() {
    say("嗨！我是小波。可以輸入學生代碼，也可以匿名登入。你在網站上的作答和操作都會被記錄下來，幫你和老師了解學習狀況。", "happy");
    const inp = h("input", { placeholder: "例如：10512", maxlength: 40, "aria-label": "學生代碼" });
    const lastCode = LS.get("ib_last_code", "");
    if (lastCode && !String(lastCode).startsWith("匿名-")) inp.value = lastCode;
    const go = h("button", { class: "btn primary big" }, "用學生代碼開始");
    const anonBtn = h("button", { class: "btn big" }, "🎭 匿名登入");
    const err = h("p", { class: "warn tiny" });
    const start = async () => {
      const code = inp.value.trim();
      if (!code) { err.textContent = "請輸入學生代碼，或改用匿名登入"; return; }
      if (code.startsWith("匿名-")) { err.textContent = "「匿名-」開頭保留給匿名登入使用"; return; }
      await login(code, false);
      location.hash = "#/home/summary";
      route();
    };
    go.onclick = start;
    inp.onkeydown = (e) => e.key === "Enter" && start();
    const prevAnon = String(lastCode).startsWith("匿名-") ? lastCode : "";
    anonBtn.onclick = async () => {
      const alpha = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      let id = "匿名-";
      const rnd = new Uint32Array(6);
      (window.crypto || {}).getRandomValues ? crypto.getRandomValues(rnd) : rnd.forEach((_, i) => (rnd[i] = Math.random() * 1e9));
      rnd.forEach((n) => (id += alpha[n % alpha.length]));
      await login(id, true);
      location.hash = "#/home/summary";
      route();
      setTimeout(() => say("你的匿名代號是「" + id + "」。想在別台電腦接著學，記下這個代號、用它登入即可。", "happy"), 300);
    };
    const resume = prevAnon
      ? h("button", { class: "btn", onclick: async () => { await login(prevAnon, true); location.hash = "#/home/summary"; route(); } }, "繼續上次的匿名身分（" + prevAnon + "）")
      : null;
    const u = S.C.unit;
    return h("div", { class: "login" },
      h("div", { class: "hero" }, h("div", { class: "hero-m", html: mascotSVG("happy") }),
        h("div", {}, h("h1", {}, u.title), h("p", { class: "lead" }, u.coreQuestion))),
      h("div", { class: "card narrow" },
        h("label", { class: "field" }, h("span", {}, "學生代碼"), inp), go, err,
        h("div", { class: "or" }, "或"), anonBtn, resume,
        h("p", { class: "tiny" }, "匿名登入會產生一個隨機代號，不需要姓名。系統會記錄你在網站上的作答、提問與操作，用來產生你的學習分析與複習單。共用設備用完請到「我的紀錄」清除暫存。")));
  }

  async function login(code, anon) {
    S.code = code;
    S.anon = anon ?? String(code).startsWith("匿名-");
    LS.set("ib_last_code", code);
    const local = LS.get(cacheKey(), null);
    try {
      const r = await post("/api/login", { code, anon: S.anon, ua: navigator.userAgent.slice(0, 120), screen: innerWidth + "x" + innerHeight });
      setOnline(true);
      S.answers = Object.assign({}, local ? local.answers : {}, r.answers);
      S.dialog = r.dialog && r.dialog.length ? r.dialog : local ? local.dialog : [];
      S.pos = r.position && r.position.max ? r.position : local ? local.pos : { last: null, max: {} };
      if (local) for (const [q, v] of Object.entries(local.answers || {})) if (!r.answers[q]) save(q, v);
      flushQueue();
    } catch {
      setOnline(false);
      S.answers = local ? local.answers : {};
      S.dialog = local ? local.dialog : [];
      S.pos = local ? local.pos : { last: null, max: {} };
    }
    S.pos.max = S.pos.max || {};
    cache();
  }

  function viewChapter(ch, idx) {
    const c = S.C.chapters[ch - 1];
    if (!c) return IB.views.home("summary");
    idx = Math.max(0, Math.min(idx, c.steps.length - 1));
    const maxReached = S.pos.max[ch] ?? -1;
    // 不能跳過尚未到達的步驟（保護「先預測再觀察」）
    if (idx > maxReached + 1) idx = maxReached + 1;
    if (location.hash !== `#/c/${ch}/${idx}`) history.replaceState(null, "", `#/c/${ch}/${idx}`);
    const st = c.steps[idx];
    S.pos.max[ch] = Math.max(maxReached, idx);
    S.pos.last = { ch, step: idx };
    cache();
    log("進入步驟", { 章: ch, 步驟: idx + 1, 標題: st.title }, ch);
    chatCtx = { ch, qid: "chat_c" + ch, stage: st.type === "predict" ? "predict" : st.type === "observe" ? "observe" : "explain" };
    say(st.mascot || "有問題就點我！", "normal");

    const container = h("div", { class: "chapter" });
    const ctl = { rerender: () => route() };
    const steps = h("ol", { class: "steps" }, c.steps.map((s, i) =>
      h("li", { class: (i === idx ? "on " : "") + (i <= (S.pos.max[ch] ?? -1) ? "seen" : "lock") },
        i <= (S.pos.max[ch] ?? -1) || i === idx ? h("a", { href: `#/c/${ch}/${i}` }, s.title) : h("span", {}, s.title))));
    const body = R[st.type] ? R[st.type](st, ch, ctl) : h("p", {}, "（未知的步驟類型）");
    const can = R[st.type] && R[st.type].canNext ? R[st.type].canNext(st) : true;
    const prev = h("a", { class: "btn", href: idx > 0 ? `#/c/${ch}/${idx - 1}` : ch > 1 ? `#/c/${ch - 1}/${S.C.chapters[ch - 2].steps.length - 1}` : "#/home/summary" }, "← 上一步");
    const isLast = idx === c.steps.length - 1;
    const nextHref = isLast ? (ch < 4 ? `#/c/${ch + 1}/0` : "#/home/map") : `#/c/${ch}/${idx + 1}`;
    const next = h("a", { class: "btn primary" + (can ? "" : " disabled"), href: can ? nextHref : null, "aria-disabled": can ? null : "true" },
      isLast ? (ch < 4 ? "前往第 " + (ch + 1) + " 章 →" : "回主頁修正我的概念地圖 →") : "下一步 →");
    if (!can) next.onclick = () => say(R[st.type].lockMsg, "think");
    const nQ = IB.questionsFor ? IB.questionsFor(ch).length : 0;
    const qBtn = h("button", { class: "btn small ghost qbtn" }, "❓ 我的提問" + (nQ ? `（${nQ}）` : ""));
    qBtn.onclick = () => IB.openQuestions && IB.openQuestions(ch);
    container.append(
      h("aside", { class: "side" }, h("div", { class: "side-h" }, "第 " + ch + " 章"), h("b", {}, c.title), steps),
      h("article", { class: "card step" },
        h("div", { class: "step-top" },
          h("div", { class: "step-top-row" }, h("span", { class: "tiny" }, `第 ${ch} 章・步驟 ${idx + 1}／${c.steps.length}`), qBtn),
          h("div", { class: "bar thin" }, h("span", { style: `width:${((idx + 1) / c.steps.length) * 100}%` }))),
        h("h2", {}, st.title),
        st.type === "intro" && IB.chapterQuestionsBox ? IB.chapterQuestionsBox(ch) : null,
        body,
        st.type === "recap" && IB.chapterAnswerBox ? IB.chapterAnswerBox(ch) : null,
        h("div", { class: "step-nav" }, prev, next)));
    return container;
  }

  function viewDone() {
    chatCtx = { ch: 0, qid: "chat_home", stage: "explain" };
    say("這裡可以下載你的學習紀錄。想再往前走，可以看看延伸學習資源。", "happy");
    const E = S.C.extension;
    const clear = h("button", { class: "btn" }, "登出並清除此裝置暫存（共用設備）");
    clear.onclick = () => {
      if (!confirm("確定清除這台裝置上的暫存嗎？（伺服器上的紀錄會保留，老師仍看得到）")) return;
      log("登出並清除暫存", {});
      flushEvents();
      LS.del(cacheKey()); LS.del("ib_last_code");
      S.code = ""; S.answers = {}; S.dialog = [];
      location.hash = "#/";
      route();
    };
    return h("div", {},
      h("div", { class: "hero" }, h("div", { class: "hero-m", html: mascotSVG("happy") }),
        h("div", {}, h("h1", {}, "我的學習紀錄"), h("p", { class: "lead" }, (S.anon ? "匿名代號：" : "學生代碼：") + S.code + "　｜　已學習 " + overallProgress() + "%"))),
      h("div", { class: "card" }, h("h3", {}, "下載紀錄"),
        h("p", { class: "tiny" }, "包含：代碼、各題初稿與修訂、學習地圖、提問與回答、測驗與單字卡紀錄、所有操作、小波對話與提示歷程、轉教師標記、時間與教材版本（" + S.C.version + "）。"),
        h("div", { class: "btn-row" }, h("button", { class: "btn primary", onclick: () => download("json") }, "下載 JSON"), h("button", { class: "btn", onclick: () => download("csv") }, "下載 CSV"), clear)),
      h("div", { class: "card" }, h("h3", {}, "延伸學習資源"),
        h("p", { class: "tiny" }, E.intro || ""),
        E.basic ? h("dl", { class: "kv" }, E.basic.flatMap(([k, v]) => [h("dt", {}, k), h("dd", {}, v)])) : null,
        h("p", { class: "tiny" }, E.note),
        h("div", { class: "tbl-wrap" }, h("table", { class: "tbl" }, h("tr", {}, E.stages.head.map((x) => h("th", {}, x))),
          E.stages.rows.map((r) => h("tr", {}, r.map((c, i) => (i ? h("td", {}, c) : h("th", {}, c))))))),
        E.groups.map((g) => h("div", {}, h("h4", {}, g.name),
          h("ul", { class: "res" }, g.items.map((it) => h("li", {},
            h("b", {}, it.url ? h("a", { href: it.url, target: "_blank", rel: "noopener" }, it.title) : it.title),
            it.links ? h("span", {}, "（", it.links.map((l, i) => [i ? "、" : "", h("a", { href: l.url, target: "_blank", rel: "noopener" }, l.label)]), "）") : null,
            "：", it.sum, h("br"), h("span", { class: "tiny" }, it.src + "｜" + it.use))))))));
  }


  /* ---------------- 資料來源與授權 ---------------- */
  function viewCredits() {
    const K = S.C.credits;
    const link = (l) => (l.url ? h("a", { href: l.url, target: "_blank", rel: "noopener" }, l.label) : l.label);
    say("這裡列出本教材所有內容、圖片與外部資源的出處與授權。", "normal");
    const photos = Object.values(S.C.photos);
    const seen = new Set();
    const uniq = photos.filter((p) => (seen.has(p.file) ? false : seen.add(p.file)));
    return h("div", {},
      h("div", { class: "card" }, h("h1", {}, "資料來源與授權"),
        h("p", {}, "本線上教材的文字、題目、引導策略與評量設計，全部整理自「干涉與繞射」單元的十份設計文件；未加入文件以外的學科內容。"),
        h("p", { class: "tiny" }, "設計文件作者：" + K.designer + "。教材版本：" + S.C.version + "。"),
        S.code ? h("a", { class: "btn small", href: "#/home/summary" }, "← 回主頁") : h("a", { class: "btn small", href: "#/" }, "← 回登入頁")),
      h("div", { class: "card" }, h("h2", {}, "一、教材內容來源（十份設計文件）"),
        h("div", { class: "tbl-wrap" }, h("table", { class: "tbl" }, h("tr", {}, ["編號", "文件", "在本教材中的使用"].map((x) => h("th", {}, x))),
          K.docs.map((d) => h("tr", {}, h("th", {}, d[0]), h("td", {}, d[1]), h("td", {}, d[2])))))),
      h("div", { class: "card" }, h("h2", {}, "二、照片（" + uniq.length + " 張，取自 Wikimedia Commons）"),
        h("p", { class: "tiny" }, "照片清單與用途依 07A 多模態輔助教材素材清單。本站使用 Wikimedia Commons 產生的縮圖版本（寬約 960–1600 像素），未修改影像內容。依各授權條款標示作者、授權與來源；CC BY-SA 授權的照片若再散布或改作，須以相同授權釋出。"),
        h("div", { class: "tbl-wrap" }, h("table", { class: "tbl" }, h("tr", {}, ["照片", "Commons 檔名", "作者", "授權", "用途（07A）"].map((x) => h("th", {}, x))),
          uniq.map((p) => h("tr", {},
            h("td", {}, h("img", { src: "assets/" + p.file, alt: p.use, class: "cred-thumb", loading: "lazy" })),
            h("td", {}, h("a", { href: p.url, target: "_blank", rel: "noopener" }, p.commonsTitle)),
            h("td", {}, p.author),
            h("td", {}, p.licenseUrl ? h("a", { href: p.licenseUrl, target: "_blank", rel: "noopener" }, p.license) : p.license + "（依 Commons 檔案頁標示）"),
            h("td", {}, p.kind + "：" + p.use)))))),
      h("div", { class: "card" }, h("h2", {}, "三、內容查核依據"), h("ul", { class: "res" }, K.refs.map((r) => h("li", {}, link(r), h("br"), h("span", { class: "tiny" }, r.note))))),
      h("div", { class: "card" }, h("h2", {}, "四、延伸學習資源（04）"),
        h("ul", { class: "res" }, S.C.extension.groups.flatMap((g) => g.items.map((it) => h("li", {},
          it.url ? h("a", { href: it.url, target: "_blank", rel: "noopener" }, it.title) : it.title,
          it.links ? h("span", {}, "（", it.links.map((l, i) => [i ? "、" : "", h("a", { href: l.url, target: "_blank", rel: "noopener" }, l.label)]), "）") : null,
          h("br"), h("span", { class: "tiny" }, "來源：" + it.src + "｜" + g.name)))))),
      h("div", { class: "card" }, h("h2", {}, "五、設計文件引用的格式與設計參考（08、10）"), h("ul", { class: "res" }, K.design.map((r) => h("li", {}, link(r), h("span", { class: "tiny" }, "　" + r.note))))),
      h("div", { class: "card" }, h("h2", {}, "六、本教材自製內容"), h("ul", { class: "res" }, K.selfmade.map((t) => h("li", {}, t)))));
  }

  /* ---------------- 彈出視窗 ---------------- */
  function openModal(title, node) {
    const m = $(".modal");
    m.querySelector(".modal-title").textContent = title;
    const b = m.querySelector(".modal-body");
    b.innerHTML = "";
    b.append(node);
    m.hidden = false;
    log("開啟視窗", { 視窗: title });
  }
  function closeModal() { $(".modal").hidden = true; if (IB.onModalClose) { const f = IB.onModalClose; IB.onModalClose = null; f(); } }
  $(".modal-x").onclick = closeModal;
  $(".modal").addEventListener("click", (e) => { if (e.target === $(".modal")) closeModal(); });

  /* ---------------- 行為紀錄：點擊、輸入、停留時間 ---------------- */
  let pageStart = Date.now(), pageName = "";
  function pageLabel() { return location.hash || "#/"; }
  document.addEventListener("click", (e) => {
    if (!S.code) return;
    const t = e.target.closest("button, a, .opt, .sd-cell, .path, summary, .flip, .map-node, input[type=checkbox]");
    if (!t) return;
    const label = (t.getAttribute("aria-label") || t.textContent || t.value || t.className || "").trim().replace(/\s+/g, " ").slice(0, 60);
    log("點擊", { 元件: t.tagName.toLowerCase(), 文字: label, 頁面: pageLabel() });
  }, true);
  document.addEventListener("change", (e) => {
    if (!S.code) return;
    const t = e.target;
    if (!t.matches("textarea, input")) return;
    const lab = t.closest("label") ? t.closest("label").querySelector("span")?.textContent || "" : t.placeholder || "";
    log("輸入", { 欄位: lab.slice(0, 40), 字數: (t.value || "").length, 頁面: pageLabel() });
  }, true);
  document.addEventListener("visibilitychange", () => { if (S.code) log(document.hidden ? "離開分頁" : "回到分頁", { 頁面: pageLabel() }); });
  function trackPage() {
    if (S.code && pageName) log("頁面停留", { 頁面: pageName, 秒數: Math.round((Date.now() - pageStart) / 1000) });
    pageName = pageLabel();
    pageStart = Date.now();
  }

  function route() {
    Sims.stopAll();
    trackPage();
    $(".chat").hidden = true;
    $(".modal").hidden = true;
    const app = $("#app");
    app.innerHTML = "";
    const hs = location.hash;
    if (hs.startsWith("#/credits")) { renderNav(); app.append(viewCredits()); window.scrollTo(0, 0); return; }
    if (!S.code) { renderNav(); app.append(viewLogin()); return; }
    let m, view;
    if ((m = hs.match(/^#\/c\/(\d)\/(\d+)/))) view = viewChapter(+m[1], +m[2]);
    else if (hs.startsWith("#/done")) view = viewDone();
    else if ((m = hs.match(/^#\/sheet\/(\d)/)) && IB.views.sheet) view = IB.views.sheet(+m[1]);
    else if ((m = hs.match(/^#\/cards\/(\d)/)) && IB.views.cards) view = IB.views.cards(+m[1]);
    else { m = hs.match(/^#\/home\/(\w+)/); chatCtx = { ch: 0, qid: "chat_home", stage: "explain" }; view = IB.views.home(m ? m[1] : "summary"); }
    renderNav();
    app.append(view);
    window.scrollTo(0, 0);
    flushEvents();
  }
  window.addEventListener("hashchange", route);

  /* ---------------- 對外介面（給 home.js、assess.js） ---------------- */
  const IB = (window.IB = {
    S, $, h, esc, LS, R, save, log, say, ask, post, cache, route, download, photoCard, figure, paras, savedTag, markSaved,
    textarea, choiceButtons, mascotSVG, lightbox, openModal, closeModal, findStep, chapterProgress, overallProgress, curCh, debounce,
    views: {},
  });

  async function boot() {
    $(".mascot-btn").innerHTML = mascotSVG("normal");
    S.C = await (await fetch("content.json")).json();
    // 有 Python 伺服器 → 伺服器模式；沒有（例如 GitHub Pages）→ 瀏覽器端模式
    let server = false;
    try { const r = await fetch("api/status", { cache: "no-store" }); server = r.ok && (await r.json()).ok === true; } catch {}
    if (!server && window.LocalAPI) await LocalAPI.init();
    S.mode = server ? "server" : "local";
    const last = LS.get("ib_last_code", "");
    if (last && LS.get("ib_cache_" + last, null)) await login(last);
    route();
  }
  window.addEventListener("load", boot);
})();
