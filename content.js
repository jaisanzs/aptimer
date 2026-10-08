(() => {
  if (window.__apPaceTimer) return;
  window.__apPaceTimer = true;

  const IS_TOP = window === window.top;
  const FID = Math.random().toString(36).slice(2);

  // ------------------------------------------------------------------
  // Detection. Runs in every frame (AP Classroom renders questions with
  // Learnosity, which may or may not sit inside an iframe).
  // ------------------------------------------------------------------
  const STEM_SELECTORS = [
    ".lrn_stimulus_content", ".lrn-stimulus", ".lrn_stimulus",
    '[class*="question-stem"]', '[class*="questionStem"]',
    '[class*="question-text"]', '[class*="questionText"]',
    '[class*="stimulus"]', ".lrn_question"
  ];
  const MCQ_SELECTORS = [".lrn_mcq", ".lrn-mcq", '[class*="lrn_mcq"]', '[role="radiogroup"]'];
  const FRQ_SELECTORS = [
    ".lrn_longtextV2", ".lrn_longtext", '[class*="longtext"]', '[class*="plaintext"]',
    '[class*="fileupload"]', '[class*="file-upload"]', "textarea", '[contenteditable="true"]'
  ];
  const COUNTER_RE = /Question\s+(\d+)\s*(?:of|\/)\s*(\d+)/i;

  function visible(el) {
    if (!el || !el.getClientRects().length) return false;
    return getComputedStyle(el).visibility !== "hidden";
  }
  function bigEnough(el, w, h) {
    const r = el.getBoundingClientRect();
    return r.width >= w && r.height >= h;
  }

  function detectType() {
    const radios = [...document.querySelectorAll('input[type="radio"], [role="radio"]')]
      .filter((r) => visible(r) || visible(r.parentElement));
    if (radios.length >= 2) return "mcq";
    if (MCQ_SELECTORS.some((s) => [...document.querySelectorAll(s)].some(visible))) return "mcq";
    for (const s of FRQ_SELECTORS) {
      for (const el of document.querySelectorAll(s)) {
        if (visible(el) && bigEnough(el, 200, 40)) return "frq";
      }
    }
    return null;
  }

  function firstVisibleText(selectors, min = 10) {
    for (const s of selectors) {
      for (const el of document.querySelectorAll(s)) {
        if (!visible(el)) continue;
        const t = (el.innerText || "").trim();
        if (t.length >= min) return t.slice(0, 300);
      }
    }
    return "";
  }
  // Stem + answer choices, so questions sharing one passage still get different keys.
  function detectStem() {
    return firstVisibleText(STEM_SELECTORS) + "|" + firstVisibleText(MCQ_SELECTORS, 1);
  }

  function hash(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }

  let topHandler = null;
  let lastSig = "";
  let lastBodyText = "";

  function scanAndReport(heartbeat = false) {
    if (!document.body) return;
    lastBodyText = document.body.innerText || "";
    const type = detectType();
    const m = lastBodyText.match(COUNTER_RE);
    const report = {
      type,
      counter: m ? `${m[1]}/${m[2]}` : null,
      stem: type ? hash(detectStem()) : ""
    };
    const sig = `${report.type}|${report.counter}|${report.stem}`;
    const changed = sig !== lastSig;
    if (!changed && !heartbeat) return;
    lastSig = sig;
    const msg = { __apPaceTimer: 1, fid: FID, report, changed };
    if (IS_TOP) topHandler && topHandler(msg);
    else {
      try { window.top.postMessage(msg, "*"); } catch (_) {}
    }
  }

  // ------------------------------------------------------------------
  // Timer + UI. Top frame only.
  // ------------------------------------------------------------------
  function initTop() {
    const clone = (o) => JSON.parse(JSON.stringify(o));
    const D = globalThis.APT_DEFAULTS;
    let settings = clone(D);
    let ui = { x: null, y: null, minimized: false, listOpen: false };
    let paused = false;
    let current = null;
    let idleSince = null;
    let flashUntil = 0;
    let detectedSubjectId = null;
    let subjectOverride = "auto";
    try { subjectOverride = sessionStorage.getItem("aptimer:subject") || "auto"; } catch (_) {}
    const reports = new Map();

    // Session = this tab. Question times survive reloads, cleared with "New session".
    const SKEY = "aptimer:session";
    const freshSession = () => ({ questions: {}, n: 0 });
    let session;
    try { session = JSON.parse(sessionStorage.getItem(SKEY)) || freshSession(); } catch (_) { session = freshSession(); }
    function saveSession() {
      try { sessionStorage.setItem(SKEY, JSON.stringify(session)); } catch (_) {}
    }

    // ---------- settings ----------
    chrome.storage.sync.get(null, (data) => {
      settings = Object.assign(clone(D), data || {});
      rebuildSubjectOptions();
      render();
    });
    chrome.storage.local.get("ui", (d) => {
      if (d && d.ui) ui = Object.assign(ui, d.ui);
      applyPosition();
      render();
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "sync") return;
      for (const k in changes) {
        settings[k] = changes[k].newValue !== undefined ? changes[k].newValue : clone(D)[k];
      }
      rebuildSubjectOptions();
      render();
    });
    const saveUI = () => chrome.storage.local.set({ ui });

    function subject() {
      const id = subjectOverride !== "auto" ? subjectOverride : (detectedSubjectId || settings.defaultSubjectId);
      return settings.subjects.find((s) => s.id === id)
        || settings.subjects.find((s) => s.id === settings.defaultSubjectId)
        || settings.subjects[0];
    }
    function detectSubject() {
      const text = (document.title + " " + lastBodyText.slice(0, 6000)).toLowerCase();
      let best = null, len = 0;
      for (const s of settings.subjects) {
        for (const kw of s.match || []) {
          const k = String(kw).trim().toLowerCase();
          if (k && k.length > len && text.includes(k)) { best = s.id; len = k.length; }
        }
      }
      return best;
    }
    const typeOf = (q) => q.override || q.detected || "mcq";
    const targetMs = (q) => (subject()[typeOf(q)] || 60) * 1000;

    // ---------- merging reports from all frames ----------
    topHandler = (msg) => {
      const prev = reports.get(msg.fid);
      const now = Date.now();
      reports.set(msg.fid, {
        report: msg.report,
        changedAt: msg.changed || !prev ? now : prev.changedAt,
        seenAt: now
      });
      evaluate();
    };
    window.addEventListener("message", (e) => {
      const d = e.data;
      if (d && d.__apPaceTimer === 1 && d.fid && d.report) topHandler(d);
    });

    function evaluate() {
      detectedSubjectId = detectSubject();
      const now = Date.now();
      let best = null, counter = null;
      for (const [fid, r] of reports) {
        if (now - r.seenAt > 5000) { reports.delete(fid); continue; }
        if (r.report.counter && !counter) counter = r.report.counter;
        if (r.report.type && (!best || r.changedAt > best.changedAt)) best = r;
      }
      if (!best) return goIdle();
      idleSince = null;
      const key = location.pathname + "#" + (counter ? "n" + counter : "h" + best.report.stem);
      let q = session.questions[key];
      if (!q) {
        q = session.questions[key] = {
          elapsed: 0,
          detected: best.report.type,
          label: counter ? counter.split("/")[0] : String(session.n + 1),
          seq: ++session.n
        };
      }
      q.detected = best.report.type;
      if (key !== current) {
        current = key;
        paused = false; // auto-start on every new question
        saveSession();
      }
      render();
    }

    function goIdle() {
      if (current === null) return;
      if (!idleSince) idleSince = Date.now();
      if (Date.now() - idleSince > 1500) {
        current = null;
        saveSession();
        render();
      }
    }

    // ---------- clock ----------
    let lastTick = performance.now();
    let sinceSave = 0;
    setInterval(() => {
      const now = performance.now();
      const dt = now - lastTick;
      lastTick = now;
      if (current && !paused && !(settings.pauseWhenHidden && document.hidden)) {
        const q = session.questions[current];
        if (q) {
          const before = q.elapsed;
          q.elapsed += dt;
          const t = targetMs(q);
          if (before < t && q.elapsed >= t) {
            flashUntil = Date.now() + 1500;
            if (settings.chime) chime();
          }
          sinceSave += dt;
          if (sinceSave > 3000) { sinceSave = 0; saveSession(); }
        }
      }
      if (idleSince) goIdle();
      render();
    }, 200);

    // Time banked (+) or owed (-). Questions you only flipped past (<15s) don't count,
    // otherwise previewing a whole set would fake a huge cushion.
    function balanceMs() {
      let b = 0;
      for (const [k, q] of Object.entries(session.questions)) {
        const t = targetMs(q);
        if (k === current) b += Math.min(0, t - q.elapsed);
        else if (q.elapsed >= 15000) b += t - q.elapsed;
      }
      return b;
    }

    let audioCtx = null;
    function chime() {
      try {
        audioCtx = audioCtx || new AudioContext();
        const t0 = audioCtx.currentTime;
        [0, 0.18].forEach((off) => {
          const o = audioCtx.createOscillator();
          const g = audioCtx.createGain();
          o.frequency.value = 880;
          g.gain.setValueAtTime(0.0001, t0 + off);
          g.gain.exponentialRampToValueAtTime(0.15, t0 + off + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + off + 0.15);
          o.connect(g).connect(audioCtx.destination);
          o.start(t0 + off);
          o.stop(t0 + off + 0.16);
        });
      } catch (_) {}
    }

    // ---------- actions ----------
    function act(cmd) {
      const q = current ? session.questions[current] : null;
      switch (cmd) {
        case "toggle-pause": paused = !paused; break;
        case "reset-question": if (q) q.elapsed = 0; break;
        case "toggle-type":
          if (q) {
            const next = typeOf(q) === "mcq" ? "frq" : "mcq";
            q.override = next === q.detected ? undefined : next;
          }
          break;
        case "toggle-minimize": ui.minimized = !ui.minimized; saveUI(); break;
        case "toggle-list": ui.listOpen = !ui.listOpen; saveUI(); break;
        case "new-session":
          session = freshSession();
          current = null;
          reports.forEach((r) => (r.changedAt = Date.now()));
          evaluate();
          break;
        case "plus": case "minus": {
          if (!q) break;
          const s = subject();
          const type = typeOf(q);
          const subjects = clone(settings.subjects);
          const target = subjects.find((x) => x.id === s.id);
          target[type] = Math.max(15, target[type] + (cmd === "plus" ? 15 : -15));
          settings.subjects = subjects;
          chrome.storage.sync.set({ subjects });
          break;
        }
        case "options": chrome.runtime.sendMessage({ openOptions: true }); break;
      }
      saveSession();
      render();
    }
    chrome.runtime.onMessage.addListener((m) => {
      if (m && m.apPaceTimer) act(m.apPaceTimer);
    });

    // ---------- UI ----------
    const host = document.createElement("div");
    host.id = "ap-pace-timer-host";
    host.style.cssText = "all:initial;position:fixed;z-index:2147483647;right:16px;bottom:16px;";
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        .panel{font:13px/1.3 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#e8eaed;background:#1f2329;
          border:1px solid #3a3f47;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.35);width:236px;overflow:hidden;user-select:none}
        .hdr{display:flex;align-items:center;gap:4px;padding:6px 6px 6px 10px;background:#171a1f;cursor:move;touch-action:none}
        .title{font-weight:600;font-size:12px;color:#9aa4b2;flex:1;white-space:nowrap}
        .minitime{display:none;font:600 14px ui-monospace,Menlo,Consolas,monospace;flex:1}
        select{font:inherit;font-size:11px;background:#2a2f37;color:#e8eaed;border:1px solid #3a3f47;border-radius:6px;max-width:112px;padding:2px}
        .ib{all:unset;cursor:pointer;color:#9aa4b2;padding:2px 6px;border-radius:5px;font-size:13px}
        .ib:hover{background:#2a2f37;color:#fff}
        .body{padding:8px 10px 10px}
        .row{display:flex;align-items:center;justify-content:space-between}
        .time{font:600 34px/1.1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-variant-numeric:tabular-nums}
        .pill{all:unset;cursor:pointer;font-size:11px;font-weight:700;padding:3px 9px;border-radius:999px;background:#2a2f37;color:#cfd6df}
        .pill:hover{background:#353b45}
        .bar{height:5px;background:#2a2f37;border-radius:3px;margin:6px 0;overflow:hidden}
        .fill{height:100%;width:0;background:#34c759;transition:width .2s linear}
        .meta{font-size:11px;color:#9aa4b2;min-height:14px}
        .ctrls{display:flex;gap:4px;margin-top:8px}
        .btn{all:unset;cursor:pointer;flex:1;text-align:center;font-size:12px;padding:4px 0;border-radius:6px;background:#2a2f37;color:#e8eaed}
        .btn:hover{background:#353b45}
        .list{display:none;max-height:170px;overflow:auto;margin-top:8px;border-top:1px solid #3a3f47;padding-top:6px;font-size:11px}
        .list.open{display:block}
        .li{display:flex;justify-content:space-between;padding:2px 0;font-variant-numeric:tabular-nums}
        .li.cur{color:#fff;font-weight:600}
        .good{color:#34c759}.bad{color:#ff5a5f}
        .link{all:unset;cursor:pointer;color:#8ab4f8;font-size:11px;display:block;margin-top:6px}
        .panel[data-state=ok] .time,.panel[data-state=ok] .minitime{color:#34c759}
        .panel[data-state=warn] .time,.panel[data-state=warn] .minitime{color:#ffb020}
        .panel[data-state=warn] .fill{background:#ffb020}
        .panel[data-state=over] .time,.panel[data-state=over] .minitime{color:#ff5a5f}
        .panel[data-state=over] .fill{background:#ff5a5f}
        .panel[data-state=idle] .time,.panel[data-state=idle] .minitime{color:#6b7480}
        .panel.paused .time,.panel.paused .minitime{opacity:.45}
        .panel.mini{width:auto;min-width:150px}
        .panel.mini .body,.panel.mini .title,.panel.mini select{display:none}
        .panel.mini .minitime{display:block}
        .panel.flash{animation:flash .5s 3}
        @keyframes flash{50%{border-color:#ff5a5f;box-shadow:0 0 0 3px rgba(255,90,95,.5)}}
      </style>
      <div class="panel" data-state="idle">
        <div class="hdr">
          <span class="title">AP Pace</span><span class="minitime">--:--</span>
          <select class="subject" title="Subject"></select>
          <button class="ib" data-a="options" title="Settings">⚙</button>
          <button class="ib" data-a="toggle-minimize" title="Minimize (Alt+Shift+M)">–</button>
        </div>
        <div class="body">
          <div class="row">
            <span class="time">--:--</span>
            <button class="pill" data-a="toggle-type" title="Switch MCQ/FRQ (Alt+Shift+T)">—</button>
          </div>
          <div class="bar"><div class="fill"></div></div>
          <div class="meta">Waiting for a question…</div>
          <div class="ctrls">
            <button class="btn pause" data-a="toggle-pause" title="Pause (Alt+Shift+P)">❚❚</button>
            <button class="btn" data-a="reset-question" title="Reset this question (Alt+Shift+R)">↺</button>
            <button class="btn" data-a="minus" title="Goal −15s for this subject/type">−15s</button>
            <button class="btn" data-a="plus" title="Goal +15s for this subject/type">+15s</button>
            <button class="btn" data-a="toggle-list" title="Per-question times">☰</button>
          </div>
          <div class="list"></div>
        </div>
      </div>`;
    const $ = (s) => root.querySelector(s);
    const els = {
      panel: $(".panel"), hdr: $(".hdr"), time: $(".time"), mini: $(".minitime"), pill: $(".pill"),
      fill: $(".fill"), meta: $(".meta"), pause: $(".pause"), list: $(".list"), subject: $(".subject")
    };
    (document.body || document.documentElement).appendChild(host);
    // SPAs sometimes wipe the body; re-attach if that happens.
    setInterval(() => { if (!host.isConnected) (document.body || document.documentElement).appendChild(host); }, 2000);

    root.addEventListener("click", (e) => {
      const b = e.target.closest("[data-a]");
      if (b) act(b.dataset.a);
    });
    els.subject.addEventListener("change", () => {
      subjectOverride = els.subject.value;
      try { sessionStorage.setItem("aptimer:subject", subjectOverride); } catch (_) {}
      render();
    });

    function rebuildSubjectOptions() {
      els.subject.innerHTML = "";
      const auto = document.createElement("option");
      auto.value = "auto";
      auto.textContent = "Auto";
      els.subject.appendChild(auto);
      for (const s of settings.subjects) {
        const o = document.createElement("option");
        o.value = s.id;
        o.textContent = s.name;
        els.subject.appendChild(o);
      }
      if (subjectOverride !== "auto" && !settings.subjects.some((s) => s.id === subjectOverride)) subjectOverride = "auto";
      els.subject.value = subjectOverride;
    }
    rebuildSubjectOptions();

    // dragging
    let drag = null;
    els.hdr.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button,select")) return;
      const r = host.getBoundingClientRect();
      drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
      els.hdr.setPointerCapture(e.pointerId);
    });
    els.hdr.addEventListener("pointermove", (e) => {
      if (!drag) return;
      ui.x = e.clientX - drag.dx;
      ui.y = e.clientY - drag.dy;
      applyPosition();
    });
    els.hdr.addEventListener("pointerup", () => {
      if (drag) { drag = null; saveUI(); }
    });
    window.addEventListener("resize", applyPosition);
    function applyPosition() {
      if (ui.x == null) return;
      const r = host.getBoundingClientRect();
      ui.x = Math.max(0, Math.min(ui.x, window.innerWidth - r.width));
      ui.y = Math.max(0, Math.min(ui.y, window.innerHeight - r.height));
      host.style.left = ui.x + "px";
      host.style.top = ui.y + "px";
      host.style.right = "auto";
      host.style.bottom = "auto";
    }

    function fmt(ms, ceil) {
      const s = ceil ? Math.ceil(Math.abs(ms) / 1000) : Math.floor(Math.abs(ms) / 1000);
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    }

    let lastListRender = 0;
    function render() {
      const q = current ? session.questions[current] : null;
      els.panel.classList.toggle("mini", !!ui.minimized);
      els.panel.classList.toggle("paused", paused && !!q);
      els.panel.classList.toggle("flash", Date.now() < flashUntil);
      els.pause.textContent = paused ? "▶" : "❚❚";
      els.list.classList.toggle("open", !!ui.listOpen);
      if (els.subject.value !== subjectOverride) els.subject.value = subjectOverride;

      if (!q) {
        els.panel.dataset.state = "idle";
        els.time.textContent = els.mini.textContent = "--:--";
        els.pill.textContent = "—";
        els.fill.style.width = "0%";
        els.meta.textContent = `${subject().name} · waiting for a question…`;
      } else {
        const type = typeOf(q);
        const t = targetMs(q);
        const rem = t - q.elapsed;
        const txt = rem > 0 ? fmt(rem, true) : "+" + fmt(-rem);
        els.time.textContent = txt;
        els.mini.textContent = `${txt} · ${type.toUpperCase()}`;
        els.panel.dataset.state = rem <= 0 ? "over" : rem <= t * (settings.warnAt || 0.25) ? "warn" : "ok";
        els.pill.textContent = type.toUpperCase() + (q.override ? " ✎" : "");
        els.fill.style.width = Math.min(100, (q.elapsed / t) * 100) + "%";
        const b = balanceMs();
        const pace = Math.abs(b) < 1000 ? "on pace" : b > 0 ? `banked ${fmt(b)}` : `behind ${fmt(b)}`;
        els.meta.textContent = `Q${q.label} · goal ${fmt(t)} · ${pace}`;
      }

      if (ui.listOpen && Date.now() - lastListRender > 1000) {
        lastListRender = Date.now();
        const rows = Object.entries(session.questions).sort((a, b) => a[1].seq - b[1].seq);
        els.list.innerHTML = rows.length ? "" : "<div class='li'>No questions yet</div>";
        for (const [k, item] of rows) {
          const t = targetMs(item);
          const div = document.createElement("div");
          div.className = "li" + (k === current ? " cur" : "");
          const left = document.createElement("span");
          left.textContent = `Q${item.label} ${typeOf(item).toUpperCase()}`;
          const right = document.createElement("span");
          right.className = item.elapsed > t ? "bad" : "good";
          right.textContent = `${fmt(item.elapsed)} / ${fmt(t)}`;
          div.append(left, right);
          els.list.appendChild(div);
        }
        const reset = document.createElement("button");
        reset.className = "link";
        reset.dataset.a = "new-session";
        reset.textContent = "New session (clear times)";
        els.list.appendChild(reset);
      }
    }
    render();
  }

  // ------------------------------------------------------------------
  if (IS_TOP) initTop();

  let pending = false;
  const mo = new MutationObserver(() => {
    if (pending) return;
    pending = true;
    setTimeout(() => { pending = false; scanAndReport(); }, 300);
  });
  (function start() {
    if (!document.body) return setTimeout(start, 200);
    mo.observe(document.body, {
      subtree: true, childList: true, characterData: true,
      attributes: true, attributeFilter: ["class", "style", "hidden", "aria-hidden"]
    });
    scanAndReport(true);
  })();
  setInterval(() => scanAndReport(true), 2000);
})();
