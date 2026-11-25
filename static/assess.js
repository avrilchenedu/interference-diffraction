/* 評量系統：章末測驗、概念熟悉度、專屬複習學習單、單字互動卡 */
(function () {
  "use strict";
  const IB = window.IB;
  const { S, h, save, log, say } = IB;
  const conceptsOf = (ch) => S.C.concepts.filter((c) => c.ch === ch);
  const concept = (id) => S.C.concepts.find((c) => c.id === id);

  /* ================= 熟悉度 ================= */
  // 由學生的實際作答與操作推估：測驗首答、選擇題嘗試次數、分類活動、薄膜選光路、小波提示主題、單字卡自評
  function evidence() {
    const ev = {};
    const add = (id, v, why) => { if (!id) return; (ev[id] = ev[id] || []).push({ v, why }); };
    const A = S.answers;
    for (const ch of [1, 2, 3, 4]) {
      const qz = A["quiz_c" + ch];
      if (qz && qz.first) S.C.quiz[ch].forEach((it, i) => add(it.concept, qz.first.correct[i] ? 2 : -2, "測驗第" + (i + 1) + "題" + (qz.first.correct[i] ? "答對" : "答錯")));
    }
    for (const [qid, cs] of Object.entries(S.C.qidConcepts)) {
      const a = A[qid];
      if (!a || !a.attempts || !a.attempts.length) continue;
      const step = IB.findStep(qid);
      const okText = (step.options.find((o) => o.ok) || {}).t;
      const wrong = a.attempts.indexOf(okText) === -1 ? a.attempts.length : a.attempts.indexOf(okText);
      cs.forEach((c) => add(c, wrong === 0 ? 1 : -Math.min(2, wrong), wrong === 0 ? "「" + step.title + "」一次判斷正確" : "「" + step.title + "」試了 " + (wrong + 1) + " 次"));
    }
    const sort = A.c4_sort;
    if (sort && sort.placed) {
      const st = IB.findStep("c4_sort");
      st.items.forEach((it) => {
        const t = (sort.tries || {})[it.id];
        if (!t) return;
        const ok = sort.placed[it.id] === it.ans;
        add(S.C.sortConcepts[it.id], ok && t === 1 ? 1 : -Math.min(2, t - (ok ? 1 : 0)), "分類「" + it.name + "」" + (ok && t === 1 ? "一次正確" : "試了 " + t + " 次"));
      });
    }
    const film = A.c4_sim_film;
    if (film && film.tries) add("thin_film", film.correct && film.tries === 1 ? 1 : -1, "薄膜剖面選光路試了 " + film.tries + " 次");
    S.dialog.forEach((d) => {
      const c = S.C.topicConcepts[d.topic];
      if (d.role === "guide" && c) add(c, -0.5, "小波針對「" + concept(c).term + "」給了提示");
    });
    for (const ch of [1, 2, 3, 4]) {
      const cards = A["cards_c" + ch];
      if (!cards) continue;
      Object.entries(cards.known || {}).forEach(([c, n]) => add(c, Math.min(1, n * 0.5), "單字卡：記得"));
      Object.entries(cards.again || {}).forEach(([c, n]) => add(c, -Math.min(1, n * 0.5), "單字卡：再看一次"));
    }
    return ev;
  }
  function mastery(ch) {
    const ev = evidence();
    return conceptsOf(ch).map((k) => {
      const list = ev[k.id] || [];
      const score = list.reduce((a, x) => a + x.v, 0);
      const pct = list.length ? Math.max(0, Math.min(100, Math.round(55 + score * 12))) : null;
      return { k, pct, list, level: pct === null ? "尚無資料" : pct >= 70 ? "熟悉" : pct >= 45 ? "尚可" : "需加強" };
    });
  }
  function weakOf(ch) {
    const m = mastery(ch);
    const known = m.filter((x) => x.pct !== null).sort((a, b) => a.pct - b.pct);
    let weak = known.filter((x) => x.pct < 70);
    if (!weak.length) weak = known.slice(0, 2);
    if (!weak.length) weak = m.slice(0, 2);
    return weak;
  }
  IB.chapterMastery = (ch) => {
    const m = mastery(ch).filter((x) => x.pct !== null);
    return m.length ? Math.round(m.reduce((a, x) => a + x.pct, 0) / m.length) : null;
  };

  function masteryList(ch) {
    return h("div", { class: "mast-list" }, mastery(ch).map((x) =>
      h("div", { class: "mast-row lv-" + x.level },
        h("button", { class: "mast-term", onclick: () => IB.showConcept(x.k) }, x.k.term),
        h("div", { class: "bar" }, h("span", { style: `width:${x.pct ?? 0}%` })),
        h("span", { class: "mast-lv tiny" }, x.level + (x.pct !== null ? " " + x.pct + "%" : "")),
        x.list.length ? h("details", { class: "mast-why" }, h("summary", { class: "tiny" }, "依據"), h("ul", { class: "tiny" }, x.list.map((e) => h("li", {}, e.why)))) : null)));
  }

  /* ================= 章末統整步驟 ================= */
  IB.R.review = function (st, ch) {
    const items = S.C.quiz[ch];
    const qid = "quiz_c" + ch;
    const saved = S.answers[qid] || {};
    const state = { picks: {}, round: saved.first ? (saved.done ? 3 : 2) : 1 };
    const box = h("div");
    const quizBox = h("div", { class: "card inner" });
    const after = h("div");
    function drawQuiz() {
      const cur = S.answers[qid] || {};
      quizBox.innerHTML = "";
      quizBox.append(h("h3", {}, "一、小測驗（" + items.length + " 題）"),
        h("p", { class: "tiny" }, cur.first ? "首次作答得分：" + cur.first.score + "／" + cur.first.total + "（首次作答列入評量；答錯的題目可以看提示再試一次）" : "每題選一個答案，全部作答後送出。首次作答的結果會列入評量。"));
      items.forEach((it, i) => {
        const lastCorrect = cur.latest ? cur.latest.correct[i] : null;
        const locked = cur.first && (lastCorrect || cur.done);
        const fb = h("div", { class: "tiny qfb" });
        if (cur.first && !lastCorrect && !cur.done) fb.textContent = "🤔 提示：" + it.hint;
        if (cur.done && !lastCorrect) { fb.textContent = "📖 正確答案：「" + it.opts[it.ans] + "」。" + concept(it.concept).def; }
        if (lastCorrect) fb.textContent = "✓ 正確";
        const pick = locked ? it.opts[cur.latest.picks[i]] : null;
        const opts = h("div", { class: "options col" }, it.opts.map((o, j) => {
          const b = h("button", { class: "opt" + (locked && j === cur.latest.picks[i] ? (lastCorrect ? " ok" : " no") : "") + (state.picks[i] === j ? " on" : ""), disabled: locked }, o);
          b.onclick = () => { state.picks[i] = j; opts.querySelectorAll(".opt").forEach((x, k) => x.classList.toggle("on", k === j)); };
          return b;
        }));
        quizBox.append(h("div", { class: "quiz-item" + (lastCorrect ? " ok" : cur.first ? " retry" : "") },
          h("p", { class: "q" }, (i + 1) + ". " + it.q, h("span", { class: "tiny" }, "　（" + concept(it.concept).term + "）")), opts, fb));
        void pick;
      });
      if (!cur.done) {
        const btn = h("button", { class: "btn primary" }, cur.first ? "送出訂正" : "送出測驗");
        const warn = h("span", { class: "tiny warn" });
        btn.onclick = async () => {
          const need = items.map((_, i) => i).filter((i) => !(cur.latest && cur.latest.correct[i]));
          if (need.some((i) => state.picks[i] === undefined)) { warn.textContent = "還有題目沒選"; return; }
          const picks = items.map((_, i) => (cur.latest && cur.latest.correct[i] ? cur.latest.picks[i] : state.picks[i]));
          const correct = items.map((it, i) => picks[i] === it.ans);
          const score = correct.filter(Boolean).length;
          const rec = { picks, correct, score, total: items.length, at: new Date().toLocaleString() };
          const attempts = (cur.attempts || []).concat([rec]);
          const data = { attempts, latest: rec };
          if (!cur.first) data.first = rec;
          if (cur.first || score === items.length) data.done = true;
          await save(qid, data);
          log("測驗送出", { 章: ch, 第幾次: attempts.length, 得分: score + "/" + items.length });
          state.picks = {};
          if (score === items.length) say("全對！你對這章的概念掌握得很好。", "happy");
          else if (!cur.first) say("答錯的題目我給了提示，不會直接給答案。看完提示，再試一次！", "think");
          else say("訂正完成！我把仍不熟的部分整理進你的複習學習單和單字卡。", "normal");
          drawQuiz();
          drawAfter();
        };
        quizBox.append(h("div", { class: "btn-row" }, btn, warn));
      }
    }
    function drawAfter() {
      after.innerHTML = "";
      const cur = S.answers[qid] || {};
      if (!cur.first) { after.append(h("p", { class: "tiny" }, "完成測驗後，這裡會出現你的熟悉度分析、專屬複習學習單與單字卡。")); return; }
      const weak = weakOf(ch);
      after.append(
        h("div", { class: "card inner" }, h("h3", {}, "二、概念熟悉度分析"),
          h("p", { class: "tiny" }, "依據你在本章的測驗、選擇題嘗試次數、活動操作、小波提示與單字卡自評推估。點概念名稱可看說明。"),
          masteryList(ch),
          h("div", { class: "callout warn" }, h("b", {}, "比較不熟悉的概念："), weak.map((x) => x.k.term).join("、"))),
        h("div", { class: "card inner" }, h("h3", {}, "三、我的專屬複習"),
          h("p", { class: "tiny" }, "學習單會依你不熟悉的概念、答錯過的題目與你的提問自動生成；單字卡會把不熟的詞放在最前面。"),
          h("div", { class: "btn-row" },
            h("a", { class: "btn primary", href: "#/sheet/" + ch }, "📄 生成我的複習學習單"),
            h("a", { class: "btn", href: "#/cards/" + ch }, "🃏 單字互動卡")),
          h("h4", {}, "先翻幾張卡試試："), deck(ch, { compact: true })));
    }
    drawQuiz();
    drawAfter();
    box.append(quizBox, after);
    return box;
  };
  IB.R.review.canNext = () => true;

  /* ================= 複習學習單 ================= */
  IB.views.sheet = function (ch) {
    const c = S.C.chapters[ch - 1];
    if (!c) return h("p", {}, "找不到章節");
    const weak = weakOf(ch);
    const qz = S.answers["quiz_c" + ch] || {};
    const wrongItems = qz.first ? S.C.quiz[ch].filter((_, i) => !qz.first.correct[i]) : [];
    const recap = c.steps.find((s) => s.type === "recap");
    const myQs = ((S.answers.questions || {}).list || []).filter((q) => q.ch === ch);
    const date = new Date().toLocaleDateString();
    log("生成複習學習單", { 章: ch, 不熟概念: weak.map((x) => x.k.term) });
    say("這是依你的學習紀錄生成的學習單。可以直接在畫面上寫，也可以列印出來。", "happy");
    const sheet = h("div", { class: "sheet", id: "sheet" },
      h("div", { class: "sheet-head" },
        h("div", {}, h("h1", {}, "專屬複習學習單"), h("div", {}, S.C.unit.title + "｜第 " + ch + " 章　" + c.title)),
        h("div", { class: "tiny" }, (S.anon ? "匿名代號：" : "學生代碼：") + S.code, h("br"), "生成日期：" + date, h("br"), "教材版本：" + S.C.version)),
      h("h2", {}, "一、我比較不熟悉的概念"),
      weak.map((x, i) => h("div", { class: "sheet-item" },
        h("b", {}, (i + 1) + ". " + x.k.term), x.pct !== null ? h("span", { class: "tiny" }, "（目前熟悉度 " + x.pct + "%）") : null,
        h("p", {}, x.k.def),
        h("div", { class: "lines" }, "用自己的話再說一次：", h("div", { class: "line" }), h("div", { class: "line" })))),
      h("h2", {}, "二、成立條件與易混淆處"),
      h("p", {}, recap.conditions),
      h("div", { class: "checklist" }, h("b", {}, "我能說明為什麼這些是迷思："), recap.misconceptions.map((m) => h("label", {}, h("input", { type: "checkbox" }), " ", m))),
      h("h2", {}, "三、再試一次（你首次答錯的題目）"),
      wrongItems.length ? wrongItems.map((it, i) => h("div", { class: "sheet-item" },
        h("b", {}, (i + 1) + ". " + it.q),
        h("div", {}, it.opts.map((o) => h("div", {}, "□ " + o))),
        h("p", { class: "tiny" }, "提示：" + it.hint),
        h("div", { class: "lines" }, "我的理由：", h("div", { class: "line" }))))
        : h("p", { class: "tiny" }, qz.first ? "首次測驗全對！挑一個概念，試著說明給同學聽。" : "你還沒做本章小測驗，完成後這裡會列出需要再練習的題目。"),
      h("h2", {}, "四、我的提問"),
      myQs.length ? myQs.map((q) => h("div", { class: "sheet-item" }, h("b", {}, "❓ " + q.text), h("span", { class: "tiny" }, "（" + ({ open: "還不確定", partial: "部分理解", answered: "我能回答了" }[q.status]) + "）"),
        q.answer ? h("p", {}, "目前的答案：" + q.answer) : null, h("div", { class: "lines" }, "學完後補充：", h("div", { class: "line" }))))
        : h("p", { class: "tiny" }, "這章沒有記錄提問。"),
      h("h2", {}, "五、本章核心理解"),
      h("p", {}, recap.core),
      h("p", { class: "tiny" }, "查核依據：" + recap.ref.label));
    const toolbar = h("div", { class: "btn-row no-print" },
      h("a", { class: "btn", href: "#/c/" + ch + "/" + (c.steps.length - 1) }, "← 回本章統整"),
      h("button", { class: "btn primary", onclick: () => { log("列印複習學習單", { 章: ch }); window.print(); } }, "🖨 列印／存成 PDF"),
      h("button", { class: "btn", onclick: () => downloadSheet(ch, sheet) }, "⬇ 下載學習單（HTML）"),
      h("a", { class: "btn", href: "#/cards/" + ch }, "🃏 單字卡"));
    save("sheet_c" + ch, { generatedAt: new Date().toLocaleString(), weak: weak.map((x) => x.k.id), wrong: wrongItems.map((x) => x.concept) });
    return h("div", {}, toolbar, sheet);
  };
  function downloadSheet(ch, node) {
    const css = `body{font-family:-apple-system,"PingFang TC","Microsoft JhengHei",sans-serif;max-width:780px;margin:24px auto;padding:0 16px;line-height:1.7;color:#222}
      h1{font-size:1.5rem;margin:0}h2{font-size:1.1rem;border-bottom:2px solid #333;margin-top:1.4rem}.sheet-head{display:flex;justify-content:space-between;border-bottom:3px double #333;padding-bottom:8px}
      .sheet-item{margin:10px 0;break-inside:avoid}.line{border-bottom:1px solid #999;height:26px}.tiny{font-size:.82rem;color:#555}.checklist label{display:block}`;
    const html = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>複習學習單 第${ch}章</title><style>${css}</style></head><body>${node.outerHTML}</body></html>`;
    const a = h("a", { href: URL.createObjectURL(new Blob([html], { type: "text/html" })), download: `複習學習單_第${ch}章_${S.code}.html` });
    document.body.append(a); a.click(); a.remove();
    log("下載複習學習單", { 章: ch });
  }

  /* ================= 單字互動卡 ================= */
  function deck(ch, opt = {}) {
    const chs = ch ? [ch] : [1, 2, 3, 4];
    const weakIds = new Set(chs.flatMap((c) => weakOf(c).map((x) => x.k.id)));
    let cards = chs.flatMap((c) => conceptsOf(c)).sort((a, b) => (weakIds.has(b.id) ? 1 : 0) - (weakIds.has(a.id) ? 1 : 0));
    if (opt.compact) cards = cards.slice(0, 4);
    const queue = cards.slice();
    const total = cards.length;
    let known = 0, flips = 0;
    const box = h("div", { class: "deck" });
    function draw() {
      box.innerHTML = "";
      if (!queue.length) {
        box.append(h("div", { class: "deck-done" }, h("div", { class: "fb-face", html: IB.mascotSVG("happy") }),
          h("p", {}, "這一輪完成！" + total + " 張卡全部記住了（翻了 " + flips + " 次）。"),
          h("button", { class: "btn", onclick: () => { queue.push(...cards); known = 0; flips = 0; draw(); } }, "再練一輪")));
        return;
      }
      const k = queue[0];
      const card = h("button", { class: "flip", "aria-label": "翻面：" + k.term },
        h("div", { class: "flip-inner" },
          h("div", { class: "face front" }, weakIds.has(k.id) ? h("span", { class: "tag warn-tag" }, "需加強") : null, h("div", { class: "term" }, k.term), h("div", { class: "tiny" }, "第 " + k.ch + " 章｜點卡片翻面")),
          h("div", { class: "face back" }, h("p", {}, k.def))));
      card.onclick = () => { card.classList.toggle("flipped"); if (card.classList.contains("flipped")) flips++; };
      const rec = async (good) => {
        const key = "cards_c" + k.ch;
        const cur = S.answers[key] || {};
        const m = Object.assign({}, good ? cur.known || {} : cur.again || {});
        m[k.id] = (m[k.id] || 0) + 1;
        await save(key, good ? { known: m, last: new Date().toLocaleString() } : { again: m, last: new Date().toLocaleString() });
        log("單字卡", { 概念: k.term, 自評: good ? "記得" : "再看一次" });
        queue.shift();
        if (good) known++; else queue.push(k);
        draw();
      };
      box.append(h("div", { class: "deck-top tiny" }, `已記住 ${known}／${total}　｜　剩下 ${queue.length} 張`),
        h("div", { class: "bar thin" }, h("span", { style: `width:${(known / total) * 100}%` })),
        card,
        h("div", { class: "btn-row center" },
          h("button", { class: "btn", onclick: () => rec(false) }, "🔁 再看一次"),
          h("button", { class: "btn primary", onclick: () => rec(true) }, "✓ 我記得")));
    }
    draw();
    return box;
  }
  IB.views.cards = function (ch) {
    const title = ch ? "第 " + ch + " 章　" + S.C.chapters[ch - 1].title : "全部章節";
    log("開啟單字卡", { 章: ch || "全部" });
    say("先看詞，自己在心裡說出意思，再翻面對照。不熟的按「再看一次」，它會排到後面再出現。", "normal");
    return h("div", { class: "card" },
      h("div", { class: "btn-row" }, h("a", { class: "btn small", href: "#/home/assess" }, "← 評量與複習"), ch ? h("a", { class: "btn small", href: "#/sheet/" + ch }, "📄 複習學習單") : null,
        h("span", { class: "chips" }, [0, 1, 2, 3, 4].map((c) => h("a", { class: "chip" + (c === ch ? " on" : ""), href: "#/cards/" + c }, c ? "第" + c + "章" : "全部")))),
      h("h2", {}, "單字互動卡｜" + title), deck(ch));
  };

  /* ================= 主頁：評量與複習 ================= */
  IB.views.assessTab = function () {
    const rows = [1, 2, 3, 4].map((ch) => {
      const qz = S.answers["quiz_c" + ch] || {};
      const m = IB.chapterMastery(ch);
      return h("tr", {},
        h("th", {}, "第" + ch + "章 " + S.C.chapters[ch - 1].short),
        h("td", {}, IB.chapterProgress(ch) + "%"),
        h("td", {}, qz.first ? qz.first.score + "／" + qz.first.total : "—"),
        h("td", {}, qz.latest ? qz.latest.score + "／" + qz.latest.total : "—"),
        h("td", {}, m === null ? "—" : m + "%"),
        h("td", {}, h("div", { class: "btn-row tight" },
          h("a", { class: "btn small", href: "#/c/" + ch + "/" + (S.C.chapters[ch - 1].steps.length - 1) }, "章末測驗"),
          h("a", { class: "btn small", href: "#/sheet/" + ch }, "學習單"),
          h("a", { class: "btn small", href: "#/cards/" + ch }, "單字卡"))));
    });
    const totalFirst = [1, 2, 3, 4].reduce((a, ch) => a + ((S.answers["quiz_c" + ch] || {}).first || { score: 0 }).score, 0);
    const done = [1, 2, 3, 4].filter((ch) => (S.answers["quiz_c" + ch] || {}).first).length;
    const qs = (S.answers.questions || {}).list || [];
    const asks = S.dialog.filter((d) => d.role === "student").length;
    const sel = { ch: 1 };
    const mBox = h("div");
    const drawM = () => { mBox.innerHTML = ""; mBox.append(masteryList(sel.ch)); };
    drawM();
    return h("div", {},
      h("div", { class: "stat-grid" },
        stat("已學習", IB.overallProgress() + "%"),
        stat("章末測驗", done + "／4 章"),
        stat("首次作答總分", totalFirst + "／" + Object.values(S.C.quiz).reduce((a, x) => a + x.length, 0)),
        stat("我的提問", qs.length + " 題（已回答 " + qs.filter((q) => q.status === "answered").length + "）"),
        stat("問小波", asks + " 次")),
      h("div", { class: "card" }, h("h3", {}, "各章評量"),
        h("div", { class: "tbl-wrap" }, h("table", { class: "tbl" },
          h("tr", {}, ["章節", "進度", "測驗首次", "測驗最新", "熟悉度", "複習"].map((x) => h("th", {}, x))), rows))),
      h("div", { class: "card" }, h("h3", {}, "概念熟悉度"),
        h("div", { class: "chips" }, [1, 2, 3, 4].map((ch) => {
          const b = h("button", { class: "chip" + (ch === 1 ? " on" : "") }, "第" + ch + "章");
          b.onclick = () => { sel.ch = ch; b.parentNode.querySelectorAll(".chip").forEach((x) => x.classList.toggle("on", x === b)); drawM(); };
          return b;
        })), mBox),
      h("div", { class: "card" }, h("h3", {}, "單字卡總複習"), h("a", { class: "btn primary", href: "#/cards/0" }, "🃏 全部章節單字卡")),
      h("p", { class: "tiny" }, "你在網站上的作答、提問、操作與停留時間都會被記錄，用來產生以上分析；老師可在後台查看。下載完整紀錄請到右上角「我的紀錄」。"));
  };
  function stat(label, v) { return h("div", { class: "stat" }, h("div", { class: "tiny" }, label), h("b", {}, v)); }
})();
