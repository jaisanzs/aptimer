const D = globalThis.APT_DEFAULTS;
const clone = (o) => JSON.parse(JSON.stringify(o));
const $ = (s) => document.querySelector(s);
let state = clone(D);

function fmt(sec) {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}
function parse(str) {
  str = String(str).trim();
  if (!str) return NaN;
  if (str.includes(":")) {
    const [m, s] = str.split(":");
    if (!/^\d+$/.test(m) || !/^\d{1,2}$/.test(s)) return NaN;
    return Number(m) * 60 + Number(s);
  }
  const n = parseFloat(str);
  return isNaN(n) ? NaN : Math.round(n * 60);
}

function row(s) {
  const tr = document.createElement("tr");
  tr.dataset.id = s.id;
  tr.innerHTML = `
    <td><input type="text" class="name"></td>
    <td><input type="text" class="match"></td>
    <td><input type="text" class="time mcq"></td>
    <td><input type="text" class="time frq"></td>
    <td><button class="del" title="Remove">✕</button></td>`;
  tr.querySelector(".name").value = s.name;
  tr.querySelector(".match").value = (s.match || []).join(", ");
  tr.querySelector(".mcq").value = fmt(s.mcq);
  tr.querySelector(".frq").value = fmt(s.frq);
  tr.querySelector(".del").onclick = () => {
    if ($("#rows").children.length <= 1) return;
    tr.remove();
    refreshDefault();
  };
  return tr;
}

function refreshDefault() {
  const sel = $("#def");
  const cur = sel.value || state.defaultSubjectId;
  sel.innerHTML = "";
  for (const tr of $("#rows").children) {
    const o = document.createElement("option");
    o.value = tr.dataset.id;
    o.textContent = tr.querySelector(".name").value || "(unnamed)";
    sel.appendChild(o);
  }
  sel.value = [...sel.options].some((o) => o.value === cur) ? cur : sel.options[0]?.value;
}

function render() {
  const tbody = $("#rows");
  tbody.innerHTML = "";
  state.subjects.forEach((s) => tbody.appendChild(row(s)));
  tbody.oninput = (e) => { if (e.target.classList.contains("name")) refreshDefault(); };
  refreshDefault();
  $("#def").value = state.defaultSubjectId;
  $("#chime").checked = !!state.chime;
  $("#hidden").checked = !!state.pauseWhenHidden;
  $("#warn").value = Math.round((state.warnAt ?? 0.25) * 100);
}

function status(text, ok = true) {
  const el = $("#status");
  el.className = ok ? "msg" : "err";
  el.textContent = text;
  if (ok) setTimeout(() => (el.textContent = ""), 2000);
}

$("#add").onclick = () => {
  const s = { id: "s" + Date.now().toString(36), name: "New subject", match: [], mcq: 90, frq: 900 };
  $("#rows").appendChild(row(s));
  refreshDefault();
};

$("#save").onclick = () => {
  const subjects = [];
  for (const tr of $("#rows").children) {
    const name = tr.querySelector(".name").value.trim();
    const mcq = parse(tr.querySelector(".mcq").value);
    const frq = parse(tr.querySelector(".frq").value);
    if (!name) return status("Every subject needs a name.", false);
    if (!(mcq >= 5) || !(frq >= 5)) return status(`Check the times for "${name}" (use m:ss).`, false);
    subjects.push({
      id: tr.dataset.id,
      name,
      match: tr.querySelector(".match").value.split(",").map((x) => x.trim()).filter(Boolean),
      mcq,
      frq
    });
  }
  const warn = Number($("#warn").value);
  if (!(warn >= 0 && warn <= 90)) return status("Amber threshold must be 0 to 90.", false);
  state = {
    subjects,
    defaultSubjectId: $("#def").value,
    chime: $("#chime").checked,
    pauseWhenHidden: $("#hidden").checked,
    warnAt: warn / 100
  };
  chrome.storage.sync.set(state, () => {
    if (chrome.runtime.lastError) status(chrome.runtime.lastError.message, false);
    else { status("Saved"); render(); }
  });
};

$("#reset").onclick = () => {
  if (!confirm("Restore default subjects and times?")) return;
  state = clone(D);
  chrome.storage.sync.set(state, () => { render(); status("Defaults restored"); });
};

chrome.storage.sync.get(null, (data) => {
  state = Object.assign(clone(D), data || {});
  render();
});
