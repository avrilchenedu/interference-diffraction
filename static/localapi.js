/* 瀏覽器端後端：沒有 Python 伺服器時（例如 GitHub Pages）自動接手。
   資料只存在這台裝置的瀏覽器（localStorage），可下載 JSON／CSV 交給老師。
   小波追問使用與 server.py 相同的規則（socratic.json）。 */
(function () {
  "use strict";
  const KEY = "ib_local_db_v1";
  let RULES = null, VERSION = "";
  const now = () => Date.now() / 1000;
  const pad = (n) => String(n).padStart(2, "0");
  const tsStr = (t) => { if (!t) return ""; const d = new Date(t * 1000); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || { students: {} }; } catch { return { students: {} }; } }
  function store(db) {
    try { localStorage.setItem(KEY, JSON.stringify(db)); }
    catch {
      // 空間不足：先裁掉最舊的操作紀錄
      Object.values(db.students).forEach((s) => { s.events = s.events.slice(-1500); s.history = s.history.slice(-800); });
      try { localStorage.setItem(KEY, JSON.stringify(db)); } catch {}
    }
  }
  function stu(db, code) {
    if (!db.students[code]) db.students[code] = { created: now(), last_seen: now(), position: {}, answers: {}, history: [], events: [], dialog: [], hints: {} };
    const s = db.students[code];
    s.last_seen = now();
    return s;
  }
  const has = (t, kws) => kws.some((k) => t.includes(k));

  function ruleGuide(s, ch, qid, message, draftText, stage) {
    const msg = message || "";
    if (has(msg, RULES.answerSeeking.keywords)) return [RULES.answerSeeking.reply[String(ch)] || RULES.generic[0], "answer_seeking", 0, false];
    if (stage === "predict") return ["我先不揭曉答案喔！預測沒有對錯——你這樣預測，是根據什麼想法或經驗？", "predict", 0, false];
    if (stage === "observe") return ["現在先只記錄看到的，等一下再解釋。你在畫面上看到哪些特徵？這份資料是實拍還是模型？", "observe", 0, false];
    const H = (t) => s.hints[ch + ":" + t] || (s.hints[ch + ":" + t] = { level: 0, asked: {} });
    const topics = RULES.topics.filter((t) => t.ch === ch);
    let hit = null;
    for (const src of [msg, draftText || ""]) {
      hit = topics.find((t) => !t.soft && has(src, t.kw));
      if (hit) break;
    }
    if (hit) {
      const st = H(hit.id);
      if (st.level >= 3) { st.level++; return [RULES.handoff, hit.id, st.level, true]; }
      const reply = hit.L[st.level];
      const handoff = st.level === 2;
      st.level++;
      return [reply, hit.id, st.level, handoff];
    }
    const checks = RULES.checks[qid] || [];
    if (checks.length && draftText) {
      const st = H("check:" + qid);
      for (let i = 0; i < checks.length; i++) {
        if (!has(draftText, checks[i].need) && (st.asked[i] || 0) < 2) {
          st.asked[i] = (st.asked[i] || 0) + 1; st.level++;
          return [checks[i].ask, "check:" + qid, i + 1, false];
        }
      }
    }
    for (const t of topics) {
      if (t.soft && has(msg, t.kw)) { const st = H(t.id); const r = t.L[Math.min(st.level, 2)]; st.level++; return [r, t.id, st.level, false]; }
    }
    if (draftText && checks.length) return [RULES.allGood, "all_good", 0, false];
    const st = H("generic"); const r = RULES.generic[st.level % RULES.generic.length]; st.level++;
    return [r, "generic", 0, false];
  }

  function exportJSON(db, codes) {
    return {
      教材版本: VERSION, 匯出時間: tsStr(now()), 來源: "瀏覽器端紀錄（公開網站版）",
      students: codes.filter((c) => db.students[c]).map((code) => {
        const s = db.students[code];
        return {
          學生代碼: code, 建立時間: tsStr(s.created), 最後活動: tsStr(s.last_seen), 位置: s.position,
          目前作答: s.answers,
          作答歷程: s.history.map((h) => ({ 題號: h.qid, 時間: tsStr(h.ts), 內容: h.data })),
          操作紀錄: s.events.map((e) => ({ 章: e.chapter, 動作: e.action, 細節: e.detail, 時間: tsStr(e.ts) })),
          小波對話: s.dialog.map((d) => ({ 章: d.chapter, 題號: d.qid, 角色: d.role === "student" ? "學生" : "小波", 內容: d.text, 提示主題: d.topic, 提示層次: d.level, 轉教師: !!d.handoff, 引擎: d.engine, 時間: tsStr(d.ts) })),
        };
      }),
    };
  }
  function exportCSV(json) {
    const q = (v) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
    const rows = [["類型", "學生代碼", "章", "題號", "欄位／動作", "內容", "時間", "教材版本"]];
    json.students.forEach((s) => {
      s.作答歷程.forEach((h) => Object.entries(h.內容 || {}).forEach(([k, v]) => { if (!k.startsWith("_")) rows.push(["作答歷程", s.學生代碼, h.題號.split("_")[0], h.題號, k, typeof v === "string" ? v : JSON.stringify(v), h.時間, json.教材版本]); }));
      s.操作紀錄.forEach((e) => rows.push(["操作紀錄", s.學生代碼, "c" + e.章, "", e.動作, JSON.stringify(e.細節), e.時間, json.教材版本]));
      s.小波對話.forEach((d) => rows.push(["小波對話", s.學生代碼, "c" + d.章, d.題號, d.角色 + (d.轉教師 ? "（轉教師）" : ""), d.內容, d.時間, json.教材版本]));
    });
    return "﻿" + rows.map((r) => r.map(q).join(",")).join("\r\n");
  }

  const LocalAPI = {
    active: false,
    async init() {
      const [r, c] = await Promise.all([fetch("socratic.json").then((x) => x.json()), fetch("content.json").then((x) => x.json())]);
      RULES = r; VERSION = c.version;
      this.active = true;
    },
    async handle(path, body) {
      const db = load();
      const code = String(body.code || "").trim().slice(0, 40);
      if (!code) throw new Error("請先輸入學生代碼");
      const s = stu(db, code);
      let out;
      if (path.endsWith("/login")) {
        s.events.push({ ts: now(), chapter: 0, action: "登入", detail: { 匿名: !!body.anon, 裝置: String(body.ua || "").slice(0, 120), 畫面: body.screen || "" } });
        out = { code, position: s.position, answers: s.answers, dialog: s.dialog };
      } else if (path.endsWith("/save")) {
        const qid = String(body.qid || "").slice(0, 60);
        const data = body.data || {};
        s.answers[qid] = Object.assign(s.answers[qid] || {}, data, { _updated: tsStr(now()) });
        s.history.push({ qid, ts: now(), data });
        out = { ok: true, saved: s.answers[qid]._updated };
      } else if (path.endsWith("/events")) {
        if (body.position) s.position = body.position;
        (body.events || []).slice(0, 200).forEach((e) => s.events.push({ ts: e.ts || now(), chapter: +e.chapter || 0, action: String(e.action).slice(0, 60), detail: e.detail || {} }));
        if (s.events.length > 6000) s.events = s.events.slice(-6000);
        out = { ok: true };
      } else if (path.endsWith("/guide")) {
        const ch = +body.chapter || 0;
        const draft = body.draft || "";
        const draftText = typeof draft === "object" ? Object.values(draft).filter(Boolean).join("\n") : String(draft);
        const [reply, topic, level, handoff] = ruleGuide(s, ch, body.qid || "", String(body.message || "").trim().slice(0, 1000), draftText, body.stage || "explain");
        s.dialog.push({ ts: now(), chapter: ch, qid: body.qid || "", role: "student", text: body.message || "（請小波追問）", handoff: 0 });
        s.dialog.push({ ts: now(), chapter: ch, qid: body.qid || "", role: "guide", text: reply, topic, level, handoff: handoff ? 1 : 0, engine: "rules" });
        out = { reply, handoff, topic, level, engine: "rules" };
      } else throw new Error("not found");
      store(db);
      return out;
    },
    exportFile(code, fmt) {
      const json = exportJSON(load(), [code]);
      return fmt === "csv"
        ? { blob: new Blob([exportCSV(json)], { type: "text/csv;charset=utf-8" }), name: `學習紀錄_${code}.csv` }
        : { blob: new Blob([JSON.stringify(json, null, 2)], { type: "application/json" }), name: `學習紀錄_${code}.json` };
    },
    allJSON() { const db = load(); return exportJSON(db, Object.keys(db.students)); },
    exportCSV,
    tsStr,
  };
  window.LocalAPI = LocalAPI;
})();
