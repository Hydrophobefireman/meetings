"use strict";

const FREE = "free";
const NO = "no";

const $main = document.getElementById("main");
const $nav = document.getElementById("topNav");

const state = {
  ev: null,
  responses: [],
  me: { pid: null, name: "", marks: {} },
  dirty: false,
  saveTimer: 0,
  pollTimer: 0,
};

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

const lsKey = (id) => `meetings.${id}.me`;
const dateObj = (iso) => new Date(iso + "T00:00:00");
const fmtLong = (iso) =>
  dateObj(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

boot();

function boot() {
  const m = location.pathname.match(/^\/e\/([a-z0-9]+)/);
  if (m) loadEvent(m[1]);
  else renderHome();
}

/* ---------- home ---------- */

function renderHome() {
  document.title = "meetings";
  $nav.innerHTML = "";
  const iso = (d) => d.toISOString().slice(0, 10);
  const today = new Date();
  const start = iso(today);
  const end = iso(new Date(today.getTime() + 13 * 86400000));
  $main.innerHTML = `
  <section class="home">
    <h1>New event</h1>
    <form id="createForm" class="card form">
      <label class="field"><span>Event name</span>
        <input name="title" maxlength="80" required autocomplete="off"></label>
      <div class="fieldrow">
        <label class="field"><span>First day</span>
          <input type="date" name="start" value="${start}" required></label>
        <label class="field"><span>Last day</span>
          <input type="date" name="end" value="${end}" required></label>
      </div>
      <p class="formerr" id="formErr" hidden></p>
      <button class="btn" type="submit">Create event</button>
    </form>
  </section>`;

  document.getElementById("createForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const title = f.title.value.trim();
    const days = rangeDays(f.start.value, f.end.value);
    const err = document.getElementById("formErr");
    if (!title) {
      err.textContent = "Event name required";
      err.hidden = false;
      return;
    }
    if (!days) {
      err.textContent = "Invalid range. Max 93 days.";
      err.hidden = false;
      return;
    }
    const res = await fetch("/api/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, days }),
    });
    if (!res.ok) {
      err.textContent = "Could not create event";
      err.hidden = false;
      return;
    }
    const data = await res.json();
    location.href = `/e/${data.id}`;
  });
}

function rangeDays(a, b) {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(a || "") || !re.test(b || "")) return null;
  const t1 = Date.parse(a + "T00:00:00Z");
  const t2 = Date.parse(b + "T00:00:00Z");
  if (!Number.isFinite(t1) || !Number.isFinite(t2) || t2 < t1) return null;
  const out = [];
  for (let t = t1; t <= t2 && out.length <= 93; t += 86400000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out.length ? out : null;
}

function renderNotFound() {
  document.title = "meetings";
  $nav.innerHTML = "";
  $main.innerHTML = `
  <section class="home">
    <h1>Event not found</h1>
    <p><a class="btn" href="/">New event</a></p>
  </section>`;
}

/* ---------- event ---------- */

async function loadEvent(id) {
  let data;
  try {
    const res = await fetch(`/api/events/${id}`);
    if (!res.ok) throw new Error();
    data = await res.json();
  } catch {
    return renderNotFound();
  }
  state.ev = data;
  state.responses = data.responses;

  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(lsKey(id)) || "null");
  } catch {}

  state.me = { pid: (saved && saved.pid) || null, name: (saved && saved.name) || "", marks: {} };
  const mine =
    saved && saved.pid
      ? data.responses.find((r) => r.pid === saved.pid)
      : null;
  if (mine) state.me.marks = Object.assign({}, mine.marks);

  renderEvent();
  startPolling();
}

function renderEvent() {
  const ev = state.ev;
  document.title = ev.title + " — meetings";
  $nav.innerHTML = `
    <button class="linkbtn" id="copyLink">Copy link</button>
    <a class="toplink" href="/">New event</a>`;

  const rangeText =
    fmtLong(ev.days[0]) + " – " + fmtLong(ev.days[ev.days.length - 1]);

  $main.innerHTML = `
  <section class="event">
    <header class="evhead">
      <h1>${esc(ev.title)}</h1>
      <div class="evrange">${rangeText} · ${ev.days.length} days</div>
    </header>
    <section class="card youbar">
      <label class="field grow"><span>Your name</span>
        <input id="nameInput" maxlength="40" autocomplete="off" value="${esc(state.me.name)}"></label>
      <div class="legend">
        <span class="lg"><i class="sw free"></i>Free</span>
        <span class="lg"><i class="sw no"></i>Hard no</span>
      </div>
      <span class="status" id="saveStatus"></span>
    </section>
    <div class="layout">
      <div class="gridwrap">
        <table class="grid" id="grid">
          <thead></thead><tbody></tbody><tfoot></tfoot>
        </table>
      </div>
      <aside class="side card">
        <h2 class="sidetitle">Best days</h2>
        <ol class="bestdays" id="bestDays"></ol>
      </aside>
    </div>
  </section>`;

  buildHead();
  buildRows();

  document.getElementById("nameInput").addEventListener("input", (e) => {
    state.me.name = e.target.value;
    scheduleSave();
  });

  document.getElementById("copyLink").addEventListener("click", async () => {
    const btn = document.getElementById("copyLink");
    try {
      await navigator.clipboard.writeText(location.href);
      flash(btn, "Copied");
    } catch {
      flash(btn, location.href);
    }
  });

  bindGridEvents();
  setStatus(state.me.name.trim() ? "" : "Add your name to save");
}

function flash(el, text) {
  const prev = el.textContent;
  el.textContent = text;
  setTimeout(() => (el.textContent = prev), 1200);
}

/* grid */

const WD = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

function isMineRow(td) {
  return td.closest("tr").classList.contains("mine");
}

function nextState(s) {
  return s === FREE ? NO : s === NO ? "" : FREE;
}

function buildHead() {
  const thead = document.querySelector("#grid thead");
  let html = '<tr><th class="namecol">Name</th>';
  for (const d of state.ev.days) {
    const dt = dateObj(d);
    const we = dt.getDay() === 0 || dt.getDay() === 6 ? " we" : "";
    html += `<th class="date${we}"><small>${WD[dt.getDay()]}</small><b>${dt.getDate()}</b></th>`;
  }
  thead.innerHTML = html + "</tr>";
}

function cellHtml(date, mark) {
  return `<td class="cell" data-date="${date}" data-state="${mark || ""}" title="${fmtLong(date)}"></td>`;
}

function buildRows() {
  const tbody = document.querySelector("#grid tbody");
  const mineRec =
    state.me.pid && state.responses.find((r) => r.pid === state.me.pid);

  const others = state.responses.filter(
    (r) => !state.me.pid || r.pid !== state.me.pid,
  );
  const rows = [];
  if (mineRec || state.me.pid) rows.push({ mine: true, rec: mineRec });
  for (const r of others) rows.push({ mine: false, rec: r });

  if (!rows.length) {
    tbody.innerHTML = `<tr class="emptyrow"><td colspan="${state.ev.days.length + 1}">No responses yet</td></tr>`;
  } else {
    let html = "";
    for (const row of rows) {
      const name = row.mine
        ? state.me.name.trim() || "(you)"
        : row.rec.name;
      html += `<tr${row.mine ? ' class="mine"' : ""}><td class="namecol">${esc(name)}</td>`;
      const marks = row.mine ? state.me.marks : row.rec.marks;
      for (const d of state.ev.days) html += cellHtml(d, marks[d]);
      html += "</tr>";
    }
    tbody.innerHTML = html;
  }

  buildTotals();
  buildBest();
}

function counts() {
  const n = state.ev.days.length;
  const free = new Array(n).fill(0);
  const no = new Array(n).fill(0);
  const sources = state.responses
    .filter((r) => !state.me.pid || r.pid !== state.me.pid)
    .map((r) => r.marks);
  sources.push(state.me.marks);
  for (const marks of sources) {
    for (let i = 0; i < n; i++) {
      const v = marks[state.ev.days[i]];
      if (v === FREE) free[i]++;
      else if (v === NO) no[i]++;
    }
  }
  return { free, no };
}

function buildTotals() {
  const tfoot = document.querySelector("#grid tfoot");
  const { free, no } = counts();
  let html = '<tr><td class="namecol" style="color:var(--mut);font-size:11px;text-transform:uppercase;letter-spacing:.06em">Free / no</td>';
  for (let i = 0; i < state.ev.days.length; i++) {
    const f = free[i];
    const nn = no[i];
    const total = Math.max(f + nn, 1);
    html += `<td class="tot" title="${f} free · ${nn} hard no"><div class="totbar">
      ${nn ? `<div class="seg-n" style="flex-grow:${nn}"></div>` : ""}
      ${f ? `<div class="seg-f" style="flex-grow:${f}"></div>` : ""}
    </div></td>`;
  }
  tfoot.innerHTML = html + "</tr>";
}

function buildBest() {
  const ol = document.getElementById("bestDays");
  const { free, no } = counts();
  const ranked = state.ev.days
    .map((d, i) => ({ d, f: free[i], n: no[i] }))
    .filter((x) => x.f > 0)
    .sort((a, b) => b.f - a.f || a.n - b.n || a.d.localeCompare(b.d))
    .slice(0, 8);

  if (!ranked.length) {
    ol.innerHTML = '<li class="none" style="border:0;display:block">No availability marked yet.</li>';
    return;
  }
  ol.innerHTML = ranked
    .map(
      (x) =>
        `<li><span class="bd-date">${fmtLong(x.d)}</span><span class="bd-n">${x.f} free${x.n ? " · " + x.n + " no" : ""}</span></li>`,
    )
    .join("");
}

/* editing */

function bindGridEvents() {
  const grid = document.getElementById("grid");
  let paint = null;

  grid.addEventListener("pointerdown", (e) => {
    const td = e.target.closest("td.cell");
    if (!td || !isMineRow(td)) return;
    if (e.pointerType === "touch") return; // taps handled by click
    paint = { s: nextState(td.dataset.state) };
    applyMine(td, paint.s);
  });

  grid.addEventListener("pointerover", (e) => {
    if (!paint || !(e.buttons & 1)) return;
    const td = e.target.closest("td.cell");
    if (!td || !isMineRow(td)) return;
    applyMine(td, paint.s);
  });

  window.addEventListener("pointerup", () => {
    if (paint) setTimeout(() => (paint = null), 0);
  });

  grid.addEventListener("click", (e) => {
    if (paint) return;
    const td = e.target.closest("td.cell");
    if (!td || !isMineRow(td)) return;
    applyMine(td, nextState(td.dataset.state));
  });
}

function applyMine(td, s) {
  const date = td.dataset.date;
  if (s) state.me.marks[date] = s;
  else delete state.me.marks[date];
  td.dataset.state = s;
  scheduleSave();
  buildTotals();
  buildBest();
}

function setStatus(t) {
  document.getElementById("saveStatus").textContent = t;
}

function scheduleSave() {
  state.dirty = true;
  setStatus(state.me.name.trim() ? "Unsaved" : "Add your name to save");
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(doSave, 600);
}

async function doSave() {
  const name = state.me.name.trim();
  if (!name) return;
  setStatus("Saving…");
  try {
    const res = await fetch(`/api/events/${state.ev.id}/me`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        pid: state.me.pid,
        name,
        marks: state.me.marks,
      }),
    });
    if (!res.ok) throw new Error();
    const data = await res.json();
    state.me.pid = data.pid;
    localStorage.setItem(
      lsKey(state.ev.id),
      JSON.stringify({ pid: data.pid, name }),
    );
    state.dirty = false;
    setStatus(
      "Saved " +
        new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
    );
  } catch {
    setStatus("Save failed");
  }
}

/* polling */

function startPolling() {
  clearInterval(state.pollTimer);
  state.pollTimer = setInterval(async () => {
    if (document.hidden || state.dirty) return;
    try {
      const res = await fetch(`/api/events/${state.ev.id}`);
      if (!res.ok) return;
      const data = await res.json();
      if (
        JSON.stringify(data.responses.filter((r) => r.pid !== state.me.pid)) !==
        JSON.stringify(
          state.responses.filter((r) => r.pid !== state.me.pid),
        )
      ) {
        state.responses = data.responses;
        buildRows();
      }
    } catch {}
  }, 10000);
}
