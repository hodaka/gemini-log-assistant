// Geminiページに会話ダウンロードボタンを注入するコンテンツスクリプト

const BUTTON_ID      = 'gemini-logger-btn';
const ZIP_BUTTON_ID  = 'gemini-logger-zip-btn';
const SEARCH_BTN_ID  = 'gemini-logger-search-btn';
const PANEL_ID       = 'gemini-logger-panel';
const VERSION        = 'v2.4';

// ── Shift-JISエンコーダ ───────────────────────────────────────────────────
// TextDecoder('shift-jis')を逆引きして変換マップを構築する。
// 外部テーブル不要・漢字を含む全Shift-JIS文字に対応。

let _sjisMap = null;

function buildSjisMap() {
  if (_sjisMap) return _sjisMap;
  _sjisMap = new Map();
  try {
    const dec = new TextDecoder('shift-jis', { fatal: false });
    // 1バイト: 半角カタカナ 0xA1-0xDF
    for (let b = 0xA1; b <= 0xDF; b++) {
      const ch = dec.decode(new Uint8Array([b]));
      if (ch && ch !== '\uFFFD') _sjisMap.set(ch.codePointAt(0), [b]);
    }
    // 2バイト: 0x81-0xFC, 0x40-0xFC (0x7Fを除く)
    for (let b1 = 0x81; b1 <= 0xFC; b1++) {
      for (let b2 = 0x40; b2 <= 0xFC; b2++) {
        if (b2 === 0x7F) continue;
        const ch = dec.decode(new Uint8Array([b1, b2]));
        if (ch && ch !== '\uFFFD' && !_sjisMap.has(ch.codePointAt(0))) {
          _sjisMap.set(ch.codePointAt(0), [b1, b2]);
        }
      }
    }
  } catch (e) {
    console.warn('[Gemini Logger] Shift-JISマップ構築失敗:', e);
  }
  return _sjisMap;
}

function encodeShiftJIS(str) {
  const map = buildSjisMap();
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    const cp = str.codePointAt(i);
    if (cp > 0xFFFF) { i++; bytes.push(0x3F); continue; } // サロゲートペア → '?'
    if (cp < 0x80) {
      bytes.push(cp); // ASCII はそのまま
    } else {
      const sjis = map.get(cp);
      if (sjis) bytes.push(...sjis);
      else bytes.push(0x3F); // 変換不可 → '?'
    }
  }
  return new Uint8Array(bytes);
}

// ── ZIP生成（外部ライブラリ不要） ─────────────────────────────────────────

function crc32(data) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function u16(n) { return [n & 0xFF, (n >> 8) & 0xFF]; }
function u32(n) { return [n & 0xFF, (n >> 8) & 0xFF, (n >> 16) & 0xFF, (n >> 24) & 0xFF]; }
function dosDateTime(d) {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  };
}

// files: [{name: string, bytes: Uint8Array, date: Date}]
// contentは呼び出し元でBlob経由でバイト列に変換済みのものを渡す
function createZip(files) {
  const parts = [], cdEntries = [];
  let offset = 0;

  for (const file of files) {
    // ファイル名をShift-JISでエンコード（Windowsエクスプローラー対応）
    const nameBytes = encodeShiftJIS(file.name);
    const dataBytes = file.bytes;

    const crc = crc32(dataBytes), size = dataBytes.length;
    const dt  = dosDateTime(file.date || new Date());

    const lh = new Uint8Array([
      0x50,0x4B,0x03,0x04,
      ...u16(20),...u16(0),...u16(0),
      ...u16(dt.time),...u16(dt.date),
      ...u32(crc),...u32(size),...u32(size),
      ...u16(nameBytes.length),...u16(0)
    ]);
    parts.push(lh, nameBytes, dataBytes);
    cdEntries.push({
      h: new Uint8Array([
        0x50,0x4B,0x01,0x02,
        ...u16(20),...u16(20),...u16(0),...u16(0),
        ...u16(dt.time),...u16(dt.date),
        ...u32(crc),...u32(size),...u32(size),
        ...u16(nameBytes.length),...u16(0),...u16(0),
        ...u16(0),...u16(0),...u32(0),...u32(offset)
      ]),
      name: nameBytes
    });
    offset += lh.length + nameBytes.length + size;
  }

  const cdStart = offset;
  let cdSize = 0;
  for (const e of cdEntries) { parts.push(e.h, e.name); cdSize += e.h.length + e.name.length; }
  parts.push(new Uint8Array([
    0x50,0x4B,0x05,0x06,
    ...u16(0),...u16(0),
    ...u16(files.length),...u16(files.length),
    ...u32(cdSize),...u32(cdStart),...u16(0)
  ]));

  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const p of parts) { out.set(p, pos); pos += p.length; }
  return out;
}

// ── ダウンロード ──────────────────────────────────────────────────────────
// content script内で <a download> を使って直接ダウンロードする。
// background.js経由だとMV3 service workerの制限で文字化けが起きるため。

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

function sendDownloadText(text, filename) {
  downloadBlob(new Blob(['\uFEFF', text], { type: 'text/plain;charset=utf-8' }), filename);
}

function sendDownloadZip(uint8array, filename) {
  downloadBlob(new Blob([uint8array], { type: 'application/zip' }), filename);
}

// ── 会話スクレイプ ────────────────────────────────────────────────────────

function scrapeConversation() {
  const strategies = [
    () => {
      const turns = document.querySelectorAll('conversation-turn');
      if (!turns.length) return null;
      const r = [];
      turns.forEach(t => {
        const u = t.querySelector('.query-text, user-query-content .query-text, [class*="query-text"]');
        const m = t.querySelector('model-response .markdown, .response-content .markdown, model-response-text, [class*="response-text"]');
        if (u) r.push({ role: 'user',  content: u.innerText.trim() });
        if (m) r.push({ role: 'model', content: m.innerText.trim() });
      });
      return r.length ? r : null;
    },
    () => {
      const us = document.querySelectorAll('user-query');
      const ms = document.querySelectorAll('model-response');
      if (!us.length && !ms.length) return null;
      const r = [];
      document.querySelectorAll('user-query, model-response').forEach(el => {
        if (el.tagName.toLowerCase() === 'user-query') {
          r.push({ role: 'user',  content: (el.querySelector('.query-text') || el).innerText.trim() });
        } else {
          r.push({ role: 'model', content: (el.querySelector('.markdown, [class*="markdown"]') || el).innerText.trim() });
        }
      });
      return r.length ? r : null;
    }
  ];
  for (const s of strategies) { const r = s(); if (r?.length) return r; }
  return [];
}

// ── フォーマット・ユーティリティ ──────────────────────────────────────────

function formatAsText(turns, url, savedDate) {
  const lines = [
    '=== Gemini 会話ログ ===',
    `保存日時: ${new Date(savedDate).toLocaleString('ja-JP')}`,
    `URL: ${url}`, '', '---', ''
  ];
  turns.forEach(t => {
    lines.push(t.role === 'user' ? '[ユーザー]' : '[Gemini]');
    lines.push(t.content, '', '---', '');
  });
  return lines.join('\n');
}

function toDatetimeStr(isoStr) {
  const d = new Date(isoStr), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}` +
         `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function safeFilename(title) {
  return title.replace(/[\\/:*?"<>|\r\n]/g, '_').replace(/\s+/g, '_').slice(0, 50);
}

function getChatTitle() {
  return document.querySelector('[data-test-id="conversation-title"]')?.innerText.trim()
      || document.title.replace(/\s*[|\-–]\s*.*$/i, '').trim()
      || '無題の会話';
}

function makeEntry(turns, url) {
  const now = new Date();
  return {
    id:    `log_${now.getTime()}`,
    title: getChatTitle(),
    url,
    date:  now.toISOString(),
    turns
  };
}

// ── インクリメンタルマージ ────────────────────────────────────────────────
// Geminiのターン仮想化対策: 既存の保存済みターンと新規スクレイプをマージする。
// DOMから消えた古いターンを保持しつつ、新しいターンのみ追記する。

function mergeWithExisting(existingTurns, newTurns) {
  if (!existingTurns || existingTurns.length === 0) return newTurns;
  if (!newTurns || newTurns.length === 0) return existingTurns;

  // DOMに全ターンが揃っている場合（仮想化なし）はそのまま使う
  if (newTurns.length >= existingTurns.length) return newTurns;

  // 仮想化あり: 既存の末尾ターンをDOM上で探し、以降のターンを追記
  const last = existingTurns[existingTurns.length - 1];
  for (let i = newTurns.length - 1; i >= 0; i--) {
    if (newTurns[i].role === last.role &&
        newTurns[i].content.slice(0, 80) === last.content.slice(0, 80)) {
      const additional = newTurns.slice(i + 1);
      return additional.length > 0 ? [...existingTurns, ...additional] : existingTurns;
    }
  }

  // 末尾が見つからない場合は安全側に倒して既存を保持
  return existingTurns;
}

// ── 自動保存（チャットページを開いたとき） ───────────────────────────────
// ユーザーが普通にGeminiを使うだけで過去ログが蓄積される

function autoSave() {
  // /app/XXXXX 形式のチャットページのみ対象
  if (!/\/app\/[a-zA-Z0-9]+/.test(location.pathname)) return;

  const turns = scrapeConversation();
  if (!turns.length) return;

  chrome.storage.local.get({ logs: [] }, data => {
    const logs     = data.logs;
    const existing = logs.find(l => l.url === location.href);
    const merged     = mergeWithExisting(existing?.turns, turns);
    const titleNow   = getChatTitle();
    const titleChanged = existing && existing.title !== titleNow;

    // ターン数もタイトルも変化なければスキップ
    if (merged.length <= (existing?.turns.length ?? 0) && !titleChanged) return;

    const entry   = makeEntry(merged, location.href);
    if (existing) entry.id = existing.id; // 更新時はidを引き継ぐ（詳細ビューの参照を維持）
    const updated = [entry, ...logs.filter(l => l.url !== location.href)].slice(0, 200);
    chrome.storage.local.set({ logs: updated });
    console.log('[Gemini Logger] 自動保存:', entry.title, `(${merged.length}ターン)`);
  });
}

// ── 💾 ログを保存（現在のチャットをダウンロード） ─────────────────────────

function handleSaveClick() {
  const btn = document.getElementById(BUTTON_ID);
  if (!btn) return;
  btn.disabled = true;
  setLabel(btn, '⏳', '取得中...');

  const turns = scrapeConversation();
  if (!turns.length) {
    setLabel(btn, '❌', '見つかりません');
    btn.classList.add('error');
    setTimeout(() => { btn.disabled = false; setLabel(btn, '💾', 'ログを保存'); btn.classList.remove('error'); }, 2000);
    return;
  }

  const entry = makeEntry(turns, location.href);
  chrome.storage.local.get({ logs: [] }, data => {
    const logs = [entry, ...data.logs.filter(l => l.url !== location.href)].slice(0, 200);
    chrome.storage.local.set({ logs });
  });

  const text = formatAsText(entry.turns, entry.url, entry.date);
  sendDownloadText(text, `gemini_${toDatetimeStr(entry.date)}_${safeFilename(entry.title)}.txt`);

  setLabel(btn, '✅', `${turns.length}件保存`);
  btn.classList.add('success');
  setTimeout(() => { btn.disabled = false; setLabel(btn, '💾', 'ログを保存'); btn.classList.remove('success'); }, 2000);
}

// ── 📦 全ログをZIP（ストレージの全ログをまとめる） ────────────────────────

async function handleZipClick() {
  const btn = document.getElementById(ZIP_BUTTON_ID);
  if (!btn) return;
  btn.disabled = true;
  setLabel(btn, '⏳', '生成中...');

  // 現在のチャットを最新スクレイプで上書き保存してからZIP化
  // （古いバージョンで文字化けした状態でストレージに入っていた場合の対策）
  const currentTurns = scrapeConversation();

  chrome.storage.local.get({ logs: [] }, async data => {
    let logs = data.logs;

    if (currentTurns.length > 0) {
      // ターン数に関わらず常に最新スクレイプで上書き
      const entry = makeEntry(currentTurns, location.href);
      logs = [entry, ...logs.filter(l => l.url !== location.href)].slice(0, 200);
      chrome.storage.local.set({ logs });
    }

    if (!logs.length) {
      setLabel(btn, '📦', 'ログがありません');
      btn.classList.add('error');
      setTimeout(() => { btn.disabled = false; setLabel(btn, '📦', '全ログをZIP'); btn.classList.remove('error'); }, 2000);
      return;
    }

    // 個別DLと同じBlob経由エンコードでバイト列を生成（文字化け防止）
    const files = await Promise.all(logs.map(async log => {
      const text   = formatAsText(log.turns, log.url, log.date);
      const blob   = new Blob(['\uFEFF', text], { type: 'text/plain;charset=utf-8' });
      const buffer = await blob.arrayBuffer();
      return {
        name:  `${safeFilename(log.title)}_${toDatetimeStr(log.date)}.txt`,
        bytes: new Uint8Array(buffer),
        date:  new Date(log.date)
      };
    }));

    const zipBytes = createZip(files);
    sendDownloadZip(zipBytes, `gemini_logs_${toDatetimeStr(new Date().toISOString())}.zip`);

    setLabel(btn, '✅', `${logs.length}件をZIP`);
    btn.classList.add('success');
    setTimeout(() => { btn.disabled = false; setLabel(btn, '📦', '全ログをZIP'); btn.classList.remove('success'); }, 2000);
  });
}

// ── 検索パネル ────────────────────────────────────────────────────────────

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function highlight(text, q) {
  if (!q) return escHtml(text);
  const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), 'gi');
  return escHtml(text).replace(re, m => `<mark>${m}</mark>`);
}

function getSnippet(log, q) {
  if (!q) return '';
  const lq = q.toLowerCase();
  for (const t of log.turns) {
    const idx = t.content.toLowerCase().indexOf(lq);
    if (idx < 0) continue;
    const s = Math.max(0, idx - 30), e = Math.min(t.content.length, idx + q.length + 60);
    return (s > 0 ? '…' : '') + t.content.slice(s, e) + (e < t.content.length ? '…' : '');
  }
  return '';
}

function renderPanel(logs, q) {
  const list = document.getElementById('gcl-list');
  const info = document.getElementById('gcl-info');
  if (!list || !info) return;

  const filtered = q
    ? logs.filter(l => l.title.toLowerCase().includes(q.toLowerCase()) ||
        l.turns.some(t => t.content.toLowerCase().includes(q.toLowerCase())))
    : logs;

  info.textContent = q ? `"${q}" — ${filtered.length}件` : `保存済み: ${logs.length}件`;

  if (!filtered.length) {
    list.innerHTML = `<div class="gcl-empty">${q ? '一致なし' : 'ログなし'}</div>`;
    return;
  }

  list.innerHTML = filtered.map(log => {
    const snippet = getSnippet(log, q);
    const d = new Date(log.date);
    const dateStr = d.toLocaleString('ja-JP', { year: '2-digit', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
    return `<div class="gcl-item" data-id="${escHtml(log.id)}">
      <div class="gcl-item-title">${highlight(log.title, q)}</div>
      <div class="gcl-item-meta">${dateStr} · ${log.turns.length}ターン</div>
      ${snippet ? `<div class="gcl-item-snippet">${highlight(snippet, q)}</div>` : ''}
      <div class="gcl-item-actions">
        <button class="gcl-btn-dl" data-id="${escHtml(log.id)}">⬇ 再DL</button>
        <button class="gcl-btn-del" data-id="${escHtml(log.id)}">🗑 削除</button>
      </div>
    </div>`;
  }).join('');

  list.querySelectorAll('.gcl-item').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.closest('.gcl-item-actions')) return;
      openDetail(el.dataset.id, logs, q);
    });
  });

  list.querySelectorAll('.gcl-btn-dl').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const log = logs.find(l => l.id === btn.dataset.id);
      if (!log) return;
      const text = formatAsText(log.turns, log.url, log.date);
      sendDownloadText(text, `gemini_${toDatetimeStr(log.date)}_${safeFilename(log.title)}.txt`);
    });
  });

  list.querySelectorAll('.gcl-btn-del').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.dataset.id;
      chrome.storage.local.get({ logs: [] }, data => {
        chrome.storage.local.set({ logs: data.logs.filter(l => l.id !== id) });
      });
    });
  });
}

function openDetail(id, logs, q) {
  const log = logs.find(l => l.id === id);
  if (!log) return;
  const detail = document.getElementById('gcl-detail');
  const back   = document.getElementById('gcl-back');
  const dtitle = document.getElementById('gcl-detail-title');
  const dbody  = document.getElementById('gcl-detail-body');
  if (!detail) return;

  dtitle.textContent = log.title;
  dbody.innerHTML = log.turns.map(t => `
    <div class="gcl-turn gcl-turn-${t.role}">
      <div class="gcl-turn-role">${t.role === 'user' ? 'ユーザー' : 'Gemini'}</div>
      <div class="gcl-turn-content">${highlight(t.content, q)}</div>
    </div>`).join('');

  detail.dataset.currentId = id;
  document.getElementById('gcl-list-view').style.display = 'none';
  detail.style.display = 'flex';
  back.style.display   = 'block';
}

function createSearchPanel() {
  if (document.getElementById(PANEL_ID)) return;

  const panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.innerHTML = `
    <div id="gcl-header">
      <span>🔍 ログ検索</span>
      <button id="gcl-close">✕</button>
    </div>
    <div id="gcl-search-row">
      <input id="gcl-input" type="text" placeholder="全文検索..." autocomplete="off">
    </div>
    <div id="gcl-info"></div>
    <button id="gcl-back" style="display:none">← 一覧に戻る</button>
    <div id="gcl-list-view">
      <div id="gcl-list"></div>
    </div>
    <div id="gcl-detail" style="display:none;flex-direction:column">
      <div id="gcl-detail-title"></div>
      <div id="gcl-detail-body"></div>
    </div>`;
  document.body.appendChild(panel);

  let allLogs = [];
  let query   = '';

  const load = () => {
    chrome.storage.local.get({ logs: [] }, d => {
      allLogs = d.logs;
      renderPanel(allLogs, query);
    });
  };

  document.getElementById('gcl-close').addEventListener('click', () => {
    panel.style.display = 'none';
  });

  document.getElementById('gcl-back').addEventListener('click', () => {
    document.getElementById('gcl-detail').style.display  = 'none';
    document.getElementById('gcl-list-view').style.display = 'block';
    document.getElementById('gcl-back').style.display    = 'none';
  });

  document.getElementById('gcl-input').addEventListener('input', e => {
    query = e.target.value;
    document.getElementById('gcl-detail').style.display  = 'none';
    document.getElementById('gcl-list-view').style.display = 'block';
    document.getElementById('gcl-back').style.display    = 'none';
    renderPanel(allLogs, query);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.logs) {
      allLogs = changes.logs.newValue || [];
      renderPanel(allLogs, query);
      // 詳細ビューが開いていたら内容も更新する
      const detail = document.getElementById('gcl-detail');
      const currentId = detail?.dataset.currentId;
      if (detail?.style.display !== 'none' && currentId) {
        openDetail(currentId, allLogs, query);
      }
    }
  });

  panel._reload = load;
  load();
}

function toggleSearchPanel() {
  const panel = document.getElementById(PANEL_ID);
  if (!panel) { createSearchPanel(); return; }
  panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
  if (panel.style.display === 'flex') {
    panel._reload?.(); // 開くたびに最新データを取得
    document.getElementById('gcl-input')?.focus();
  }
}

// ── ボタンのラベル更新ヘルパー ────────────────────────────────────────────

function setLabel(btn, icon, text) {
  const iconEl  = btn.querySelector('.gcl-icon');
  const labelEl = btn.querySelector('.gcl-label');
  if (iconEl)  iconEl.textContent  = icon;
  if (labelEl) labelEl.textContent = text;
}

// ── ボタン注入 ────────────────────────────────────────────────────────────

function makeButton(id, icon, label, handler) {
  const btn = document.createElement('button');
  btn.id    = id;
  btn.title = label;
  btn.innerHTML = `<span class="gcl-icon">${icon}</span><span class="gcl-label">${label}</span>`;
  btn.addEventListener('click', handler);
  document.body.appendChild(btn);
}

function injectButtons() {
  if (!document.getElementById(SEARCH_BTN_ID)) {
    makeButton(SEARCH_BTN_ID, '🔍', 'ログ検索', toggleSearchPanel);
  }
  if (!document.getElementById(BUTTON_ID)) {
    makeButton(BUTTON_ID, '💾', 'ログを保存', handleSaveClick);
  }
  if (!document.getElementById(ZIP_BUTTON_ID)) {
    makeButton(ZIP_BUTTON_ID, '📦', '全ログをZIP', handleZipClick);
  }
  if (!document.getElementById('gemini-logger-version')) {
    const ver = document.createElement('div');
    ver.id = 'gemini-logger-version';
    ver.textContent = VERSION;
    document.body.appendChild(ver);
  }
}

// ── 初期化 ────────────────────────────────────────────────────────────────

function init() {
  injectButtons();

  // 初回: ページ読み込み完了後に自動保存
  setTimeout(autoSave, 2000);

  // ターンが追加されたときに保存を更新するためポーリング（10秒ごと）
  // 拡張機能が再読み込みされてコンテキストが無効になったらインターバルを停止する
  const _pollTimer = setInterval(() => {
    try { autoSave(); } catch (e) { clearInterval(_pollTimer); }
  }, 10000);

  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(() => {
        injectButtons();
        autoSave(); // URLが変わるたびに自動保存
      }, 2000);
    }
  }).observe(document, { subtree: true, childList: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Shift-JISマップを事前構築（初回ZIP時のラグを減らす）
setTimeout(buildSjisMap, 3000);
