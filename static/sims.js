/* 互動模擬與示意圖（全部離線可用，不依賴外部套件） */
(function () {
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const fmt = (v) => (v > 0.0001 ? "＋" : v < -0.0001 ? "－" : "") + Math.abs(v).toFixed(1);

  function setupCanvas(cv, w, h) {
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    cv.style.width = w + "px";
    cv.style.height = h + "px";
    const g = cv.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return g;
  }
  function el(html) {
    const d = document.createElement("div");
    d.innerHTML = html.trim();
    return d.firstElementChild;
  }
  // 每個模擬都在離開頁面時停止動畫
  const running = new Set();
  function loop(fn) {
    const o = { on: true };
    running.add(o);
    let last = performance.now();
    function f(t) {
      if (!o.on) return;
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      fn(dt);
      requestAnimationFrame(f);
    }
    requestAnimationFrame(f);
    return o;
  }
  function stopAll() {
    running.forEach((o) => (o.on = false));
    running.clear();
  }

  /* ---------------- 繩波疊加模擬（依 07B 模擬需求腳本） ---------------- */
  function rope(root, ctx) {
    const W0 = 0.2 * 100; // 脈衝全寬 20%
    const SPEED = 5; // 每秒 5% 畫面寬度
    const s = { a: 1, b: 1, t: 0, play: false, story: null };
    root.innerHTML = `
      <div class="sim rope">
        <div class="sim-head"><b>繩波疊加模擬</b><span class="sim-status"></span></div>
        <div class="rope-body">
          <div class="rope-plots">
            <div class="plot-label">① 分波模型　A 細實線／B 虛線</div>
            <canvas class="cv-top"></canvas>
            <div class="plot-label">② 合成繩形　粗實線</div>
            <canvas class="cv-bot"></canvas>
            <div class="caption-bar" hidden></div>
            <div class="readout">④ P 點回饋：<span class="pval"></span></div>
          </div>
          <div class="rope-ctrl">
            <div class="ctrl-title">③ 學生可調</div>
            <label>脈衝高度 A（含正負號）：<b class="va"></b><input type="range" min="-1.5" max="1.5" step="0.1" class="ra"></label>
            <label>脈衝高度 B（含正負號）：<b class="vb"></b><input type="range" min="-1.5" max="1.5" step="0.1" class="rb"></label>
            <div class="btn-row"><button class="btn b-same">同向</button><button class="btn b-opp">反向</button></div>
            <div class="btn-row"><button class="btn primary b-play">▶ 播放</button><button class="btn b-pause">❚❚ 暫停</button><button class="btn b-reset">↺ 重設</button></div>
            <button class="btn ghost b-story">🎬 看動畫解說（36 秒）</button>
            <p class="tiny">調整高度或切換案例即重置。</p>
          </div>
        </div>
        <div class="fixed-note">⑤ 程式固定：脈衝全寬 20%；波速每秒 5% 畫面寬度；起始位置 A 25%／B 75%；位移刻度 −3～＋3；P 在 50%。</div>
      </div>`;
    const q = (c) => root.querySelector(c);
    const cvT = q(".cv-top"), cvB = q(".cv-bot");
    let gT, gB, W = 600, H = 150;
    function size() {
      W = Math.max(280, q(".rope-plots").clientWidth);
      H = Math.round(Math.min(170, W * 0.28));
      gT = setupCanvas(cvT, W, H);
      gB = setupCanvas(cvB, W, H);
    }
    const pulse = (x, c, h) => (Math.abs(x - c) < W0 / 2 ? h * (0.5 + 0.5 * Math.cos((Math.PI * (x - c)) / (W0 / 2))) : 0);
    const cA = () => 25 + SPEED * s.t, cB = () => 75 - SPEED * s.t;

    function axes(g) {
      const pad = 30;
      g.clearRect(0, 0, W, H);
      g.strokeStyle = css("--line");
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(pad, 6); g.lineTo(pad, H - 18); g.lineTo(W - 6, H - 18);
      g.stroke();
      g.fillStyle = css("--muted");
      g.font = "11px system-ui";
      const yy = (v) => 6 + ((3 - v) / 6) * (H - 24);
      [3, 0, -3].forEach((v) => g.fillText(v === 0 ? "0" : (v > 0 ? "3" : "-3"), 8, yy(v) + 4));
      g.strokeStyle = css("--line");
      g.setLineDash([]);
      g.beginPath(); g.moveTo(pad, yy(0)); g.lineTo(W - 6, yy(0)); g.stroke();
      // P
      const px = pad + 0.5 * (W - 6 - pad);
      g.setLineDash([2, 3]);
      g.strokeStyle = css("--muted");
      g.beginPath(); g.moveTo(px, 6); g.lineTo(px, H - 18); g.stroke();
      g.setLineDash([]);
      g.fillText("P", px + 4, H - 22);
      [0, 25, 50, 75, 100].forEach((v) => g.fillText(String(v), pad + (v / 100) * (W - 6 - pad) - 6, H - 4));
      return { X: (x) => pad + (x / 100) * (W - 6 - pad), Y: yy };
    }
    function curve(g, m, f, width, dash, color) {
      g.strokeStyle = color;
      g.lineWidth = width;
      g.setLineDash(dash || []);
      g.beginPath();
      for (let i = 0; i <= 400; i++) {
        const x = i / 4;
        const y = f(x);
        i ? g.lineTo(m.X(x), m.Y(y)) : g.moveTo(m.X(x), m.Y(y));
      }
      g.stroke();
      g.setLineDash([]);
    }
    function draw() {
      const ink = css("--ink"), acc = css("--accent");
      let m = axes(gT);
      curve(gT, m, (x) => pulse(x, cA(), s.a), 1.5, [], ink);
      curve(gT, m, (x) => pulse(x, cB(), s.b), 2, [6, 4], acc);
      gT.fillStyle = ink; gT.font = "bold 12px system-ui";
      if (cA() < 110) gT.fillText("A →", m.X(Math.min(cA(), 96)) - 10, m.Y(Math.max(0, s.a)) - 6);
      if (cB() > -10) gT.fillText("← B", m.X(Math.max(cB(), 4)) - 10, m.Y(Math.max(0, s.b)) - 20);
      m = axes(gB);
      curve(gB, m, (x) => pulse(x, cA(), s.a) + pulse(x, cB(), s.b), 3.5, [], ink);
      const pa = pulse(50, cA(), s.a), pb = pulse(50, cB(), s.b);
      q(".pval").textContent = `A＝${fmt(pa)}，B＝${fmt(pb)}，合成＝${fmt(pa + pb)}（相對單位）`;
      q(".sim-status").textContent = `${s.play ? "播放中" : "暫停中"}　t＝${s.t.toFixed(1)} 秒`;
      q(".va").textContent = fmt(s.a);
      q(".vb").textContent = fmt(s.b);
    }
    function reset(log) {
      s.t = 0; s.play = false;
      q(".ra").value = s.a; q(".rb").value = s.b;
      draw();
      if (log) ctx.log("繩波：重設", { a: s.a, b: s.b });
    }
    q(".ra").oninput = (e) => { s.a = +e.target.value; reset(); };
    q(".rb").oninput = (e) => { s.b = +e.target.value; reset(); };
    q(".ra").onchange = () => ctx.log("繩波：調整脈衝高度A", { a: s.a });
    q(".rb").onchange = () => ctx.log("繩波：調整脈衝高度B", { b: s.b });
    q(".b-same").onclick = () => { s.a = 1; s.b = 1; reset(); ctx.log("繩波：切換同向", {}); };
    q(".b-opp").onclick = () => { s.a = 1; s.b = -1; reset(); ctx.log("繩波：切換反向", {}); };
    q(".b-play").onclick = () => { if (s.t >= 16) s.t = 0; s.play = true; ctx.log("繩波：播放", { t: +s.t.toFixed(1), a: s.a, b: s.b }); };
    q(".b-pause").onclick = () => { s.play = false; draw(); ctx.log("繩波：暫停", { t: +s.t.toFixed(1), a: s.a, b: s.b }); };
    q(".b-reset").onclick = () => { s.a = 1; s.b = 1; reset(true); };

    // 07B 動畫分鏡：36 秒
    const shots = [
      { at: 0, len: 6, cap: "01｜在理想線性介質中，兩個相同脈衝正相向傳播。", a: 1, b: 1, run: [0, 5] },
      { at: 6, len: 8, cap: "02｜同一位置的位移相加。同向重疊時，這裡的合成位移變大。（教學定格）", hold: 5 },
      { at: 14, len: 6, cap: "03｜通過之後，兩個脈衝仍各自向原方向傳播。", run: [5, 11] },
      { at: 20, len: 8, cap: "04｜新案例：改成等大反向時，位移抵銷，完全重疊當下合成位移為零。（教學定格）", a: 1, b: -1, run: [0, 5] },
      { at: 28, len: 8, cap: "05｜零位移只描述這一瞬間；不代表波或能量永久消失。　重疊暫時，通過後各自傳播", run: [5, 12] },
    ];
    q(".b-story").onclick = () => {
      s.story = { T: 0 };
      s.play = false;
      q(".caption-bar").hidden = false;
      ctx.log("繩波：觀看動畫解說", {});
    };
    function storyStep(dt) {
      const st = s.story;
      st.T += dt;
      if (st.T > 36) { s.story = null; q(".caption-bar").hidden = true; return; }
      const shot = shots.filter((x) => x.at <= st.T).pop();
      q(".caption-bar").textContent = shot.cap;
      if (shot.a !== undefined && st.cur !== shot) { s.a = shot.a; s.b = shot.b; q(".ra").value = s.a; q(".rb").value = s.b; }
      st.cur = shot;
      const k = (st.T - shot.at) / shot.len;
      if (shot.run) s.t = shot.run[0] + (shot.run[1] - shot.run[0]) * Math.min(1, k * (shot.at === 0 || shot.at === 20 ? 1.4 : 1));
      else s.t = shot.hold;
    }
    size();
    reset();
    window.addEventListener("resize", () => { size(); draw(); });
    loop((dt) => {
      if (s.story) storyStep(dt);
      else if (s.play) {
        s.t += dt;
        if (s.t >= 16) { s.t = 16; s.play = false; }
      }
      draw();
    });
  }

  /* ---------------- 水波干涉（俯視） ---------------- */
  function water(root, ctx) {
    root.innerHTML = `
      <div class="sim water">
        <div class="sim-head"><b>雙點波源水波干涉（俯視模型）</b><span class="sim-status"></span></div>
        <div class="water-body">
          <div class="water-left">
            <canvas class="cv-w"></canvas>
            <div class="btn-row">
              <button class="btn mode on" data-m="inst">瞬時起伏</button>
              <button class="btn mode" data-m="amp">振幅分布（一段時間）</button>
              <button class="btn b-pause">❚❚ 定格</button>
            </div>
            <p class="tiny">S₁、S₂ 同頻率、同相振動。點「A」「B」或直接點水面任一處選點。</p>
          </div>
          <div class="water-right">
            <div class="btn-row"><button class="btn pick" data-p="A">選 A 點</button><button class="btn pick" data-p="B">選 B 點</button></div>
            <div class="trace-title">所選點的起伏紀錄（位移—時間）</div>
            <canvas class="cv-tr"></canvas>
            <div class="readout"><div>此刻位移：<b class="r-now"></b></div><div>一個週期內最大位移（振幅）：<b class="r-amp"></b></div></div>
          </div>
        </div>
      </div>`;
    const q = (c) => root.querySelector(c);
    const NX = 140, NY = 100, lam = 0.11, d = 0.3;
    const S1 = { x: 0.5 - d / 2, y: 0.12 }, S2 = { x: 0.5 + d / 2, y: 0.12 };
    const k = (2 * Math.PI) / lam, w = 2 * Math.PI; // 週期 1 秒
    const amp = (r) => 1 / Math.sqrt(Math.max(r, 0.02) / 0.1);
    const cells = [];
    for (let j = 0; j < NY; j++)
      for (let i = 0; i < NX; i++) {
        const x = (i + 0.5) / NX, y = ((j + 0.5) / NY) * 0.75;
        const r1 = Math.hypot(x - S1.x, y - S1.y), r2 = Math.hypot(x - S2.x, y - S2.y);
        const a1 = amp(r1), a2 = amp(r2);
        const A = Math.hypot(a1 + a2 * Math.cos(k * (r2 - r1)), a2 * Math.sin(k * (r2 - r1)));
        cells.push({ r1, r2, a1, a2, A });
      }
    const yA = 0.6;
    // 找 B 點：同一高度、路程差 = 半波長
    let xB = 0.5;
    for (let x = 0.5; x < 0.95; x += 0.0005) {
      const dd = Math.hypot(x - S2.x, yA - S2.y) - Math.hypot(x - S1.x, yA - S1.y);
      if (Math.abs(Math.abs(dd) - lam / 2) < 0.0006) { xB = x; break; }
    }
    const pts = { A: { x: 0.5, y: yA }, B: { x: xB, y: yA } };
    const s = { t: 0, mode: "inst", play: true, sel: { name: "A", ...pts.A }, hist: [] };
    const off = document.createElement("canvas");
    off.width = NX; off.height = NY;
    const og = off.getContext("2d");
    const img = og.createImageData(NX, NY);
    const cv = q(".cv-w"), tr = q(".cv-tr");
    let g, gt, Wc, Hc, Wt, Ht;
    function size() {
      Wc = Math.max(260, q(".water-left").clientWidth);
      Hc = Math.round(Wc * 0.62);
      g = setupCanvas(cv, Wc, Hc);
      Wt = Math.max(220, q(".water-right").clientWidth);
      Ht = 130;
      gt = setupCanvas(tr, Wt, Ht);
    }
    const disp = (x, y, t) => {
      const r1 = Math.hypot(x - S1.x, y - S1.y), r2 = Math.hypot(x - S2.x, y - S2.y);
      return amp(r1) * Math.sin(w * t - k * r1) + amp(r2) * Math.sin(w * t - k * r2);
    };
    function drawField() {
      const data = img.data;
      for (let n = 0; n < cells.length; n++) {
        const c = cells[n];
        let v;
        if (s.mode === "inst") v = (c.a1 * Math.sin(w * s.t - k * c.r1) + c.a2 * Math.sin(w * s.t - k * c.r2)) / 2.4;
        else v = c.A / 2.4;
        v = Math.max(-1, Math.min(1, v));
        let r, gg, b;
        if (s.mode === "inst") {
          // 波峰亮、波谷深藍
          r = 40 + 200 * (v + 1) / 2; gg = 110 + 140 * (v + 1) / 2; b = 190 + 60 * (v + 1) / 2;
        } else {
          r = 245 - 200 * v; gg = 245 - 120 * v; b = 250 - 40 * v;
        }
        data[n * 4] = r; data[n * 4 + 1] = gg; data[n * 4 + 2] = b; data[n * 4 + 3] = 255;
      }
      og.putImageData(img, 0, 0);
      g.imageSmoothingEnabled = true;
      g.drawImage(off, 0, 0, Wc, Hc);
      const X = (x) => x * Wc, Y = (y) => (y / 0.75) * Hc;
      g.fillStyle = "#111";
      g.font = "bold 12px system-ui";
      [S1, S2].forEach((p, i) => { g.beginPath(); g.arc(X(p.x), Y(p.y), 5, 0, 7); g.fill(); g.fillText(i ? "S₂" : "S₁", X(p.x) + 7, Y(p.y) - 4); });
      Object.entries(pts).forEach(([n, p]) => {
        g.strokeStyle = "#111"; g.lineWidth = 2;
        g.beginPath(); g.arc(X(p.x), Y(p.y), 7, 0, 7); g.stroke();
        g.fillStyle = "#111"; g.fillText(n, X(p.x) + 9, Y(p.y) + 4);
      });
      if (s.sel.name === "你選的點") {
        g.strokeStyle = "#d22"; g.lineWidth = 2;
        g.beginPath(); g.arc(X(s.sel.x), Y(s.sel.y), 7, 0, 7); g.stroke();
      }
      g.fillStyle = "rgba(255,255,255,.85)"; g.fillRect(6, Hc - 22, 210, 18);
      g.fillStyle = "#333"; g.font = "11px system-ui";
      g.fillText(s.mode === "inst" ? "顏色＝此刻的瞬時位移（模型，非實拍）" : "顏色深＝一段時間內振幅大（模型）", 10, Hc - 9);
    }
    function drawTrace() {
      gt.clearRect(0, 0, Wt, Ht);
      const mid = Ht / 2;
      gt.strokeStyle = css("--line"); gt.lineWidth = 1;
      gt.beginPath(); gt.moveTo(0, mid); gt.lineTo(Wt, mid); gt.stroke();
      gt.strokeStyle = css("--accent"); gt.lineWidth = 2;
      gt.beginPath();
      const hs = s.hist;
      hs.forEach((v, i) => {
        const x = (i / 240) * Wt, y = mid - (v / 2.4) * (Ht / 2 - 6);
        i ? gt.lineTo(x, y) : gt.moveTo(x, y);
      });
      gt.stroke();
      gt.fillStyle = css("--muted"); gt.font = "11px system-ui";
      gt.fillText("← 較早　　　時間　　　現在 →", 6, Ht - 4);
      gt.fillText(s.sel.name, 6, 12);
      const now = hs.length ? hs[hs.length - 1] : 0;
      const last = hs.slice(-60);
      const amax = last.length >= 60 ? Math.max(...last.map(Math.abs)) : null;
      q(".r-now").textContent = (now / 2.4 * 3).toFixed(2) + "（相對單位）";
      q(".r-amp").textContent = amax === null ? "觀察中……請等一個完整週期" : (amax / 2.4 * 3).toFixed(2) + "（相對單位）";
    }
    function select(name, p, log = true) {
      s.sel = { name, x: p.x, y: p.y };
      s.hist = [];
      if (log) ctx.log("水波：選點", { 點: name, x: +p.x.toFixed(3), y: +p.y.toFixed(3) });
    }
    root.querySelectorAll(".mode").forEach((b) => (b.onclick = () => {
      root.querySelectorAll(".mode").forEach((x) => x.classList.toggle("on", x === b));
      s.mode = b.dataset.m;
      ctx.log("水波：切換顯示", { 模式: b.textContent });
    }));
    q(".b-pause").onclick = (e) => {
      s.play = !s.play;
      e.target.textContent = s.play ? "❚❚ 定格" : "▶ 繼續";
      ctx.log(s.play ? "水波：繼續" : "水波：定格", { t: +s.t.toFixed(2) });
    };
    root.querySelectorAll(".pick").forEach((b) => (b.onclick = () => select(b.dataset.p + " 點", pts[b.dataset.p])));
    cv.onclick = (e) => {
      const r = cv.getBoundingClientRect();
      select("你選的點", { x: (e.clientX - r.left) / r.width, y: ((e.clientY - r.top) / r.height) * 0.75 });
    };
    size();
    window.addEventListener("resize", size);
    select("A 點", pts.A, false);
    loop((dt) => {
      if (s.play) {
        s.t += dt * 0.5;
        s.hist.push(disp(s.sel.x, s.sel.y, s.t));
        if (s.hist.length > 240) s.hist.shift();
      }
      drawField();
      drawTrace();
      q(".sim-status").textContent = s.play ? "播放中" : "定格中";
    });
  }

  /* ---------------- 雙狹縫 B／D 次波模型（依 08 規劃 M02） ---------------- */
  function bd(root, ctx) {
    root.innerHTML = `
      <div class="sim bd">
        <canvas class="cv-bd"></canvas>
        <div class="btn-row"><button class="btn primary b-play">▶ 播放</button><button class="btn b-pause">❚❚ 暫停</button><button class="btn b-reset">↺ 重置</button></div>
        <div class="btn-row"><span class="lbl">比較位置</span><button class="btn pt on" data-p="B">B 點</button><button class="btn pt" data-p="D">D 點</button></div>
        <canvas class="cv-bdt"></canvas>
      </div>`;
    const q = (c) => root.querySelector(c);
    const s = { t: 0, play: false, p: "B" };
    let g, gt, W, H, Ht;
    function size() {
      W = Math.max(260, root.clientWidth);
      H = Math.round(W * 0.62);
      Ht = 150;
      g = setupCanvas(q(".cv-bd"), W, H);
      gt = setupCanvas(q(".cv-bdt"), W, Ht);
    }
    function draw() {
      const ink = css("--ink"), acc = css("--accent"), muted = css("--muted");
      g.clearRect(0, 0, W, H);
      const xs = W * 0.18, xsc = W * 0.82, yc = H * 0.5, dy = H * 0.12;
      const S1 = { x: xs, y: yc - dy }, S2 = { x: xs, y: yc + dy };
      const B = { x: xsc, y: yc - H * 0.02 }, D = { x: xsc, y: yc + H * 0.3 };
      // 次波波面（模型）
      const lam = W * 0.07;
      g.lineWidth = 1;
      [S1, S2].forEach((S) => {
        for (let n = 0; n < 14; n++) {
          const r = ((s.t * lam) % lam) + n * lam;
          g.strokeStyle = `rgba(80,120,200,${0.28 - n * 0.018})`;
          g.beginPath(); g.arc(S.x, S.y, r, -Math.PI / 2.2, Math.PI / 2.2); g.stroke();
        }
      });
      // 擋板與屏幕
      g.strokeStyle = ink; g.lineWidth = 6;
      g.beginPath();
      g.moveTo(xs, 30); g.lineTo(xs, S1.y - 8);
      g.moveTo(xs, S1.y + 8); g.lineTo(xs, S2.y - 8);
      g.moveTo(xs, S2.y + 8); g.lineTo(xs, H - 28);
      g.moveTo(xsc, 30); g.lineTo(xsc, H - 28);
      g.stroke();
      g.fillStyle = ink; g.font = "bold 13px system-ui";
      g.textAlign = "center";
      g.fillText("雙狹縫", xs, 18); g.fillText("屏幕", xsc, 18);
      g.textAlign = "left";
      g.fillText("S₁", xs - 26, S1.y + 5); g.fillText("S₂", xs - 26, S2.y + 5);
      // 路徑
      const P = s.p === "B" ? B : D;
      [[B, []], [D, [6, 5]]].forEach(([T, dash]) => {
        g.setLineDash(dash);
        g.strokeStyle = T === P ? acc : "rgba(120,120,120,.35)";
        g.lineWidth = T === P ? 2.5 : 1.2;
        g.beginPath(); g.moveTo(S1.x, S1.y); g.lineTo(T.x, T.y); g.moveTo(S2.x, S2.y); g.lineTo(T.x, T.y); g.stroke();
      });
      g.setLineDash([]);
      [["B", B], ["D", D]].forEach(([n, T]) => {
        g.fillStyle = T === P ? acc : ink;
        g.beginPath(); g.arc(T.x, T.y, 7, 0, 7); g.fill();
        g.font = "bold 16px system-ui"; g.fillText(n, T.x + 12, T.y + 6);
      });
      g.fillStyle = css("--card"); g.fillRect(0, H - 22, W, 22);
      g.fillStyle = muted; g.font = "12px system-ui";
      g.fillText("路徑示意　非實拍　未依比例（模型）", 10, H - 7);
      // 下方：到達所選點的兩列波與疊加
      gt.clearRect(0, 0, W, Ht);
      const rows = [["來自 S₁ 的波（到達 " + s.p + "）", 0], ["來自 S₂ 的波（到達 " + s.p + "）", s.p === "B" ? 0 : Math.PI], ["兩列波疊加", null]];
      rows.forEach(([label, ph], i) => {
        const y0 = 22 + i * 44;
        gt.fillStyle = muted; gt.font = "11px system-ui"; gt.fillText(label, 6, y0 - 8);
        gt.strokeStyle = css("--line"); gt.lineWidth = 1;
        gt.beginPath(); gt.moveTo(150, y0 + 6); gt.lineTo(W - 6, y0 + 6); gt.stroke();
        gt.strokeStyle = i === 2 ? ink : acc; gt.lineWidth = i === 2 ? 2.5 : 1.6;
        gt.beginPath();
        for (let x = 150; x <= W - 6; x += 2) {
          const u = (x - 150) / 40 - s.t * 2 * Math.PI * 0.5;
          const v = ph === null ? Math.sin(u) + Math.sin(u + (s.p === "B" ? 0 : Math.PI)) : Math.sin(u + ph);
          const y = y0 + 6 - v * 7;
          x === 150 ? gt.moveTo(x, y) : gt.lineTo(x, y);
        }
        gt.stroke();
      });
    }
    q(".b-play").onclick = () => { s.play = true; ctx.log("次波模型：播放", { 點: s.p }); };
    q(".b-pause").onclick = () => { s.play = false; ctx.log("次波模型：暫停", { 點: s.p }); };
    q(".b-reset").onclick = () => { s.play = false; s.t = 0; s.p = "B"; mark(); ctx.log("次波模型：重置", {}); };
    function mark() { root.querySelectorAll(".pt").forEach((b) => b.classList.toggle("on", b.dataset.p === s.p)); }
    root.querySelectorAll(".pt").forEach((b) => (b.onclick = () => { s.p = b.dataset.p; mark(); ctx.log("次波模型：選" + s.p + "點", {}); }));
    size();
    window.addEventListener("resize", size);
    loop((dt) => { if (s.play) s.t += dt; draw(); });
  }

  /* ---------------- 單狹縫／雙狹縫：次波源分布與理想圖樣 ---------------- */
  function intensity(type, wide, x) {
    // x: -1..1 屏幕位置（理想遠場模型，定性）
    const a = wide ? 9 : 5; // 縫寬參數
    const u = a * x;
    const sinc = Math.abs(u) < 1e-6 ? 1 : Math.sin(u) / u;
    if (type === "single") return sinc * sinc;
    const v = 34 * x;
    return Math.cos(v) ** 2 * sinc * sinc;
  }
  function slits(root, ctx) {
    root.innerHTML = `
      <div class="sim slits">
        <div class="btn-row"><span class="lbl">裝置</span><button class="btn ty on" data-t="double">雙狹縫</button><button class="btn ty" data-t="single">單狹縫</button></div>
        <div class="btn-row"><span class="lbl">縫寬</span><button class="btn wd on" data-w="1">較寬</button><button class="btn wd" data-w="0">較窄</button></div>
        <canvas class="cv-s"></canvas>
        <p class="tiny">理想模型（遠場、均勻單色照明），不得取代實拍證據。</p>
      </div>`;
    const q = (c) => root.querySelector(c);
    const s = { type: "double", wide: true };
    let g, W, H;
    function size() { W = Math.max(260, root.clientWidth); H = 300; g = setupCanvas(q(".cv-s"), W, H); draw(); }
    function draw() {
      const ink = css("--ink"), acc = css("--accent"), muted = css("--muted");
      g.clearRect(0, 0, W, H);
      // 縫與次波源
      const cx = 70, cy = 110;
      g.strokeStyle = ink; g.lineWidth = 6;
      const half = s.wide ? 26 : 14;
      g.beginPath();
      if (s.type === "single") {
        g.moveTo(cx, 10); g.lineTo(cx, cy - half); g.moveTo(cx, cy + half); g.lineTo(cx, 210);
      } else {
        const sep = 40, hw = s.wide ? 9 : 5;
        g.moveTo(cx, 10); g.lineTo(cx, cy - sep - hw); g.moveTo(cx, cy - sep + hw); g.lineTo(cx, cy + sep - hw); g.moveTo(cx, cy + sep + hw); g.lineTo(cx, 210);
      }
      g.stroke();
      g.fillStyle = acc;
      const dots = s.type === "single" ? Array.from({ length: 9 }, (_, i) => cy - half + 3 + (i * (2 * half - 6)) / 8) : [cy - 40, cy + 40];
      dots.forEach((y) => { g.beginPath(); g.arc(cx, y, 3.5, 0, 7); g.fill(); });
      g.fillStyle = ink; g.font = "12px system-ui";
      g.fillText(s.type === "single" ? "縫內許多次波源（連續分布）" : "兩個分立次波源", cx + 12, 228);
      // 強度曲線
      const x0 = 190, x1 = W - 10;
      if (x1 - x0 > 60) {
        g.strokeStyle = css("--line"); g.lineWidth = 1;
        g.beginPath(); g.moveTo(x0, 180); g.lineTo(x1, 180); g.stroke();
        g.strokeStyle = acc; g.lineWidth = 2;
        g.beginPath();
        for (let px = x0; px <= x1; px++) {
          const x = ((px - x0) / (x1 - x0)) * 2 - 1;
          const y = 180 - intensity(s.type, s.wide, x) * 150;
          px === x0 ? g.moveTo(px, y) : g.lineTo(px, y);
        }
        g.stroke();
        g.fillStyle = muted; g.fillText("屏幕上的光強（理想模型）", x0, 20);
        // 條紋帶
        for (let px = x0; px <= x1; px++) {
          const x = ((px - x0) / (x1 - x0)) * 2 - 1;
          const I = Math.pow(intensity(s.type, s.wide, x), 0.6);
          g.fillStyle = `rgb(${Math.round(255 * I)},${Math.round(40 * I)},${Math.round(30 * I)})`;
          g.fillRect(px, 240, 1, 46);
        }
        g.fillStyle = muted; g.fillText("中央", (x0 + x1) / 2 - 12, 236);
      }
    }
    root.querySelectorAll(".ty").forEach((b) => (b.onclick = () => {
      s.type = b.dataset.t;
      root.querySelectorAll(".ty").forEach((x) => x.classList.toggle("on", x === b));
      draw(); ctx.log("次波源分布：切換裝置", { 裝置: b.textContent });
    }));
    root.querySelectorAll(".wd").forEach((b) => (b.onclick = () => {
      s.wide = b.dataset.w === "1";
      root.querySelectorAll(".wd").forEach((x) => x.classList.toggle("on", x === b));
      draw(); ctx.log("次波源分布：切換縫寬", { 縫寬: b.textContent });
    }));
    size();
    window.addEventListener("resize", size);
  }

  /* ---------------- 薄膜剖面 ---------------- */
  function wl2rgb(l) {
    let r = 0, g = 0, b = 0;
    if (l < 440) { r = -(l - 440) / 60; b = 1; }
    else if (l < 490) { g = (l - 440) / 50; b = 1; }
    else if (l < 510) { g = 1; b = -(l - 510) / 20; }
    else if (l < 580) { r = (l - 510) / 70; g = 1; }
    else if (l < 645) { r = 1; g = -(l - 645) / 65; }
    else r = 1;
    const f = l < 420 ? 0.3 + (0.7 * (l - 380)) / 40 : l > 700 ? 0.3 + (0.7 * (780 - l)) / 80 : 1;
    return [r * f, g * f, b * f];
  }
  function filmColor(dnm) {
    let R = 0, G = 0, B = 0, n = 0;
    for (let l = 400; l <= 700; l += 10) {
      const I = Math.sin((2 * Math.PI * 1.33 * dnm) / l) ** 2; // 含上表面反射相位改變（定性）
      const c = wl2rgb(l);
      R += c[0] * I; G += c[1] * I; B += c[2] * I; n++;
    }
    const k = 2.2 / n;
    return [Math.min(1, R * k), Math.min(1, G * k), Math.min(1, B * k)];
  }
  function film(root, ctx) {
    root.innerHTML = `
      <div class="sim film">
        <svg class="film-svg" viewBox="0 0 520 260" role="img" aria-label="薄膜剖面模型">
          <rect x="0" y="0" width="520" height="120" fill="var(--bg2)"/>
          <rect x="0" y="120" width="520" height="50" fill="rgba(120,170,230,.25)"/>
          <rect x="0" y="170" width="520" height="90" fill="var(--bg2)"/>
          <line x1="0" y1="120" x2="520" y2="120" stroke="var(--ink)" stroke-width="1.5"/>
          <line x1="0" y1="170" x2="520" y2="170" stroke="var(--ink)" stroke-width="1.5"/>
          <text x="8" y="140" font-size="12" fill="var(--muted)">透明薄膜</text>
          <text x="8" y="114" font-size="11" fill="var(--muted)">上表面</text>
          <text x="8" y="186" font-size="11" fill="var(--muted)">下表面</text>
          <text x="30" y="24" font-size="13" fill="var(--ink)">白光</text>
          <line x1="40" y1="30" x2="200" y2="120" stroke="#c9a400" stroke-width="3"/>
          <g class="path" data-k="1"><line x1="200" y1="120" x2="330" y2="40" stroke="currentColor" stroke-width="3"/><line x1="200" y1="120" x2="330" y2="40" stroke="transparent" stroke-width="18"/><text x="336" y="44" font-size="13" fill="currentColor">①</text></g>
          <g class="path" data-k="2"><polyline points="200,120 240,170 280,120 380,55" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="7 4"/><polyline points="200,120 240,170 280,120 380,55" fill="none" stroke="transparent" stroke-width="18"/><text x="386" y="58" font-size="13" fill="currentColor">②</text></g>
          <g class="path" data-k="3"><polyline points="240,170 300,250" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="2 4"/><polyline points="240,170 300,250" fill="none" stroke="transparent" stroke-width="18"/><text x="306" y="252" font-size="13" fill="currentColor">③</text></g>
          <text x="420" y="30" font-size="22">👁</text>
          <text x="400" y="250" font-size="11" fill="var(--muted)">模型示意　未依比例</text>
        </svg>
        <div class="path-legend">
          <button class="btn pbtn" data-k="1">① 在上表面直接反射的光</button>
          <button class="btn pbtn" data-k="2">② 進入薄膜、在下表面反射後穿出上表面的光</button>
          <button class="btn pbtn" data-k="3">③ 穿過薄膜往下離開的光</button>
        </div>
        <div class="row-actions"><button class="btn primary b-check">確認我選的兩路光</button></div>
        <div class="film-fb" aria-live="polite"></div>
        <div class="film-strip-wrap">
          <div class="lbl">膜厚分布（左薄右厚的楔形薄膜）：拖動調整整體厚度</div>
          <input type="range" min="0.3" max="2.2" step="0.01" value="1" class="thick">
          <canvas class="cv-film"></canvas>
          <p class="tiny">白光中不同波長在不同膜厚處增強或減弱 → 彩色分布（定性模型，不顯示數值）。</p>
        </div>
      </div>`;
    const q = (c) => root.querySelector(c);
    const sel = new Set(ctx.get().paths || []);
    function mark() {
      root.querySelectorAll(".path,.pbtn").forEach((p) => p.classList.toggle("on", sel.has(p.dataset.k)));
    }
    function toggle(k) {
      sel.has(k) ? sel.delete(k) : sel.add(k);
      mark();
    }
    root.querySelectorAll(".path,.pbtn").forEach((p) => (p.onclick = () => toggle(p.dataset.k)));
    let tries = (ctx.get().tries || 0);
    q(".b-check").onclick = () => {
      tries++;
      const arr = [...sel].sort();
      const ok = arr.join() === "1,2";
      let fb;
      if (ok) fb = "✓ 你找到了會在觀察方向重疊的兩路反射光。下一個問題：只比較這兩路光的路徑長短就夠了嗎？（讀下一頁正文找找看還有什麼因素）";
      else if (sel.has("3")) fb = "③ 往下離開薄膜，它會到達上方的眼睛嗎？哪些光是「反射」回到上方的？";
      else if (arr.length < 2) fb = "到達眼睛、互相干涉的需要「兩路」光。除了上表面反射，還有哪一路光也回到了上方？";
      else fb = "再看一次剖面：哪兩路光最後朝同一個方向傳播？";
      q(".film-fb").textContent = fb;
      ctx.save({ paths: arr, correct: ok, tries });
      ctx.log("薄膜：確認兩路光", { 選擇: arr.join("、"), 正確: ok });
    };
    mark();
    const cv = q(".cv-film");
    let g, W;
    function drawStrip() {
      W = Math.max(240, q(".film-strip-wrap").clientWidth);
      g = setupCanvas(cv, W, 60);
      const sc = +q(".thick").value;
      for (let x = 0; x < W; x++) {
        const d = (x / W) * 700 * sc; // nm（內部計算用）
        const c = filmColor(d);
        g.fillStyle = `rgb(${c.map((v) => Math.round(v * 255)).join(",")})`;
        g.fillRect(x, 0, 1, 60);
      }
    }
    q(".thick").oninput = drawStrip;
    q(".thick").onchange = () => ctx.log("薄膜：調整膜厚", { 倍率: +q(".thick").value });
    drawStrip();
    window.addEventListener("resize", drawStrip);
  }

  /* ---------------- 屏幕亮暗格（學生作圖） ---------------- */
  function screenDraw(root, value, onChange, readonly) {
    const N = 15;
    const v = Array.isArray(value) && value.length === N ? value.slice() : Array(N).fill(0);
    root.innerHTML = `<div class="screen-draw ${readonly ? "ro" : ""}"><div class="sd-cells"></div><div class="sd-lbl"><span>左</span><span>中央</span><span>右</span></div>${readonly ? "" : '<p class="tiny">點格子切換：深色＝暗，留白＝亮。</p>'}</div>`;
    const box = root.querySelector(".sd-cells");
    v.forEach((on, i) => {
      const c = document.createElement("button");
      c.className = "sd-cell" + (on ? " lit" : "");
      c.setAttribute("aria-label", `第${i + 1}格：${on ? "亮" : "暗"}`);
      if (!readonly)
        c.onclick = () => {
          v[i] = v[i] ? 0 : 1;
          c.classList.toggle("lit", !!v[i]);
          c.setAttribute("aria-label", `第${i + 1}格：${v[i] ? "亮" : "暗"}`);
          onChange && onChange(v.slice());
        };
      else c.disabled = true;
      box.appendChild(c);
    });
  }

  /* ---------------- 理想圖樣條 ---------------- */
  function pattern(root, type) {
    root.innerHTML = `<div class="pattern"><canvas></canvas><div class="tiny">理想模型（非實拍）</div></div>`;
    const cv = root.querySelector("canvas");
    const W = Math.max(240, root.clientWidth || 400);
    const g = setupCanvas(cv, W, 56);
    for (let px = 0; px < W; px++) {
      const x = (px / W) * 2 - 1;
      const I = Math.pow(intensity(type, true, x), 0.6);
      g.fillStyle = type === "single"
        ? `rgb(${Math.round(60 * I)},${Math.round(90 * I)},${Math.round(255 * I)})`
        : `rgb(${Math.round(255 * I)},${Math.round(40 * I)},${Math.round(30 * I)})`;
      g.fillRect(px, 0, 1, 56);
    }
  }

  /* ---------------- 向量示意圖 ---------------- */
  const FIG = {
    rope_compare() {
      const col = (x0, sign, title, label) => {
        const P = (x, y) => `${x0 + 20 + x * 2.2},${y}`;
        let top1 = "", top2 = "", bot = "";
        for (let i = 0; i <= 100; i++) {
          const v = Math.abs(i - 50) < 10 ? 0.5 + 0.5 * Math.cos((Math.PI * (i - 50)) / 10) : 0;
          top1 += P(i, 80 - v * 22) + " ";
          top2 += P(i, 80 - sign * v * 22) + " ";
          bot += P(i, 200 - (1 + sign) * v * 22) + " ";
        }
        return `<text x="${x0 + 130}" y="22" text-anchor="middle" font-size="15" font-weight="700">${title}</text>
          <text x="${x0 + 20}" y="44" font-size="11" fill="var(--muted)">上區：分波模型</text>
          <line x1="${x0 + 20}" y1="80" x2="${x0 + 240}" y2="80" stroke="var(--line)"/>
          <polyline points="${top1}" fill="none" stroke="var(--ink)" stroke-width="1.3"/>
          <polyline points="${top2}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-dasharray="6 4"/>
          <line x1="${x0 + 130}" y1="48" x2="${x0 + 130}" y2="110" stroke="var(--muted)" stroke-dasharray="2 3"/>
          <text x="${x0 + 134}" y="110" font-size="11">P</text>
          <text x="${x0 + 20}" y="150" font-size="11" fill="var(--muted)">下區：完全重疊當下的合成繩形</text>
          <text x="${x0 + 130}" y="166" text-anchor="middle" font-size="13">${label}</text>
          <line x1="${x0 + 20}" y1="200" x2="${x0 + 240}" y2="200" stroke="var(--line)"/>
          <polyline points="${bot}" fill="none" stroke="var(--ink)" stroke-width="3.5"/>
          <line x1="${x0 + 130}" y1="170" x2="${x0 + 130}" y2="228" stroke="var(--muted)" stroke-dasharray="2 3"/>
          <text x="${x0 + 134}" y="228" font-size="11">P</text>`;
      };
      return `<svg viewBox="0 0 540 250" class="fig" role="img" aria-label="兩種完全重疊的比較">
        ${col(0, 1, "同向位移", "P：＋1＋1＝＋2")}${col(270, -1, "反向位移", "P：＋1－1＝0")}
        <text x="270" y="246" text-anchor="middle" font-size="11" fill="var(--muted)">A 細實線／B 虛線／合成繩形粗實線；兩欄共用相同刻度</text></svg>`;
    },
    setup_double() { return setupFig("雙狹縫"); },
    setup_single() { return setupFig("單狹縫"); },
    huygens() {
      let plane = "";
      for (let i = 0; i < 6; i++) plane += `<line x1="${40 + i * 28}" y1="20" x2="${40 + i * 28}" y2="240" stroke="var(--accent)" opacity=".7"/>`;
      return `<svg viewBox="0 0 400 260" class="fig" role="img" aria-label="惠更斯原理示意">
        <defs><clipPath id="rc"><rect x="200" y="0" width="200" height="260"/></clipPath></defs>
        ${plane}
        <g clip-path="url(#rc)">${circleSet(200, 100)}${circleSet(200, 160)}</g>
        <line x1="200" y1="10" x2="200" y2="92" stroke="var(--ink)" stroke-width="6"/>
        <line x1="200" y1="108" x2="200" y2="152" stroke="var(--ink)" stroke-width="6"/>
        <line x1="200" y1="168" x2="200" y2="250" stroke="var(--ink)" stroke-width="6"/>
        <circle cx="200" cy="100" r="4" fill="var(--accent)"/><circle cx="200" cy="160" r="4" fill="var(--accent)"/>
        <text x="40" y="256" font-size="11" fill="var(--muted)">入射平面波</text>
        <text x="214" y="96" font-size="11">次波源</text><text x="214" y="176" font-size="11">次波源</text>
        <text x="240" y="256" font-size="11" fill="var(--muted)">模型：波面不是可見光路</text></svg>`;
    },
    subsource_compare() {
      const many = Array.from({ length: 9 }, (_, i) => `<circle cx="330" cy="${108 + i * 5.5}" r="2.6" fill="var(--accent)"/>`).join("");
      return `<svg viewBox="0 0 460 230" class="fig" role="img" aria-label="雙狹縫與單狹縫的次波源分布">
        <text x="100" y="22" text-anchor="middle" font-size="14" font-weight="700">雙狹縫</text>
        <text x="330" y="22" text-anchor="middle" font-size="14" font-weight="700">單狹縫</text>
        <line x1="100" y1="40" x2="100" y2="92" stroke="var(--ink)" stroke-width="6"/><line x1="100" y1="104" x2="100" y2="136" stroke="var(--ink)" stroke-width="6"/><line x1="100" y1="148" x2="100" y2="200" stroke="var(--ink)" stroke-width="6"/>
        <circle cx="100" cy="98" r="4" fill="var(--accent)"/><circle cx="100" cy="142" r="4" fill="var(--accent)"/>
        ${circleSet(100, 98, 4)}${circleSet(100, 142, 4)}
        <line x1="330" y1="40" x2="330" y2="104" stroke="var(--ink)" stroke-width="6"/><line x1="330" y1="156" x2="330" y2="200" stroke="var(--ink)" stroke-width="6"/>
        ${many}
        <text x="100" y="222" text-anchor="middle" font-size="12">兩個分立次波源</text>
        <text x="330" y="222" text-anchor="middle" font-size="12">縫內連續分布的次波源</text>
        <text x="230" y="120" text-anchor="middle" font-size="12" fill="var(--muted)">共同：次波疊加</text></svg>`;
    },
  };
  function circleSet(cx, cy, n = 5) {
    let s = "";
    for (let i = 1; i <= n; i++) s += `<path d="M ${cx} ${cy - i * 20} A ${i * 20} ${i * 20} 0 0 1 ${cx} ${cy + i * 20}" fill="none" stroke="var(--accent)" opacity="${0.9 - i * 0.13}"/>`;
    return s;
  }
  function setupFig(kind) {
    const slit = kind === "雙狹縫"
      ? `<rect x="226" y="60" width="8" height="40" fill="var(--ink)"/><rect x="226" y="106" width="8" height="8" fill="var(--ink)"/><rect x="226" y="120" width="8" height="40" fill="var(--ink)"/>`
      : `<rect x="226" y="60" width="8" height="45" fill="var(--ink)"/><rect x="226" y="115" width="8" height="45" fill="var(--ink)"/>`;
    return `<svg viewBox="0 0 520 210" class="fig" role="img" aria-label="${kind}實驗架設空間位置示意">
      <rect x="10" y="150" width="500" height="10" rx="3" fill="var(--line)"/>
      <rect x="40" y="88" width="70" height="44" rx="6" fill="none" stroke="var(--ink)" stroke-width="2"/>
      <text x="75" y="115" text-anchor="middle" font-size="12">光源</text>
      <text x="75" y="80" text-anchor="middle" font-size="11" fill="var(--muted)">（雷射，教師操作）</text>
      ${slit}
      <text x="230" y="50" text-anchor="middle" font-size="12">${kind}</text>
      <rect x="440" y="40" width="10" height="110" fill="var(--ink)" opacity=".85"/>
      <text x="445" y="32" text-anchor="middle" font-size="12">屏幕</text>
      <text x="260" y="190" text-anchor="middle" font-size="11" fill="var(--muted)">只呈現器材位置，不畫光線路徑（本教材自製示意）</text>
    </svg>`;
  }

  window.Sims = { rope, water, bd, slits, film, screenDraw, pattern, FIG, stopAll };
})();
