/* 主頁：章節統整、學習地圖（概念圖）、提問區 */
(function () {
  "use strict";
  const IB = window.IB;
  const { S, h, save, log, say } = IB;

  /* ================= 共用 ================= */
  const conceptsOf = (ch) => S.C.concepts.filter((c) => c.ch === ch);
  const concept = (id) => S.C.concepts.find((c) => c.id === id);
  const chapterDone = (ch) => IB.chapterProgress(ch) >= 80;
  function rng(seed) {
    let s = 0;
    for (const c of String(seed)) s = (s * 31 + c.charCodeAt(0)) >>> 0;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  }

  /* ================= 主頁 ================= */
  const TABS = [
    ["summary", "📚 章節統整"],
    ["map", "🗺 我的學習地圖"],
    ["questions", "❓ 我的提問區"],
    ["assess", "📊 評量與複習"],
  ];
  IB.views.home = function (tab) {
    if (!TABS.some((t) => t[0] === tab)) tab = "summary";
    const p = IB.overallProgress();
    const last = S.pos.last;
    const mapStage = (S.answers.map || {}).stage || 0;
    const nQ = qList().length;
    let tip;
    if (!mapStage) tip = "第一次來嗎？建議先到「我的學習地圖」寫下你對干涉、繞射的直覺，再開始第 1 章。";
    else if (p >= 95 && mapStage < 4) tip = "你已經學完了！回到「我的學習地圖」把它修正成新的概念地圖吧。";
    else tip = "想到問題就記在「提問區」，學到相關章節時我會提醒你回來回答。";
    if (tab === "summary") say(tip, "happy");
    const tabs = h("div", { class: "home-tabs", role: "tablist" },
      TABS.map(([id, t]) => h("a", { href: "#/home/" + id, class: "home-tab" + (id === tab ? " on" : ""), role: "tab", "aria-selected": id === tab ? "true" : "false" },
        t, id === "questions" && nQ ? h("span", { class: "badge" }, nQ) : null)));
    const hero = h("div", { class: "home-hero" },
      h("div", { class: "hero-m", html: IB.mascotSVG(p >= 95 ? "happy" : "normal") }),
      h("div", { class: "hh-main" },
        h("h1", {}, S.C.unit.title),
        h("p", { class: "lead" }, S.C.unit.coreQuestion),
        h("div", { class: "big-prog" }, h("div", { class: "bar" }, h("span", { style: `width:${p}%` })), h("b", {}, "已學習 " + p + "%")),
        h("div", { class: "btn-row" },
          !mapStage ? h("a", { class: "btn primary", href: "#/home/map" }, "① 先畫我的學習地圖") : null,
          last ? h("a", { class: "btn " + (mapStage ? "primary" : ""), href: `#/c/${last.ch}/${last.step}` }, "▶ 繼續第 " + last.ch + " 章")
            : h("a", { class: "btn " + (mapStage ? "primary" : ""), href: "#/c/1/0" }, "▶ 開始第 1 章"))));
    let body;
    if (tab === "summary") body = summaryTab();
    else if (tab === "map") body = mapTab();
    else if (tab === "questions") body = questionsTab();
    else body = IB.views.assessTab ? IB.views.assessTab() : h("p", {}, "載入中");
    return h("div", { class: "home" }, hero, tabs, h("div", { class: "home-body" }, body));
  };

  /* ---------- 1. 章節統整 ---------- */
  function summaryTab() {
    const u = S.C.unit;
    const cards = S.C.chapters.map((c) => {
      const n = u.nodes[c.id - 1];
      const p = IB.chapterProgress(c.id);
      const mast = IB.chapterMastery ? IB.chapterMastery(c.id) : null;
      const qs = questionsFor(c.id);
      const quiz = (S.answers["quiz_c" + c.id] || {}).first;
      return h("div", { class: "sum-card" },
        h("div", { class: "sum-top" }, h("span", { class: "cc-no" }, "第 " + c.id + " 章｜" + c.period), h("span", { class: "tiny" }, p ? p + "%" : "尚未開始")),
        h("h3", {}, c.title),
        h("p", { class: "core-q small" }, "核心問題：" + c.question),
        h("p", {}, n.core),
        h("div", { class: "chips" }, conceptsOf(c.id).map((k) => h("button", { class: "chip", onclick: () => showConcept(k) }, k.term))),
        h("div", { class: "bar" }, h("span", { style: `width:${p}%` })),
        h("div", { class: "sum-meta tiny" },
          h("span", {}, "銜接：" + n.link),
          h("span", {}, "測驗：" + (quiz ? quiz.score + "／" + quiz.total : "未作答")),
          mast !== null ? h("span", {}, "熟悉度：" + mast + "%") : null,
          h("span", {}, "相關提問：" + qs.length)),
        h("div", { class: "btn-row" },
          h("a", { class: "btn primary small", href: `#/c/${c.id}/${Math.max(0, Math.min(S.pos.max[c.id] ?? 0, c.steps.length - 1))}` }, p ? "繼續學習" : "開始學習"),
          h("a", { class: "btn small", href: "#/sheet/" + c.id }, "複習學習單"),
          h("a", { class: "btn small", href: "#/cards/" + c.id }, "單字卡")));
    });
    return h("div", {},
      h("div", { class: "card" }, h("h3", {}, "單元學習路徑"),
        h("div", { class: "path" }, u.path.map((x, i) => h("span", { class: "path-step" }, x)).reduce((a, x, i) => (i ? [...a, h("span", { class: "path-arrow" }, "→"), x] : [x]), [])),
        h("p", { class: "tiny" }, "核心結論（學完要能用證據說明）：" + u.conclusion)),
      h("div", { class: "sum-grid" }, cards),
      h("details", { class: "card" }, h("summary", {}, "單元總覽（適用對象、先備知識、內容範圍）"),
        h("dl", { class: "kv" },
          h("dt", {}, "適用對象"), h("dd", {}, u.audience),
          h("dt", {}, "先備知識"), h("dd", {}, u.prerequisite),
          h("dt", {}, "內容範圍"), h("dd", {}, u.scope),
          h("dt", {}, "設計理念"), h("dd", {}, u.designIdea),
          h("dt", {}, "範圍與限制"), h("dd", {}, u.limits),
          h("dt", {}, "小波的規則"), h("dd", {}, u.aiRule))));
  }
  function showConcept(k) {
    const learned = chapterDone(k.ch);
    IB.openModal(k.term, h("div", {},
      learned ? h("p", {}, k.def) : h("div", {}, h("p", {}, "這個概念在第 " + k.ch + " 章。先猜猜看它是什麼意思？學完再回來對照。"),
        h("details", {}, h("summary", {}, "我想先偷看"), h("p", {}, k.def))),
      h("a", { class: "btn small", href: "#/c/" + k.ch + "/0", onclick: () => IB.closeModal() }, "前往第 " + k.ch + " 章")));
  }
  IB.showConcept = showConcept;

  /* ---------- 2. 學習地圖（概念圖） ---------- */
  function mapData() { return S.answers.map || {}; }
  function saveMap(d) { S.answers.map = Object.assign(mapData(), d); return save("map", d); }

  function mapTab() {
    const d = mapData();
    const stage = d.stage || 0;
    let view = Math.min(+(sessionStorage.getItem("mapView") || 0) || Math.max(1, Math.min(stage + 1, 4)), 4);
    if (view > stage + 1) view = stage + 1;
    const labels = ["寫下我的直覺", "看看想像畫面", "放進概念圖", "修正成新地圖"];
    const stepper = h("div", { class: "stepper" }, labels.map((t, i) => {
      const n = i + 1;
      const ok = n <= stage + 1;
      return h("button", { class: "st" + (n === view ? " on" : "") + (n <= stage ? " done" : ""), disabled: !ok,
        onclick: () => { sessionStorage.setItem("mapView", n); IB.route(); } }, h("span", { class: "st-n" }, n <= stage ? "✓" : n), t);
    }));
    const pane = [null, mapStage1, mapStage2, mapStage3, mapStage4][view]();
    return h("div", { class: "card" }, h("h3", {}, "我的學習地圖"),
      h("p", { class: "tiny" }, "先把你腦中的想法寫出來、跟想像畫面比一比，再把能連到教材的想法放進概念圖；學完各章後，把它修正成新的地圖。"),
      stepper, pane);
  }
  function goStage(n) { sessionStorage.setItem("mapView", n); IB.route(); }

  // 階段 1：引導寫下直覺
  function mapStage1() {
    const d = mapData();
    const intu = Object.assign({}, d.intuition || {});
    const P = S.C.map.prompts;
    let i = +(sessionStorage.getItem("mapQ") || 0);
    if (i >= P.length) i = P.length - 1;
    const pr = P[i];
    const ta = IB.textarea(intu[pr.key], 3, "寫下你最直接的想法就好，沒有對錯。", (v) => (intu[pr.key] = v));
    let followed = false;
    const chips = h("div", { class: "chips" }, h("span", { class: "tiny" }, "想不到的話，點點看："),
      pr.chips.map((c) => h("button", { class: "chip", onclick: () => { ta.value = (ta.value.trim() ? ta.value.trim() + "，" : "") + c; intu[pr.key] = ta.value; ta.focus(); } }, c)));
    const fb = h("div", { class: "fb hmm", hidden: true });
    const next = h("button", { class: "btn primary" }, i < P.length - 1 ? "下一題 →" : "完成，生成想像畫面 →");
    next.onclick = async () => {
      const v = (ta.value || "").trim();
      intu[pr.key] = v;
      if (!v) { say("先寫下任何一點想法都可以喔！", "think"); ta.focus(); return; }
      if (v.length < 6 && !followed) {
        followed = true;
        fb.hidden = false;
        fb.innerHTML = "";
        fb.append(h("div", { class: "fb-face", html: IB.mascotSVG("think") }), h("div", {}, h("b", {}, "小波追問："), pr.follow, h("br"), h("span", { class: "tiny" }, "補充完再按一次；不想補充也可以直接再按一次。")));
        say(pr.follow, "think");
        log("學習地圖：小波追問", { 題: pr.key });
        return;
      }
      await saveMap({ intuition: intu });
      log("學習地圖：寫下直覺", { 題: pr.key, 字數: v.length });
      if (i < P.length - 1) { sessionStorage.setItem("mapQ", i + 1); IB.route(); }
      else {
        const ideas = extractIdeas(intu);
        await saveMap({ intuition: intu, ideas, stage: Math.max(1, d.stage || 0), scenes: {} });
        sessionStorage.setItem("mapQ", 0);
        say("我根據你寫的想法，生成了幾個可能的畫面。看看跟你腦中的畫面像不像？", "happy");
        goStage(2);
      }
    };
    const back = i > 0 ? h("button", { class: "btn", onclick: () => { intu[pr.key] = ta.value; saveMap({ intuition: intu }); sessionStorage.setItem("mapQ", i - 1); IB.route(); } }, "← 上一題") : null;
    return h("div", { class: "map-pane" },
      h("div", { class: "tiny" }, `第 ${i + 1}／${P.length} 題`),
      h("div", { class: "guide-q" }, h("div", { class: "fb-face", html: IB.mascotSVG("normal") }), h("p", { class: "q" }, pr.q)),
      ta, chips, fb, h("div", { class: "btn-row" }, back, next));
  }

  function matchRule(text) {
    return S.C.map.rules.find((r) => r.kw.some((k) => text.includes(k))) || null;
  }
  function extractIdeas(intu) {
    const out = [];
    const src = { interference: "干涉", diffraction: "繞射", life: "生活例子" };
    for (const [key, val] of Object.entries(intu)) {
      String(val || "").split(/[，,、。；;\n／/]+/).map((x) => x.trim()).filter(Boolean).forEach((t) => {
        const r = matchRule(t);
        out.push({ id: "i" + out.length + "_" + Date.now().toString(36), text: t.slice(0, 40), from: src[key], rule: r ? S.C.map.rules.indexOf(r) : -1,
          node: r ? r.node : null, transfer: r ? r.transfer : false, misc: r ? !!r.misc : false, place: null });
      });
    }
    return out;
  }

  // 階段 2：生成想像畫面，請學生比對
  function mapStage2() {
    const d = mapData();
    const ideas = d.ideas || [];
    const fbk = Object.assign({}, d.scenes || {});
    const seen = new Map();
    ideas.forEach((it) => {
      const r = S.C.map.rules[it.rule];
      const sc = r ? r.scene : null;
      if (sc && !seen.has(sc)) seen.set(sc, { scene: sc, idea: it, rule: r });
    });
    if (!seen.size) ["ripple", "slit", "bubble"].forEach((sc) => seen.set(sc, { scene: sc, idea: null, rule: null }));
    const items = [...seen.values()].slice(0, 8);
    const variant = +(sessionStorage.getItem("sceneVar") || 0);
    const grid = h("div", { class: "scene-grid" });
    items.forEach(({ scene, idea, rule }) => {
      const f = fbk[scene] || {};
      const persist = IB.debounce(() => saveMap({ scenes: fbk }), 700);
      const note = IB.textarea(f.note, 2, "哪裡一樣、哪裡不一樣？你腦中的畫面是……", (v) => { f.note = v; fbk[scene] = f; persist(); });
      const sim = IB.choiceButtons(["很像", "有點像", "不太像"], f.sim, (o) => {
        f.sim = o; fbk[scene] = f; persist();
        log("學習地圖：比對畫面", { 畫面: scene, 結果: o });
        if (o === "不太像") say("那你腦中的畫面是什麼樣子？在下面寫寫看，哪裡不一樣？", "think");
      });
      const photo = rule && rule.photo ? IB.photoCard(rule.photo) : null;
      grid.append(h("div", { class: "scene-card" },
        h("div", { class: "scene-img", html: sceneSVG(scene, (idea ? idea.text : scene) + variant) }),
        h("div", { class: "tag" }, "生成的想像畫面（示意，不是實拍）"),
        h("p", {}, S.C.map.scenes[scene]),
        idea ? h("p", { class: "tiny" }, "因為你寫了：「" + idea.text + "」") : h("p", { class: "tiny" }, "你寫的想法裡沒有明確的畫面，這是幾個參考畫面。"),
        photo ? h("details", {}, h("summary", { class: "tiny" }, "看看教材裡的真實照片"), photo) : null,
        h("p", { class: "q small" }, "這跟你腦海中的畫面類似嗎？"), sim, note));
    });
    const regen = h("button", { class: "btn" }, "🔄 重新生成畫面");
    regen.onclick = async () => { await saveMap({ scenes: fbk }); sessionStorage.setItem("sceneVar", variant + 1); log("學習地圖：重新生成畫面", {}); IB.route(); };
    const next = h("button", { class: "btn primary" }, "下一步：放進概念圖 →");
    next.onclick = async () => {
      if (!Object.values(fbk).some((x) => x.sim)) { say("至少選一張畫面，告訴我它跟你腦中的畫面像不像！", "think"); return; }
      await saveMap({ scenes: fbk, stage: Math.max(2, d.stage || 0) });
      say("接下來，我們把能連到教材的想法放進概念圖。", "normal");
      goStage(3);
    };
    return h("div", { class: "map-pane" },
      h("div", { class: "guide-q" }, h("div", { class: "fb-face", html: IB.mascotSVG("happy") }),
        h("p", {}, "我根據你寫的想法畫了幾個「可能的畫面」。它們只是想像，不是實拍——請你判斷：跟你腦中的畫面像不像？")),
      grid, h("div", { class: "btn-row" }, h("button", { class: "btn", onclick: () => goStage(1) }, "← 修改我的直覺"), regen, next));
  }

  // 階段 3：確認哪些想法放進概念圖
  function mapStage3() {
    const d = mapData();
    const ideas = (d.ideas || []).map((x) => Object.assign({}, x));
    const list = h("div", { class: "idea-list" });
    const nodes = S.C.map.nodes;
    const label = (id) => (nodes.find((n) => n.id === id) || {}).label;
    ideas.forEach((it) => {
      const r = S.C.map.rules[it.rule];
      if (it.place === null) it.place = it.transfer ? "map" : "side";
      const sug = r
        ? (r.transfer ? "可以連到「" + label(r.node) + "」" + (nodes.find((n) => n.id === r.node).ch ? "（第 " + nodes.find((n) => n.id === r.node).ch + " 章）" : "") : "建議先放旁邊")
        : "教材裡找不到直接對應，建議先放旁邊";
      const row = h("div", { class: "idea-row" + (it.misc ? " misc" : "") },
        h("div", {}, h("b", {}, "「" + it.text + "」"), h("span", { class: "tiny" }, "　來自：" + it.from),
          h("div", { class: "tiny" }, (it.misc ? "⚠️ 可能是常見迷思。" : "") + sug + (r ? "：" + r.why : ""))),
        IB.choiceButtons(["放進概念圖", "先放旁邊"], it.place === "map" ? "放進概念圖" : "先放旁邊", (o) => {
          it.place = o === "放進概念圖" ? "map" : "side";
          if (it.place === "map" && !it.node) it.node = "core";
          redraw();
        }, "mini"));
      list.append(row);
    });
    const mapBox = h("div", { class: "map-box" });
    function redraw() {
      mapBox.innerHTML = "";
      mapBox.append(conceptMap(ideas.filter((x) => x.place === "map").map((x) => ({ text: x.text, node: x.node || "core", misc: x.misc })), { initial: true }));
      const side = ideas.filter((x) => x.place === "side");
      if (side.length) mapBox.append(h("div", { class: "side-box" }, h("b", {}, "📌 先放旁邊（學完再回來看）："), side.map((x) => h("span", { class: "chip ghost" }, x.text))));
    }
    redraw();
    const ok = h("button", { class: "btn primary" }, "確認，建立我的初始概念圖");
    ok.onclick = async () => {
      await saveMap({ ideas, stage: Math.max(3, d.stage || 0), initialAt: new Date().toLocaleString(), initial: ideas.filter((x) => x.place === "map").map((x) => ({ text: x.text, node: x.node })) });
      log("學習地圖：建立初始概念圖", { 放入: ideas.filter((x) => x.place === "map").length, 旁邊: ideas.filter((x) => x.place === "side").length });
      say("初始概念圖完成！灰色的節點是還沒學的內容。每學完一章，就回來把它修正得更完整。", "happy");
      IB.route();
    };
    return h("div", { class: "map-pane" },
      h("p", {}, "下面是從你的想法中拆出來的句子。我標出了可以「遷移回教材」的想法；你來決定要不要放進概念圖。"),
      list, ok, h("h4", {}, d.stage >= 3 ? "我的初始概念圖（" + (d.initialAt || "") + "）" : "預覽"), mapBox,
      d.stage >= 3 ? h("div", { class: "btn-row" }, h("button", { class: "btn primary", onclick: () => goStage(4) }, "前往：修正成新地圖 →")) : null);
  }

  // 階段 4：學完後修正
  function mapStage4() {
    const d = mapData();
    const nodes = S.C.map.nodes;
    const unlocked = nodes.filter((n) => !n.ch || chapterDone(n.ch));
    const learnedCh = [1, 2, 3, 4].filter(chapterDone);
    const ideas = (d.ideas || []).map((x) => Object.assign({ rev: { status: "保留", text: x.text, node: x.place === "map" ? x.node || "core" : "side" } }, x, { rev: Object.assign({ status: "保留", text: x.text, node: x.place === "map" ? x.node || "core" : "side" }, x.rev || {}) }));
    const added = (d.added || []).map((x) => Object.assign({}, x));
    const opts = [["side", "先放旁邊"], ...unlocked.map((n) => [n.id, n.label + (n.ch ? "（第" + n.ch + "章）" : "")])];
    const sel = (val, on) => {
      const s = h("select", {}, opts.map(([v, t]) => { const o = h("option", { value: v }, t); if (v === val) o.selected = true; return o; }));
      s.onchange = () => on(s.value);
      return s;
    };
    const wrap = h("div", { class: "map-pane" });
    wrap.append(h("div", { class: "callout" + (learnedCh.length ? "" : " warn") },
      learnedCh.length ? "已解鎖第 " + learnedCh.join("、") + " 章的概念節點。學完越多章，能連的節點越多。" : "你還沒學完任何一章（每章完成 80% 以上才解鎖節點）。可以先修正，學完再回來。"));
    wrap.append(h("h4", {}, "一、檢查我原本的想法"));
    ideas.forEach((it) => {
      const tx = IB.textarea(it.rev.text, 1, "", (v) => (it.rev.text = v));
      const row = h("div", { class: "idea-row col" },
        h("div", {}, h("span", { class: "tiny" }, "原本：「" + it.text + "」" + (it.misc ? "　⚠️ 曾標為可能的迷思" : ""))),
        IB.choiceButtons(["保留", "修正", "刪除"], it.rev.status, (o) => { it.rev.status = o; tx.hidden = o !== "修正"; }, "mini"),
        tx, h("label", { class: "tiny inline" }, "連到：", sel(it.rev.node, (v) => (it.rev.node = v))));
      tx.hidden = it.rev.status !== "修正";
      wrap.append(row);
    });
    wrap.append(h("h4", {}, "二、加入我學到的新連結"));
    const addList = h("div");
    function drawAdded() {
      addList.innerHTML = "";
      added.forEach((a, i) => addList.append(h("div", { class: "idea-row" }, h("span", {}, "「" + a.text + "」→ " + ((nodes.find((n) => n.id === a.node) || {}).label || "")),
        h("button", { class: "btn small", onclick: () => { added.splice(i, 1); drawAdded(); } }, "移除"))));
    }
    drawAdded();
    const newT = h("input", { placeholder: "例如：暗紋處兩列光都有到達，只是反相疊加" });
    let newNode = unlocked[1] ? unlocked[1].id : "core";
    const addBtn = h("button", { class: "btn" }, "＋ 加入");
    addBtn.onclick = () => {
      const t = newT.value.trim();
      if (!t) { say("先寫下你學到的新理解，再選它要連到哪個概念。", "think"); return; }
      added.push({ text: t.slice(0, 60), node: newNode });
      newT.value = "";
      drawAdded();
      log("學習地圖：加入新連結", { 節點: newNode });
    };
    wrap.append(addList, h("div", { class: "add-row" }, newT, h("label", { class: "tiny inline" }, "連到：", sel(newNode, (v) => (newNode = v))), addBtn));
    const gen = h("button", { class: "btn primary" }, "產生我的新概念地圖");
    const out = h("div");
    function render(dd) {
      out.innerHTML = "";
      const init = (dd.initial || []).map((x) => ({ text: x.text, node: x.node || "core" }));
      const now = (dd.ideas || []).filter((x) => x.rev && x.rev.status !== "刪除" && x.rev.node !== "side").map((x) => ({ text: x.rev.status === "修正" ? x.rev.text : x.text, node: x.rev.node, changed: x.rev.status === "修正" }))
        .concat((dd.added || []).map((x) => ({ text: x.text, node: x.node, isNew: true })));
      out.append(h("div", { class: "map-compare" },
        h("div", {}, h("h4", {}, "初始概念圖"), conceptMap(init, { initial: true })),
        h("div", {}, h("h4", {}, "新的概念地圖（" + (dd.revisedAt || "") + "）"), conceptMap(now, { initial: false }))),
        h("p", { class: "tiny" }, "黃色＝你的想法；綠框＝修正過；藍框＝新加入的連結；灰色節點＝尚未學完的章節。點節點可以看概念說明。"));
    }
    gen.onclick = async () => {
      const removed = ideas.filter((x) => x.rev.status === "刪除").length;
      const changed = ideas.filter((x) => x.rev.status === "修正").length;
      if (!added.length && !changed && !removed && !ideas.some((x) => x.rev.node !== (x.place === "map" ? x.node : "side"))) {
        say("你的地圖跟原本一模一樣。想想看：學完之後，哪一個想法可以說得更精確？", "think");
      }
      const data = { ideas, added, revisedAt: new Date().toLocaleString(), stage: 4 };
      await saveMap(data);
      log("學習地圖：產生新概念地圖", { 修正: changed, 刪除: removed, 新增: added.length });
      say("新的概念地圖完成！比較左右兩張圖，你的想法改變了哪些？", "happy");
      render(mapData());
      out.scrollIntoView({ behavior: "smooth" });
    };
    wrap.append(h("div", { class: "btn-row" }, gen), out);
    if (d.stage >= 4) render(d);
    return wrap;
  }

  // 概念圖 SVG
  function conceptMap(ideas, opt) {
    const nodes = S.C.map.nodes;
    const pos = {};
    nodes.forEach((n) => (pos[n.id] = n));
    const W = 1000, H = 620;
    const open = (n) => !n.ch || (!opt.initial && chapterDone(n.ch)) || (opt.initial && n.id === "core") || (opt.initial && ["n1", "n2", "n3", "n4"].includes(n.id));
    const svg = [];
    svg.push(`<svg viewBox="0 0 ${W} ${H}" class="cmap" role="img" aria-label="概念圖">`);
    S.C.map.edges.forEach(([a, b]) => {
      const A = pos[a], B = pos[b];
      const faded = !open(A) || !open(B);
      svg.push(`<line x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}" class="cm-edge${faded ? " faded" : ""}"/>`);
    });
    // 節點外框（先算好，供學生想法避開）
    const placed = [];
    const nodeSvg = nodes.map((n) => {
      const o = open(n);
      const lines = wrapText(o ? n.label : "？（第" + n.ch + "章）", 8, 2);
      const w = n.id === "core" ? 180 : 156, hh = 16 + lines.length * 22;
      placed.push({ x: n.x - w / 2, y: n.y - hh / 2, w, h: hh });
      return `<g class="map-node cm-node${n.id === "core" ? " core" : ""}${o ? "" : " locked"}" data-id="${n.id}" tabindex="0"><rect x="${n.x - w / 2}" y="${n.y - hh / 2}" width="${w}" height="${hh}" rx="12"/>` +
        lines.map((l, i) => `<text x="${n.x}" y="${n.y - hh / 2 + 27 + i * 22}" text-anchor="middle">${IB.esc(l)}</text>`).join("") + `</g>`;
    });
    const overlap = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    // 學生想法：在所連節點周圍找不重疊的位置
    const ideaSvg = [];
    ideas.forEach((it) => {
      const N = pos[it.node] || pos.core;
      const lines = wrapText(it.text, 8, 2);
      const w = 150, hh = 14 + lines.length * 20;
      const base = Math.atan2(N.y - pos.core.y, N.x - pos.core.x);
      let best = null;
      for (const r of [105, 150, 200, 250]) {
        for (let k = 0; k < 16; k++) {
          const a = (it.node === "core" ? Math.PI / 2 : base) + ((k % 2 ? 1 : -1) * Math.ceil(k / 2) * Math.PI) / 8;
          const cx = N.x + Math.cos(a) * r, cy = N.y + Math.sin(a) * r * 0.7;
          const rect = { x: cx - w / 2, y: cy - hh / 2, w, h: hh };
          if (rect.x < 4 || rect.y < 4 || rect.x + w > W - 4 || rect.y + hh > H - 4) continue;
          const cost = placed.reduce((s, p) => s + overlap(rect, { x: p.x - 6, y: p.y - 6, w: p.w + 12, h: p.h + 12 }), 0) + r * 2;
          if (!best || cost < best.cost) best = { cost, rect, cx, cy };
        }
      }
      if (!best) return;
      placed.push(best.rect);
      svg.push(`<line x1="${N.x}" y1="${N.y}" x2="${best.cx}" y2="${best.cy}" class="cm-idea-edge"/>`);
      ideaSvg.push(`<g class="cm-idea${it.changed ? " changed" : ""}${it.isNew ? " new" : ""}${it.misc ? " misc" : ""}"><rect x="${best.rect.x}" y="${best.rect.y}" width="${w}" height="${hh}" rx="8"/>` +
        lines.map((l, i) => `<text x="${best.cx}" y="${best.rect.y + 24 + i * 20}" text-anchor="middle">${IB.esc(l)}</text>`).join("") + `</g>`);
    });
    svg.push(nodeSvg.join(""));
    svg.push(ideaSvg.join(""), "</svg>");
    const box = h("div", { class: "cmap-wrap", html: svg.join("") });
    box.querySelectorAll(".map-node").forEach((g) => (g.onclick = () => {
      const n = nodes.find((x) => x.id === g.dataset.id);
      if (n.id === "core") return IB.openModal("光的波動性", h("p", {}, S.C.unit.conclusion));
      const k = concept(n.concept);
      if (k) showConcept(k);
    }));
    return box;
  }
  function wrapText(t, n, maxLines) {
    const out = [];
    let s = String(t);
    while (s.length && out.length < maxLines) { out.push(s.slice(0, n)); s = s.slice(n); }
    if (s.length && out.length) out[out.length - 1] = out[out.length - 1].slice(0, n - 1) + "…";
    return out;
  }
  IB.conceptMap = conceptMap;

  // 生成想像畫面（程式產生的 SVG 示意圖）
  function sceneSVG(id, seed) {
    const R = rng(seed);
    const hue = Math.floor(R() * 40);
    const W = 320, H = 200;
    const wrap = (inner, bg) => `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${IB.esc(S.C.map.scenes[id] || "")}"><rect width="${W}" height="${H}" fill="${bg}"/>${inner}</svg>`;
    if (id === "ripple") {
      const x1 = 110 + R() * 20, x2 = 210 - R() * 20, y = 70 + R() * 20;
      let s = "";
      for (let i = 1; i < 9; i++) s += `<circle cx="${x1}" cy="${y}" r="${i * 17}" fill="none" stroke="#e8f4ff" stroke-opacity="${1 - i * 0.1}"/><circle cx="${x2}" cy="${y}" r="${i * 17}" fill="none" stroke="#e8f4ff" stroke-opacity="${1 - i * 0.1}"/>`;
      return wrap(s + `<circle cx="${x1}" cy="${y}" r="5" fill="#fff"/><circle cx="${x2}" cy="${y}" r="5" fill="#fff"/>`, `hsl(${205 + hue / 4},60%,42%)`);
    }
    if (id === "rope" || id === "cancel") {
      const a = 30 + R() * 10;
      const bump = (cx, s) => { let p = ""; for (let x = 0; x <= W; x += 4) { const v = Math.abs(x - cx) < 40 ? s * a * (0.5 + 0.5 * Math.cos((Math.PI * (x - cx)) / 40)) : 0; p += `${x},${100 - v} `; } return p; };
      const s2 = id === "cancel" ? -1 : 1;
      return wrap(`<polyline points="${bump(90, 1)}" fill="none" stroke="#333" stroke-width="3"/><polyline points="${bump(230, s2)}" fill="none" stroke="#2f6fd1" stroke-width="3" stroke-dasharray="${id === "cancel" ? "7 5" : ""}"/>
        <text x="90" y="${id === "cancel" ? 180 : 40}" text-anchor="middle" font-size="22">→</text><text x="230" y="${id === "cancel" ? 180 : 40}" text-anchor="middle" font-size="22">←</text>`, "#f7f4ec");
    }
    if (id === "collide") {
      return wrap(`<circle cx="${120 - R() * 10}" cy="100" r="34" fill="#e2574c"/><circle cx="${200 + R() * 10}" cy="100" r="34" fill="#4f8fe6"/>
        <polygon points="160,62 168,86 192,80 174,98 190,118 166,112 160,136 152,112 128,118 146,98 128,80 152,86" fill="#ffd54a"/><text x="160" y="104" text-anchor="middle" font-size="14" font-weight="700">碰！</text>
        <text x="60" y="170" font-size="22">←</text><text x="250" y="170" font-size="22">→</text>`, "#f7f4ec");
    }
    if (id === "laser" || id === "slit") {
      const spots = id === "laser" ? 9 : 5;
      let s = `<rect x="10" y="88" width="46" height="24" rx="4" fill="#444"/><line x1="56" y1="100" x2="120" y2="100" stroke="#ff3b2f" stroke-width="3"/>
        <rect x="118" y="30" width="8" height="${id === "laser" ? 60 : 64}" fill="#bbb"/><rect x="118" y="${id === "laser" ? 96 : 106}" width="8" height="${id === "laser" ? 8 : 64}" fill="#bbb"/>${id === "laser" ? '<rect x="118" y="110" width="8" height="60" fill="#bbb"/>' : ""}
        <rect x="270" y="20" width="14" height="160" fill="#111"/>`;
      for (let i = 0; i < spots; i++) {
        const off = (i - (spots - 1) / 2) * (id === "laser" ? 16 : 26);
        const w = id === "slit" && i === (spots - 1) / 2 ? 18 : 7;
        const op = id === "slit" ? (i === (spots - 1) / 2 ? 1 : 0.4) : 1 - Math.abs(off) / 110;
        s += `<rect x="271" y="${100 + off - w / 2}" width="12" height="${w}" fill="${id === "laser" ? "#ff3b2f" : "#ffe08a"}" opacity="${op.toFixed(2)}"/>`;
      }
      s += `<path d="M126 100 L268 ${30 + R() * 10} L268 ${170 - R() * 10} Z" fill="${id === "laser" ? "#ff3b2f" : "#ffe08a"}" opacity=".12"/>`;
      return wrap(s, "#2a2d34");
    }
    if (id === "bubble") {
      let s = `<defs><radialGradient id="bg${hue}" cx="40%" cy="35%"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset=".3" stop-color="hsl(${280 + hue},80%,70%)" stop-opacity=".6"/><stop offset=".55" stop-color="hsl(${170 + hue},80%,60%)" stop-opacity=".5"/><stop offset=".8" stop-color="hsl(${40 + hue},90%,60%)" stop-opacity=".6"/><stop offset="1" stop-color="hsl(${320 + hue},80%,60%)" stop-opacity=".8"/></radialGradient></defs>`;
      s += `<circle cx="160" cy="100" r="78" fill="url(#bg${hue})" stroke="#fff" stroke-opacity=".7"/>`;
      for (let i = 0; i < 4; i++) s += `<path d="M${100 + R() * 20} ${70 + i * 22} q 60 ${-20 + R() * 40} 120 0" stroke="hsl(${(hue + i * 70) % 360},80%,60%)" stroke-width="5" fill="none" opacity=".55"/>`;
      return wrap(s, "#1e2a3a");
    }
    if (id === "cd") {
      let s = "";
      for (let i = 0; i < 36; i++) { const a0 = (i / 36) * 2 * Math.PI, a1 = ((i + 1) / 36) * 2 * Math.PI; s += `<path d="M160 100 L${160 + 85 * Math.cos(a0)} ${100 + 85 * Math.sin(a0)} A85 85 0 0 1 ${160 + 85 * Math.cos(a1)} ${100 + 85 * Math.sin(a1)} Z" fill="hsl(${(i * 20 + hue * 3) % 360},70%,${55 + 15 * Math.sin(i)}%)" opacity=".85"/>`; }
      return wrap(s + `<circle cx="160" cy="100" r="85" fill="none" stroke="#ccc" stroke-width="2"/><circle cx="160" cy="100" r="16" fill="#ddd"/>`, "#e8e8ee");
    }
    if (id === "feather") {
      return wrap(`<defs><radialGradient id="fe${hue}"><stop offset=".15" stop-color="#1a237e"/><stop offset=".35" stop-color="hsl(${180 + hue},80%,45%)"/><stop offset=".6" stop-color="hsl(${90 + hue},60%,45%)"/><stop offset="1" stop-color="#5d4037"/></radialGradient></defs>
        <ellipse cx="160" cy="95" rx="80" ry="70" fill="url(#fe${hue})"/><line x1="160" y1="165" x2="160" y2="200" stroke="#8d6e63" stroke-width="4"/>`, "#2b2b25");
    }
    if (id === "lens") {
      return wrap(`<ellipse cx="110" cy="100" rx="60" ry="50" fill="#dfe8ef" stroke="#555" stroke-width="5"/><ellipse cx="220" cy="100" rx="60" ry="50" fill="#dfe8ef" stroke="#555" stroke-width="5"/>
        <path d="M80 80 q30 -20 60 0" stroke="hsl(${140 + hue},60%,55%)" stroke-width="7" fill="none" opacity=".6"/><path d="M190 80 q30 -20 60 0" stroke="hsl(${280 + hue},60%,60%)" stroke-width="7" fill="none" opacity=".6"/><line x1="170" y1="95" x2="160" y2="95" stroke="#555" stroke-width="5"/>`, "#f4f4f4");
    }
    if (id === "star") {
      let s = "";
      for (let i = 0; i < 40; i++) s += `<circle cx="${R() * W}" cy="${R() * H}" r="${R() * 1.4}" fill="#fff" opacity=".7"/>`;
      const cx = 140 + R() * 40, cy = 90 + R() * 20;
      for (let k = 0; k < 4; k++) { const a = (k * Math.PI) / 4 + Math.PI / 4; s += `<line x1="${cx - 70 * Math.cos(a)}" y1="${cy - 70 * Math.sin(a)}" x2="${cx + 70 * Math.cos(a)}" y2="${cy + 70 * Math.sin(a)}" stroke="#fff" stroke-width="2" opacity=".8"/>`; }
      return wrap(s + `<circle cx="${cx}" cy="${cy}" r="9" fill="#fff"/>`, "#070b1a");
    }
    if (id === "sound") {
      let s = `<rect x="30" y="40" width="40" height="50" rx="6" fill="#444"/><rect x="30" y="120" width="40" height="50" rx="6" fill="#444"/>`;
      for (let i = 1; i < 6; i++) s += `<path d="M${70 + i * 18} ${65 - i * 10} q ${12} ${i * 10} 0 ${i * 20}" stroke="#2f6fd1" fill="none" stroke-width="2"/><path d="M${70 + i * 18} ${145 - i * 10} q ${12} ${i * 10} 0 ${i * 20}" stroke="#2f6fd1" fill="none" stroke-width="2"/>`;
      return wrap(s, "#f7f4ec");
    }
    if (id === "rainbow") {
      const cols = ["#e53935", "#fb8c00", "#fdd835", "#43a047", "#1e88e5", "#3949ab", "#8e24aa"];
      return wrap(cols.map((c, i) => `<path d="M${30 + i * 8} 180 A${130 - i * 8} ${130 - i * 8} 0 0 1 ${290 - i * 8} 180" stroke="${c}" stroke-width="8" fill="none"/>`).join(""), "#bfe3f7");
    }
    return wrap("", "#eee");
  }

  /* ---------- 3. 提問區 ---------- */
  const CH_KW = { 1: ["疊加", "振幅", "位移", "腹線", "節線", "繩", "水波", "漣漪", "相消", "抵消", "碰撞", "反彈"], 2: ["雙狹縫", "相干", "惠更斯", "次波", "暗紋", "亮紋", "相位", "雷射", "條紋", "直進"], 3: ["單狹縫", "繞射", "縫寬", "中央亮紋", "彎", "繞過"], 4: ["薄膜", "肥皂", "油膜", "顏色", "彩色", "光碟", "抗反射", "鍍膜", "孔雀", "牛頓環", "波動性", "粒子"] };
  function suggestCh(t) {
    for (const [ch, kws] of Object.entries(CH_KW)) if (kws.some((k) => t.includes(k))) return +ch;
    return 0;
  }
  function qList() { return ((S.answers.questions || {}).list || []).slice(); }
  function saveQ(list) { S.answers.questions = Object.assign(S.answers.questions || {}, { list }); return save("questions", { list }); }
  function questionsFor(ch) { return qList().filter((q) => q.ch === ch); }
  IB.questionsFor = questionsFor;
  const STATUS = { open: "還不確定", partial: "部分理解", answered: "我能回答了" };

  function addForm(defaultCh, onAdded) {
    const t = h("textarea", { rows: 2, placeholder: "例如：為什麼暗紋的地方光會不見？／肥皂泡為什麼有顏色？" });
    let ch = defaultCh || 0;
    const chBox = h("div", { class: "chips" });
    function drawCh(sugg) {
      chBox.innerHTML = "";
      chBox.append(h("span", { class: "tiny" }, "可能在哪一章找到答案："));
      [[0, "還不確定"], [1, "第1章"], [2, "第2章"], [3, "第3章"], [4, "第4章"]].forEach(([v, l]) =>
        chBox.append(h("button", { class: "chip" + (v === ch ? " on" : ""), onclick: () => { ch = v; drawCh(sugg); } }, l + (sugg && v === sugg ? "（建議）" : ""))));
    }
    drawCh(0);
    t.addEventListener("input", () => { const s = suggestCh(t.value); if (s && !defaultCh) { ch = s; } drawCh(s); });
    const b = h("button", { class: "btn primary" }, "＋ 記錄這個問題");
    b.onclick = async () => {
      const text = t.value.trim();
      if (!text) { say("先把腦中的問題打出來——問題越具體，之後越好回答。", "think"); return; }
      const list = qList();
      list.push({ id: "q" + Date.now().toString(36), text: text.slice(0, 300), ch, created: new Date().toLocaleString(), status: "open", answer: "" });
      await saveQ(list);
      log("提問區：新增問題", { 章: ch, 字數: text.length });
      say(ch ? "記下來了！學到第 " + ch + " 章時，我會提醒你回來回答它。" : "記下來了！學完各章後再回來看看，它可能藏在哪一章。", "happy");
      t.value = "";
      onAdded && onAdded();
    };
    return h("div", { class: "q-add" }, t, chBox, b);
  }

  function qCard(q, onChange, opts = {}) {
    const ans = IB.textarea(q.answer, 2, "用自己的話寫下目前的答案（可引用教材中的觀察或模型）", null);
    const chSel = h("select", {}, [[0, "還不確定"], [1, "第1章"], [2, "第2章"], [3, "第3章"], [4, "第4章"]].map(([v, l]) => { const o = h("option", { value: v }, l); if (v === q.ch) o.selected = true; return o; }));
    const st = IB.choiceButtons(Object.values(STATUS), STATUS[q.status], async (o) => {
      const key = Object.keys(STATUS).find((k) => STATUS[k] === o);
      const list = qList();
      const it = list.find((x) => x.id === q.id);
      it.status = key; it.answer = ans.value; it.ch = +chSel.value;
      if (key === "answered") it.answeredAt = new Date().toLocaleString();
      await saveQ(list);
      log("提問區：更新狀態", { 問題: q.id, 狀態: o });
      if (key === "answered" && ans.value.trim().length < 12) say("可以用「因為……所以……」多寫一點嗎？你的答案是根據哪一個觀察？", "think");
      else if (key === "answered") say("太好了！你自己找到了答案。", "happy");
      onChange && onChange();
    }, "mini");
    const saveBtn = h("button", { class: "btn small" }, "儲存答案");
    const tag = IB.savedTag();
    saveBtn.onclick = async () => {
      const list = qList();
      const it = list.find((x) => x.id === q.id);
      it.answer = ans.value; it.ch = +chSel.value;
      IB.markSaved(tag, await saveQ(list));
      log("提問區：寫答案", { 問題: q.id, 字數: ans.value.length });
    };
    const del = h("button", { class: "btn small ghost" }, "刪除");
    del.onclick = async () => {
      if (!confirm("確定刪除這個問題？")) return;
      await saveQ(qList().filter((x) => x.id !== q.id));
      log("提問區：刪除問題", { 問題: q.id });
      onChange && onChange();
    };
    const learned = q.ch && chapterDone(q.ch);
    return h("div", { class: "q-card st-" + q.status },
      h("div", { class: "q-head" }, h("b", {}, "❓ " + q.text), h("span", { class: "tiny" }, q.created)),
      h("div", { class: "q-meta tiny" }, "章節：", chSel, learned && q.status !== "answered" ? h("span", { class: "nudge" }, "　你已學完這章，試著回答看看！") : null),
      ans, h("div", { class: "btn-row" }, st, saveBtn, tag, opts.noDelete ? null : del));
  }

  function questionsTab() {
    const box = h("div", { class: "card" });
    function draw() {
      box.innerHTML = "";
      const list = qList();
      const done = list.filter((q) => q.status === "answered").length;
      box.append(h("h3", {}, "我的提問區"),
        h("p", { class: "tiny" }, "先把腦中的問題記下來，不用急著找答案。學到相關章節時，回來慢慢補上細節。"),
        addForm(0, draw),
        h("div", { class: "q-stats tiny" }, `共 ${list.length} 題｜已能回答 ${done} 題｜部分理解 ${list.filter((q) => q.status === "partial").length} 題`));
      [[1, 2, 3, 4, 0]].flat().forEach((ch) => {
        const qs = list.filter((q) => q.ch === ch);
        if (!qs.length) return;
        box.append(h("h4", {}, ch ? "第 " + ch + " 章｜" + S.C.chapters[ch - 1].title : "還不確定在哪一章"), ...qs.map((q) => qCard(q, draw)));
      });
    }
    draw();
    return box;
  }

  IB.openQuestions = function (ch) {
    const wrap = h("div");
    function draw() {
      wrap.innerHTML = "";
      const qs = qList().filter((q) => q.ch === ch || q.ch === 0);
      wrap.append(addForm(ch, draw), h("h4", {}, "跟第 " + ch + " 章有關、或還不確定的問題"),
        ...(qs.length ? qs.map((q) => qCard(q, draw)) : [h("p", { class: "tiny" }, "還沒有問題。")]),
        h("a", { class: "btn small", href: "#/home/questions", onclick: () => IB.closeModal() }, "到主頁看全部提問"));
    }
    draw();
    IB.onModalClose = () => IB.route();
    IB.openModal("我的提問", wrap);
  };
  IB.chapterQuestionsBox = function (ch) {
    const qs = qList().filter((q) => q.ch === ch && q.status !== "answered");
    if (!qs.length) return h("div", { class: "callout" }, "💡 學這章時有任何疑問，按右上角「❓ 我的提問」記下來。");
    return h("div", { class: "callout" }, h("b", {}, "你之前的提問，可能在這章找到答案："), h("ul", {}, qs.map((q) => h("li", {}, q.text))), h("span", { class: "tiny" }, "邊學邊留意，章末我會請你回來回答。"));
  };
  IB.chapterAnswerBox = function (ch) {
    const box = h("div", { class: "card inner" });
    function draw() {
      box.innerHTML = "";
      const qs = qList().filter((q) => q.ch === ch || (q.ch === 0 && q.status !== "answered"));
      box.append(h("h3", {}, "回頭回答你的提問"));
      if (!qs.length) box.append(h("p", { class: "tiny" }, "這章沒有相關提問。想到新問題，可以按上方「❓ 我的提問」。"));
      else box.append(h("p", { class: "tiny" }, "用這章學到的觀察與解釋，試著回答；答不完整也沒關係，標記「部分理解」。"), ...qs.map((q) => qCard(q, draw, { noDelete: true })));
    }
    draw();
    return box;
  };
})();
