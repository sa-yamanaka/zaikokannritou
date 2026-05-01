// ======================================================
// 在庫管理 共通 JavaScript
// ======================================================

const FIELD_LABELS = {
  "": "（項目なし）",
  "code": "振り分け番号",
  "manufacturer": "メーカー名",
  "quantity": "在庫数",
  "length": "縦",
  "width": "横",
  "thickness": "厚み",
  "color": "色"
};

const DEFAULT_MAPPING = {
  "A": "code",
  "B": "manufacturer",
  "C": "quantity",
  "D": "length",
  "E": "width",
  "F": "thickness",
  "G": "color"
};

let currentMapping = {...DEFAULT_MAPPING};
let inventoryCache = [];

// ---------- トースト ----------
function toast(msg, isError=false) {
  let el = document.getElementById("toastEl");
  if (!el) {
    el = document.createElement("div");
    el.id = "toastEl";
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.toggle("error", isError);
  el.classList.add("show");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("show"), 2400);
}

// ======================================================
// PC用
// ======================================================
function initDesktop() {
  // タブ切り替え
  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(btn.dataset.tab).classList.add("active");
      if (btn.dataset.tab === "tab-list") loadList();
      if (btn.dataset.tab === "tab-export") buildColumnMapping();
    });
  });

  // 登録フォーム
  document.getElementById("registerForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd.entries());
    const r = await fetch("/api/inventory", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(body)
    });
    const data = await r.json();
    const msg = document.getElementById("registerMsg");
    if (r.ok) {
      msg.className = "msg-success";
      msg.textContent = "✅ 登録しました: " + body.code;
      e.target.reset();
    } else {
      msg.className = "msg-error";
      msg.textContent = "❌ " + (data.error || "登録に失敗しました");
    }
  });

  loadList();
  buildColumnMapping();
}

async function loadList() {
  const r = await fetch("/api/inventory");
  const data = await r.json();
  inventoryCache = data;
  renderList(data);
}

function renderList(data) {
  const tbody = document.querySelector("#inventoryTable tbody");
  tbody.innerHTML = "";
  const alertArea = document.getElementById("alertArea");
  alertArea.innerHTML = "";

  // マイナス在庫のアラート
  const negatives = data.filter(r => (r.quantity ?? 0) < 0);
  if (negatives.length > 0) {
    alertArea.innerHTML = `<div class="alert">⚠️ 在庫がマイナスの材料が <strong>${negatives.length}件</strong> あります: ${negatives.map(r => r.code).join(", ")}</div>`;
  }

  data.forEach(row => {
    const tr = document.createElement("tr");
    const qty = row.quantity ?? 0;
    const qtyClass = qty < 0 ? "qty-negative" : (qty === 0 ? "qty-zero" : "");
    tr.innerHTML = `
      <td>${escapeHtml(row.code)}</td>
      <td>${escapeHtml(row.manufacturer || "")}</td>
      <td class="${qtyClass}">${qty}</td>
      <td>${row.length ?? ""}</td>
      <td>${row.width ?? ""}</td>
      <td>${row.thickness ?? ""}</td>
      <td>${escapeHtml(row.color || "")}</td>
      <td>
        <button class="btn btn-danger" onclick="deleteItem(${row.id}, '${escapeHtml(row.code)}')">🗑 削除</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById("statsArea").textContent = `合計 ${data.length} 件 / マイナス ${negatives.length} 件`;
}

function filterList() {
  const q = document.getElementById("searchBox").value.toLowerCase();
  if (!q) return renderList(inventoryCache);
  const filtered = inventoryCache.filter(r =>
    (r.code||"").toLowerCase().includes(q) ||
    (r.manufacturer||"").toLowerCase().includes(q) ||
    (r.color||"").toLowerCase().includes(q)
  );
  renderList(filtered);
}

async function deleteItem(id, code) {
  if (!confirm(`「${code}」を削除します。よろしいですか？`)) return;
  const r = await fetch(`/api/inventory/${id}`, {method: "DELETE"});
  if (r.ok) {
    toast("削除しました");
    loadList();
  } else {
    toast("削除に失敗しました", true);
  }
}

function escapeHtml(s) {
  if (s == null) return "";
  return String(s).replace(/[&<>"']/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }[c]));
}

// ---------- Excel出力 列マッピング ----------
function buildColumnMapping() {
  const wrap = document.getElementById("columnMapping");
  wrap.innerHTML = "";
  "ABCDEFG".split("").forEach(letter => {
    const item = document.createElement("div");
    item.className = "col-map-item";
    item.innerHTML = `
      <div class="col-letter">${letter} 列</div>
      <select data-col="${letter}" onchange="updateMapping()">
        ${Object.entries(FIELD_LABELS).map(([key, label]) =>
          `<option value="${key}" ${currentMapping[letter] === key ? "selected" : ""}>${label}</option>`
        ).join("")}
      </select>
    `;
    wrap.appendChild(item);
  });
}

function updateMapping() {
  document.querySelectorAll("#columnMapping select").forEach(sel => {
    currentMapping[sel.dataset.col] = sel.value;
  });
}

function resetMapping() {
  currentMapping = {...DEFAULT_MAPPING};
  buildColumnMapping();
  document.getElementById("previewArea").innerHTML = "";
  toast("初期設定に戻しました");
}

async function showPreview() {
  updateMapping();
  const r = await fetch("/api/export", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({mapping: currentMapping, preview: true})
  });
  const data = await r.json();
  const area = document.getElementById("previewArea");
  if (!data.preview || data.preview.length <= 1) {
    area.innerHTML = "<p style='padding:16px;color:#6b7280;'>データがありません。先に在庫を登録してください。</p>";
    return;
  }
  let html = `<h3 style="margin-bottom:8px;">プレビュー（先頭50件表示 / 全${data.total}件）</h3>`;
  html += "<table><thead><tr>";
  "ABCDEFG".split("").forEach(l => html += `<th>${l}列</th>`);
  html += "</tr><tr>";
  data.preview[0].forEach(cell => html += `<th style="background:#93c5fd;color:#111;">${escapeHtml(cell||"-")}</th>`);
  html += "</tr></thead><tbody>";
  for (let i = 1; i < data.preview.length; i++) {
    html += "<tr>";
    data.preview[i].forEach(cell => html += `<td>${escapeHtml(cell)}</td>`);
    html += "</tr>";
  }
  html += "</tbody></table>";
  area.innerHTML = html;
}

async function exportExcel() {
  updateMapping();
  // 全列が空でないかチェック
  const anySet = Object.values(currentMapping).some(v => v);
  if (!anySet) {
    alert("少なくとも1つの列に項目を割り当ててください。");
    return;
  }
  const r = await fetch("/api/export", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({mapping: currentMapping, preview: false})
  });
  if (!r.ok) {
    toast("出力に失敗しました", true);
    return;
  }
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `在庫一覧_${new Date().toISOString().slice(0,10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
  toast("Excelを出力しました");
}

// ======================================================
// スマホ用
// ======================================================
let mobileSizesCache = null;
let currentItem = null;

async function initMobile() {
  // タブ切替
  document.querySelectorAll(".s-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".s-tab").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".s-content").forEach(c => c.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(btn.dataset.stab).classList.add("active");
      document.getElementById("results").innerHTML = "";
    });
  });

  // 初期データ読み込み
  const [invRes, sizesRes] = await Promise.all([
    fetch("/api/inventory").then(r => r.json()),
    fetch("/api/sizes").then(r => r.json())
  ]);

  // 振り分け番号プルダウン
  const sel = document.getElementById("codeSelect");
  invRes.sort((a,b) => a.code.localeCompare(b.code)).forEach(item => {
    const opt = document.createElement("option");
    opt.value = item.code;
    opt.textContent = `${item.code} ｜ ${item.manufacturer || ""} ｜ 在庫:${item.quantity}`;
    sel.appendChild(opt);
  });

  // サイズ候補
  mobileSizesCache = sizesRes;
  fillDatalist("mfList", sizesRes.manufacturers);
  fillDatalist("lenList", sizesRes.lengths);
  fillDatalist("wList", sizesRes.widths);
  fillDatalist("tList", sizesRes.thicknesses);
}

function fillDatalist(id, values) {
  const dl = document.getElementById(id);
  if (!dl) return;
  dl.innerHTML = "";
  values.forEach(v => {
    const opt = document.createElement("option");
    opt.value = v;
    dl.appendChild(opt);
  });
}

async function searchByCode() {
  const code = document.getElementById("codeSelect").value;
  if (!code) { toast("振り分け番号を選んでください", true); return; }
  const r = await fetch(`/api/inventory/search?code=${encodeURIComponent(code)}`);
  const data = await r.json();
  renderResults(data);
}

async function searchBySize() {
  const mf = document.getElementById("mfInput").value.trim();
  const len = document.getElementById("lenInput").value.trim();
  const w = document.getElementById("wInput").value.trim();
  const t = document.getElementById("tInput").value.trim();
  if (!mf && !len && !w && !t) { toast("最低1つは入力してください", true); return; }
  const params = new URLSearchParams();
  if (mf) params.set("manufacturer", mf);
  if (len) params.set("length", len);
  if (w) params.set("width", w);
  if (t) params.set("thickness", t);
  const r = await fetch(`/api/inventory/search?${params}`);
  const data = await r.json();
  renderResults(data);
}

function renderResults(items) {
  const area = document.getElementById("results");
  area.innerHTML = "";
  if (!items || items.length === 0) {
    area.innerHTML = `<div class="result-empty">該当する材料が見つかりませんでした。</div>`;
    return;
  }
  items.forEach(item => {
    const card = document.createElement("div");
    card.className = "result-card";
    const qty = item.quantity ?? 0;
    card.innerHTML = `
      <div class="result-title">${escapeHtml(item.code)}</div>
      <div class="result-sub">
        <span>🏭 ${escapeHtml(item.manufacturer || "(未設定)")}</span>
        <span>📐 ${item.length||"-"} × ${item.width||"-"} × ${item.thickness||"-"}</span>
        <span>🎨 ${escapeHtml(item.color || "-")}</span>
      </div>
      <div class="stock-display ${qty<0?"neg":""}" id="stock-${item.id}">
        ${qty}<span class="stock-unit">個</span>
      </div>
      <div class="adjust-grid">
        <button class="adj-btn adj-plus" onclick="adjustStock(${item.id}, 10)">+10<small>増やす</small></button>
        <button class="adj-btn adj-minus" onclick="adjustStock(${item.id}, -10)">-10<small>減らす</small></button>
        <button class="adj-btn adj-plus-s" onclick="adjustStock(${item.id}, 1)">+1<small>増やす</small></button>
        <button class="adj-btn adj-minus-s" onclick="adjustStock(${item.id}, -1)">-1<small>減らす</small></button>
      </div>
    `;
    area.appendChild(card);
  });
}

async function adjustStock(id, delta) {
  const r = await fetch(`/api/inventory/${id}/adjust`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({delta: delta, source: "スマホ"})
  });
  const data = await r.json();
  if (!r.ok) {
    toast(data.error || "更新失敗", true);
    return;
  }
  const el = document.getElementById(`stock-${id}`);
  if (el) {
    el.innerHTML = `${data.quantity}<span class="stock-unit">個</span>`;
    el.classList.toggle("neg", data.quantity < 0);
  }
  if (data.alert) {
    toast(`⚠️ 在庫がマイナスになりました (${data.quantity})`, true);
  } else {
    toast(`${delta>0?"+":""}${delta} 完了 → 在庫 ${data.quantity}`);
  }
}
