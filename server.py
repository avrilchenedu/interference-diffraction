#!/usr/bin/env python3
"""干涉與繞射｜互動式線上教材 後端

只用 Python 標準函式庫：http.server + sqlite3。
- 記錄每位學生（學生代碼）的作答、初稿與修訂歷程、操作紀錄、小波追問對話與轉教師標記。
- 小波追問：設定 ANTHROPIC_API_KEY 且已安裝 anthropic 套件時使用 Claude；否則使用內建規則式追問。
啟動：python3 server.py   然後開啟 http://127.0.0.1:8000
"""
import csv
import io
import json
import os
import random
import sqlite3
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, quote, urlparse

BASE = os.path.dirname(os.path.abspath(__file__))
STATIC = os.path.join(BASE, "static")
DATA = os.path.join(BASE, "data")
os.makedirs(DATA, exist_ok=True)
DB_PATH = os.path.join(DATA, "learning.db")

with open(os.path.join(STATIC, "content.json"), encoding="utf-8") as f:
    CONTENT = json.load(f)
with open(os.path.join(STATIC, "socratic.json"), encoding="utf-8") as f:
    RULES = json.load(f)
VERSION = CONTENT.get("version", "")

TEACHER_PIN = os.environ.get("TEACHER_PIN") or "".join(random.choice("0123456789") for _ in range(4))
MODEL = os.environ.get("CLAUDE_MODEL", "claude-opus-5-5")

# ---------------- 資料庫 ----------------
_lock = threading.Lock()


def db():
    con = sqlite3.connect(DB_PATH, timeout=10)
    con.row_factory = sqlite3.Row
    return con


def init_db():
    with db() as con:
        con.executescript(
            """
            CREATE TABLE IF NOT EXISTS students(code TEXT PRIMARY KEY, created REAL, last_seen REAL, position TEXT);
            CREATE TABLE IF NOT EXISTS answers(code TEXT, qid TEXT, data TEXT, updated REAL, PRIMARY KEY(code, qid));
            CREATE TABLE IF NOT EXISTS history(id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT, qid TEXT, ts REAL, data TEXT);
            CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT, ts REAL, chapter INTEGER, action TEXT, detail TEXT);
            CREATE TABLE IF NOT EXISTS dialog(id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT, ts REAL, chapter INTEGER, qid TEXT,
                role TEXT, text TEXT, topic TEXT, level INTEGER, handoff INTEGER, engine TEXT);
            CREATE TABLE IF NOT EXISTS hints(code TEXT, chapter INTEGER, topic TEXT, level INTEGER, asked TEXT,
                PRIMARY KEY(code, chapter, topic));
            """
        )


def now():
    return time.time()


def clean_code(code):
    code = (code or "").strip()
    return code[:40] if code else ""


def touch(con, code, position=None):
    row = con.execute("SELECT code FROM students WHERE code=?", (code,)).fetchone()
    if row:
        if position is not None:
            con.execute("UPDATE students SET last_seen=?, position=? WHERE code=?", (now(), json.dumps(position, ensure_ascii=False), code))
        else:
            con.execute("UPDATE students SET last_seen=? WHERE code=?", (now(), code))
    else:
        con.execute("INSERT INTO students VALUES(?,?,?,?)", (code, now(), now(), json.dumps(position or {}, ensure_ascii=False)))


def student_state(code):
    with db() as con:
        s = con.execute("SELECT * FROM students WHERE code=?", (code,)).fetchone()
        ans = {r["qid"]: json.loads(r["data"]) for r in con.execute("SELECT qid, data FROM answers WHERE code=?", (code,))}
        dlg = [dict(r) for r in con.execute("SELECT ts, chapter, qid, role, text, handoff, topic, level FROM dialog WHERE code=? ORDER BY id", (code,))]
    return {
        "code": code,
        "position": json.loads(s["position"]) if s and s["position"] else {},
        "answers": ans,
        "dialog": dlg,
    }


# ---------------- 小波追問 ----------------
def _has(text, kws):
    return any(k in text for k in kws)


def _get_hint(con, code, ch, topic):
    r = con.execute("SELECT level, asked FROM hints WHERE code=? AND chapter=? AND topic=?", (code, ch, topic)).fetchone()
    return (r["level"], json.loads(r["asked"] or "{}")) if r else (0, {})


def _set_hint(con, code, ch, topic, level, asked):
    con.execute("INSERT OR REPLACE INTO hints VALUES(?,?,?,?,?)", (code, ch, topic, level, json.dumps(asked, ensure_ascii=False)))


def rule_guide(con, code, ch, qid, message, draft_text, stage):
    """回傳 (reply, topic, level, handoff)。每次一個主問題、最多三句、不代答。"""
    msg = message or ""
    full = msg + "\n" + (draft_text or "")
    ch_key = str(ch)

    if _has(msg, RULES["answerSeeking"]["keywords"]):
        return RULES["answerSeeking"]["reply"].get(ch_key, RULES["generic"][0]), "answer_seeking", 0, False

    if stage == "predict":
        return "我先不揭曉答案喔！預測沒有對錯——你這樣預測，是根據什麼想法或經驗？", "predict", 0, False
    if stage == "observe":
        return "現在先只記錄看到的，等一下再解釋。你在畫面上看到哪些特徵？這份資料是實拍還是模型？", "observe", 0, False

    topics = [t for t in RULES["topics"] if t["ch"] == ch]
    # 1) 迷思（先看學生這次說的話，再看初稿）
    hit = None
    for src in (msg, draft_text or ""):
        for t in topics:
            if not t.get("soft") and _has(src, t["kw"]):
                hit = t
                break
        if hit:
            break
    if hit:
        level, asked = _get_hint(con, code, ch, hit["id"])
        if level >= 3:
            _set_hint(con, code, ch, hit["id"], level + 1, asked)
            return RULES["handoff"], hit["id"], level + 1, True
        reply = hit["L"][level]
        handoff = level == 2  # 已給過 L1、L2 仍卡同一錯誤 → 給 L3 並標記轉教師
        _set_hint(con, code, ch, hit["id"], level + 1, asked)
        return reply, hit["id"], level + 1, handoff

    # 2) 依題目的成功規準檢查初稿缺什麼
    checks = RULES["checks"].get(qid or "", [])
    if checks and draft_text:
        level, asked = _get_hint(con, code, ch, "check:" + qid)
        for i, c in enumerate(checks):
            if not _has(draft_text, c["need"]) and asked.get(str(i), 0) < 2:
                asked[str(i)] = asked.get(str(i), 0) + 1
                _set_hint(con, code, ch, "check:" + qid, level + 1, asked)
                return c["ask"], "check:" + qid, i + 1, False

    # 3) 學生的提問碰到本章的一般主題
    for t in topics:
        if t.get("soft") and _has(msg, t["kw"]):
            level, asked = _get_hint(con, code, ch, t["id"])
            reply = t["L"][min(level, 2)]
            _set_hint(con, code, ch, t["id"], level + 1, asked)
            return reply, t["id"], level + 1, False

    if draft_text and checks:
        return RULES["allGood"], "all_good", 0, False
    level, asked = _get_hint(con, code, ch, "generic")
    _set_hint(con, code, ch, "generic", level + 1, asked)
    return RULES["generic"][level % len(RULES["generic"])], "generic", 0, False


def chapter_material(ch):
    c = next((x for x in CONTENT["chapters"] if x["id"] == ch), None)
    if not c:
        return ""
    parts = [f"章節：{c['title']}", f"核心理解：{c['core']}"]
    for s in c["steps"]:
        for p in s.get("paras", []):
            parts.append(p)
        if s["type"] == "recap":
            parts.append("成立條件與易混淆處：" + s["conditions"])
            parts.append("常見迷思：" + "；".join(s["misconceptions"]))
    return "\n".join(parts)


def llm_guide(ch, qid, message, draft_text, stage, history, rule_hint):
    if not os.environ.get("ANTHROPIC_API_KEY") and not os.environ.get("ANTHROPIC_AUTH_TOKEN"):
        return None
    try:
        import anthropic  # noqa
    except ImportError:
        return None
    q = None
    for c in CONTENT["chapters"]:
        for s in c["steps"]:
            if s.get("qid") == qid:
                q = s.get("prompt") or s.get("sentence") or s.get("title")
    system = (
        "你是高一物理互動教材裡的引導角色「小波」，用繁體中文、親切的語氣，採蘇格拉底式追問。\n"
        "規則（必須遵守）：\n"
        "1. 每次只問一個主問題，全部回覆最多三句。\n"
        "2. 絕不直接給答案、結論或可直接繳交的完整解答；學生索取答案時，引導他從已有的觀察開始。\n"
        "3. 預測階段不揭曉答案；觀察階段只請學生描述看到的與資料來源，不解釋；解釋階段才幫學生查核證據與推理。\n"
        "4. 只能使用下方教材內容中的資訊，不得加入教材以外的知識、公式或數值。本單元只作定性說明。\n"
        "5. 區分真實光學證據（實拍）、水波類比與模型；提醒學生註明證據來源。\n"
        "6. 不評斷學生能力或態度。\n\n"
        "=== 教材內容 ===\n" + chapter_material(ch)
    )
    user = (
        f"目前階段：{stage or '解釋'}\n題目：{q or '（學生在本章自由提問）'}\n"
        f"學生目前的作答：{draft_text or '（尚未作答）'}\n"
        f"建議的下一層提示（可改寫，但不可超出）：{rule_hint}\n\n學生說：{message or '請追問我'}"
    )
    msgs = []
    for h in history[-6:]:
        msgs.append({"role": "user" if h["role"] == "student" else "assistant", "content": h["text"]})
    msgs.append({"role": "user", "content": user})
    # 合併連續同角色訊息
    merged = []
    for m in msgs:
        if merged and merged[-1]["role"] == m["role"]:
            merged[-1]["content"] += "\n" + m["content"]
        else:
            merged.append(dict(m))
    if merged and merged[0]["role"] != "user":
        merged = merged[1:]
    try:
        client = anthropic.Anthropic(timeout=30.0, max_retries=1)
        resp = client.messages.create(
            model=MODEL,
            max_tokens=2000,
            system=system,
            messages=merged,
            output_config={"effort": "low"},
            extra_headers={"anthropic-beta": "server-side-fallback-2026-07-01"},
            extra_body={"fallbacks": "default"},
        )
        if resp.stop_reason == "refusal":
            return None
        text = "".join(b.text for b in resp.content if b.type == "text").strip()
        return text or None
    except Exception as e:  # 斷網、逾時、金鑰錯誤 → 改用規則式
        print("[小波] Claude 呼叫失敗，改用規則式追問：", type(e).__name__, e)
        return None


def guide(payload):
    code = clean_code(payload.get("code"))
    ch = int(payload.get("chapter") or 0)
    qid = payload.get("qid") or ""
    message = (payload.get("message") or "").strip()[:1000]
    draft = payload.get("draft") or ""
    if isinstance(draft, dict):
        draft_text = "\n".join(str(v) for v in draft.values() if v)
    else:
        draft_text = str(draft)
    stage = payload.get("stage") or "explain"
    with _lock, db() as con:
        touch(con, code)
        hist = [dict(r) for r in con.execute(
            "SELECT role, text FROM dialog WHERE code=? AND chapter=? AND qid=? ORDER BY id", (code, ch, qid))]
        reply, topic, level, handoff = rule_guide(con, code, ch, qid, message, draft_text, stage)
    engine = "rules"
    if not handoff and topic not in ("predict", "observe"):
        llm = llm_guide(ch, qid, message, draft_text, stage, hist, reply)
        if llm:
            reply, engine = llm, "claude"
    with _lock, db() as con:
        con.execute("INSERT INTO dialog(code,ts,chapter,qid,role,text,topic,level,handoff,engine) VALUES(?,?,?,?,?,?,?,?,?,?)",
                    (code, now(), ch, qid, "student", message or "（請小波追問）", None, None, 0, None))
        con.execute("INSERT INTO dialog(code,ts,chapter,qid,role,text,topic,level,handoff,engine) VALUES(?,?,?,?,?,?,?,?,?,?)",
                    (code, now(), ch, qid, "guide", reply, topic, level, 1 if handoff else 0, engine))
    return {"reply": reply, "handoff": handoff, "topic": topic, "level": level, "engine": engine}


# ---------------- 匯出 ----------------
def ts_str(t):
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(t)) if t else ""


def export_rows(codes):
    rows = []
    with db() as con:
        for code in codes:
            for r in con.execute("SELECT qid, ts, data FROM history WHERE code=? ORDER BY id", (code,)):
                d = json.loads(r["data"])
                for k, v in d.items():
                    if k.startswith("_"):
                        continue
                    rows.append(["作答歷程", code, r["qid"].split("_")[0], r["qid"], k,
                                 json.dumps(v, ensure_ascii=False) if not isinstance(v, str) else v, ts_str(r["ts"]), VERSION])
            for r in con.execute("SELECT ts, chapter, action, detail FROM events WHERE code=? ORDER BY id", (code,)):
                rows.append(["操作紀錄", code, f"c{r['chapter']}", "", r["action"], r["detail"], ts_str(r["ts"]), VERSION])
            for r in con.execute("SELECT * FROM dialog WHERE code=? ORDER BY id", (code,)):
                tag = "（轉教師）" if r["handoff"] else ""
                rows.append(["小波對話", code, f"c{r['chapter']}", r["qid"], ("學生" if r["role"] == "student" else "小波") + tag,
                             r["text"], ts_str(r["ts"]), VERSION])
    return rows


def export_json(codes):
    out = {"教材版本": VERSION, "匯出時間": ts_str(now()), "students": []}
    with db() as con:
        for code in codes:
            s = con.execute("SELECT * FROM students WHERE code=?", (code,)).fetchone()
            out["students"].append({
                "學生代碼": code,
                "建立時間": ts_str(s["created"]) if s else "",
                "最後活動": ts_str(s["last_seen"]) if s else "",
                "位置": json.loads(s["position"] or "{}") if s else {},
                "目前作答": {r["qid"]: json.loads(r["data"]) for r in con.execute("SELECT qid, data FROM answers WHERE code=?", (code,))},
                "作答歷程": [{"題號": r["qid"], "時間": ts_str(r["ts"]), "內容": json.loads(r["data"])}
                         for r in con.execute("SELECT * FROM history WHERE code=? ORDER BY id", (code,))],
                "操作紀錄": [{"章": r["chapter"], "動作": r["action"], "細節": json.loads(r["detail"] or "{}"), "時間": ts_str(r["ts"])}
                         for r in con.execute("SELECT * FROM events WHERE code=? ORDER BY id", (code,))],
                "小波對話": [{"章": r["chapter"], "題號": r["qid"], "角色": "學生" if r["role"] == "student" else "小波",
                          "內容": r["text"], "提示主題": r["topic"], "提示層次": r["level"], "轉教師": bool(r["handoff"]),
                          "引擎": r["engine"], "時間": ts_str(r["ts"])}
                         for r in con.execute("SELECT * FROM dialog WHERE code=? ORDER BY id", (code,))],
            })
    return out


def to_csv(rows):
    buf = io.StringIO()
    buf.write("﻿")
    w = csv.writer(buf)
    w.writerow(["類型", "學生代碼", "章", "題號", "欄位／動作", "內容", "時間", "教材版本"])
    w.writerows(rows)
    return buf.getvalue().encode("utf-8")


# ---------------- HTTP ----------------
class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=STATIC, **kw)

    def log_message(self, fmt, *args):
        if "/api/" in (args[0] if args else ""):
            return
        super().log_message(fmt, *args)

    def _json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _file(self, data, ctype, name):
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Disposition", f"attachment; filename=\"record.{name.rsplit('.', 1)[-1]}\"; filename*=UTF-8''{quote(name)}")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        if n > 2_000_000:
            return {}
        try:
            return json.loads(self.rfile.read(n) or b"{}")
        except json.JSONDecodeError:
            return {}

    def end_headers(self):
        if self.path.endswith((".json", ".js", ".css", ".html")) or self.path in ("/", "/teacher"):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def do_GET(self):
        u = urlparse(self.path)
        q = {k: v[0] for k, v in parse_qs(u.query).items()}
        if u.path == "/teacher":
            self.path = "/teacher.html"
            return super().do_GET()
        if u.path == "/api/status":
            ai = bool(os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"))
            try:
                import anthropic  # noqa
            except ImportError:
                ai = False
            return self._json({"ok": True, "ai": "claude" if ai else "rules", "version": VERSION})
        if u.path == "/api/export":
            code = clean_code(q.get("code"))
            if not code:
                return self._json({"error": "缺少學生代碼"}, 400)
            if q.get("fmt") == "csv":
                return self._file(to_csv(export_rows([code])), "text/csv; charset=utf-8", f"學習紀錄_{code}.csv")
            data = json.dumps(export_json([code]), ensure_ascii=False, indent=2).encode("utf-8")
            return self._file(data, "application/json; charset=utf-8", f"學習紀錄_{code}.json")
        if u.path.startswith("/api/teacher/"):
            if q.get("pin") != TEACHER_PIN:
                return self._json({"error": "教師密碼錯誤"}, 403)
            return self.teacher(u.path, q)
        return super().do_GET()

    def teacher(self, path, q):
        with db() as con:
            codes = [r["code"] for r in con.execute("SELECT code FROM students ORDER BY last_seen DESC")]
            if path == "/api/teacher/overview":
                out = []
                for c in codes:
                    s = con.execute("SELECT * FROM students WHERE code=?", (c,)).fetchone()
                    qids = [r["qid"] for r in con.execute("SELECT qid FROM answers WHERE code=?", (c,))]
                    ho = con.execute("SELECT COUNT(*) n FROM dialog WHERE code=? AND handoff=1", (c,)).fetchone()["n"]
                    asks = con.execute("SELECT COUNT(*) n FROM dialog WHERE code=? AND role='student'", (c,)).fetchone()["n"]
                    ans = {r["qid"]: json.loads(r["data"]) for r in con.execute(
                        "SELECT qid, data FROM answers WHERE code=? AND (qid LIKE 'quiz_c%' OR qid IN ('questions','map'))", (c,))}
                    quiz = {k[-1]: {"first": v.get("first", {}).get("score"), "latest": v.get("latest", {}).get("score"),
                                    "total": v.get("first", {}).get("total")} for k, v in ans.items() if k.startswith("quiz_c")}
                    ql = ans.get("questions", {}).get("list", [])
                    nev = con.execute("SELECT COUNT(*) n FROM events WHERE code=?", (c,)).fetchone()["n"]
                    out.append({"code": c, "anon": c.startswith("匿名-"), "last_seen": ts_str(s["last_seen"]),
                                "position": json.loads(s["position"] or "{}"), "qids": qids, "handoff": ho, "asks": asks,
                                "quiz": quiz, "questions": len(ql), "answered": sum(1 for q in ql if q.get("status") == "answered"),
                                "map": ans.get("map", {}).get("stage", 0), "events": nev})
                return self._json({"students": out})
            if path == "/api/teacher/student":
                c = clean_code(q.get("code"))
                return self._json(export_json([c])["students"][0])
            if path == "/api/teacher/export":
                if q.get("fmt") == "csv":
                    return self._file(to_csv(export_rows(codes)), "text/csv; charset=utf-8", "全班學習紀錄.csv")
                data = json.dumps(export_json(codes), ensure_ascii=False, indent=2).encode("utf-8")
                return self._file(data, "application/json; charset=utf-8", "全班學習紀錄.json")
        return self._json({"error": "not found"}, 404)

    def do_POST(self):
        u = urlparse(self.path)
        b = self._body()
        code = clean_code(b.get("code"))
        if not code:
            return self._json({"error": "請先輸入學生代碼"}, 400)
        if u.path == "/api/login":
            with _lock, db() as con:
                touch(con, code)
                con.execute("INSERT INTO events(code,ts,chapter,action,detail) VALUES(?,?,?,?,?)",
                            (code, now(), 0, "登入", json.dumps({"匿名": bool(b.get("anon")), "裝置": str(b.get("ua", ""))[:120],
                                                                 "畫面": str(b.get("screen", ""))[:20]}, ensure_ascii=False)))
            return self._json(student_state(code))
        if u.path == "/api/save":
            qid = (b.get("qid") or "")[:60]
            data = b.get("data") or {}
            with _lock, db() as con:
                touch(con, code)
                row = con.execute("SELECT data FROM answers WHERE code=? AND qid=?", (code, qid)).fetchone()
                merged = json.loads(row["data"]) if row else {}
                merged.update(data)
                merged["_updated"] = ts_str(now())
                con.execute("INSERT OR REPLACE INTO answers VALUES(?,?,?,?)", (code, qid, json.dumps(merged, ensure_ascii=False), now()))
                con.execute("INSERT INTO history(code,qid,ts,data) VALUES(?,?,?,?)", (code, qid, now(), json.dumps(data, ensure_ascii=False)))
            return self._json({"ok": True, "saved": merged["_updated"]})
        if u.path == "/api/events":
            evs = b.get("events") or []
            with _lock, db() as con:
                touch(con, code, b.get("position"))
                for e in evs[:200]:
                    con.execute("INSERT INTO events(code,ts,chapter,action,detail) VALUES(?,?,?,?,?)",
                                (code, e.get("ts") or now(), int(e.get("chapter") or 0), str(e.get("action"))[:60],
                                 json.dumps(e.get("detail") or {}, ensure_ascii=False)))
            return self._json({"ok": True})
        if u.path == "/api/guide":
            return self._json(guide(b))
        return self._json({"error": "not found"}, 404)


def main():
    init_db()
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "8000"))
    srv = ThreadingHTTPServer((host, port), Handler)
    print("=" * 52)
    print(" 干涉與繞射｜互動式線上教材")
    print(f" 學生端：http://{host}:{port}/")
    print(f" 教師後台：http://{host}:{port}/teacher   教師密碼：{TEACHER_PIN}")
    try:
        import anthropic  # noqa
        has_sdk = True
    except ImportError:
        has_sdk = False
    if has_sdk and (os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN")):
        print(f" 小波追問：Claude（{MODEL}），失敗時自動改用規則式")
    else:
        print(" 小波追問：內建規則式（設定 ANTHROPIC_API_KEY 並 pip install anthropic 可改用 Claude）")
    print("=" * 52)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
