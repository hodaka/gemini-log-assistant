// ポップアップの検索・表示ロジック

let allLogs = [];
let currentQuery = '';

// ハイライト用: クエリにマッチした部分をmarkタグで囲む
function highlight(text, query) {
  if (!query) return escapeHtml(text);
  const escaped = escapeHtml(text);
  const escapedQuery = escapeHtml(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return escaped.replace(new RegExp(escapedQuery, 'gi'), m => `<mark>${m}</mark>`);
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// 検索: タイトル・全ターンのテキストを対象
function filterLogs(logs, query) {
  if (!query.trim()) return logs;
  const q = query.toLowerCase();
  return logs.filter(log => {
    if (log.title.toLowerCase().includes(q)) return true;
    return log.turns.some(t => t.content.toLowerCase().includes(q));
  });
}

// マッチしたスニペットを抽出
function getSnippet(log, query) {
  if (!query.trim()) {
    const first = log.turns.find(t => t.role === 'model');
    return first ? first.content.slice(0, 80) + '...' : '';
  }
  const q = query.toLowerCase();
  for (const turn of log.turns) {
    const idx = turn.content.toLowerCase().indexOf(q);
    if (idx !== -1) {
      const start = Math.max(0, idx - 30);
      const end = Math.min(turn.content.length, idx + query.length + 60);
      let snippet = turn.content.slice(start, end);
      if (start > 0) snippet = '...' + snippet;
      if (end < turn.content.length) snippet += '...';
      return snippet;
    }
  }
  return '';
}

function formatDate(isoStr) {
  const d = new Date(isoStr);
  return d.toLocaleString('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });
}

function renderList() {
  const filtered = filterLogs(allLogs, currentQuery);
  const listEl = document.getElementById('log-list');
  const resultInfo = document.getElementById('result-info');

  document.getElementById('total-count').textContent = `${allLogs.length}件`;

  if (currentQuery) {
    resultInfo.textContent = `"${currentQuery}" — ${filtered.length}件ヒット`;
  } else {
    resultInfo.textContent = `保存済み: ${allLogs.length}件`;
  }

  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div class="empty">
        <div class="icon">${currentQuery ? '🔍' : '📭'}</div>
        <div>${currentQuery ? '一致する会話が見つかりません' : 'まだ会話が保存されていません'}</div>
        ${!currentQuery ? '<div style="font-size:12px;margin-top:6px">Geminiのページで「💾 ログを保存」ボタンをクリックしてください</div>' : ''}
      </div>
    `;
    return;
  }

  listEl.innerHTML = filtered.map(log => {
    const snippet = getSnippet(log, currentQuery);
    const highlightedTitle = highlight(log.title, currentQuery);
    const highlightedSnippet = snippet ? highlight(snippet, currentQuery) : '';
    return `
      <div class="log-item" data-id="${escapeHtml(log.id)}">
        <div class="title">${highlightedTitle}</div>
        <div class="meta">
          <span>${formatDate(log.date)}</span>
          <span>${log.turns.length}ターン</span>
        </div>
        ${highlightedSnippet ? `<div class="snippet">${highlightedSnippet}</div>` : ''}
        <div class="actions">
          <button class="btn-dl" data-id="${escapeHtml(log.id)}">⬇ 再ダウンロード</button>
          <button class="btn-del" data-id="${escapeHtml(log.id)}">🗑 削除</button>
        </div>
      </div>
    `;
  }).join('');

  // イベントを付与
  listEl.querySelectorAll('.log-item').forEach(item => {
    const id = item.dataset.id;
    item.addEventListener('click', e => {
      if (e.target.closest('.actions')) return;
      openDetail(id);
    });
  });

  listEl.querySelectorAll('.btn-dl').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      reDownload(btn.dataset.id);
    });
  });

  listEl.querySelectorAll('.btn-del').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      deleteLog(btn.dataset.id);
    });
  });
}

function openDetail(id) {
  const log = allLogs.find(l => l.id === id);
  if (!log) return;

  document.getElementById('modal-title').textContent = log.title;
  const body = document.getElementById('modal-body');
  body.innerHTML = log.turns.map(turn => `
    <div class="turn ${turn.role}">
      <div class="role">${turn.role === 'user' ? 'ユーザー' : 'Gemini'}</div>
      <div class="content">${highlight(turn.content, currentQuery)}</div>
    </div>
  `).join('');

  document.getElementById('detail-modal').classList.add('open');
}

function formatAsText(log) {
  const lines = [
    '=== Gemini 会話ログ ===',
    `保存日時: ${formatDate(log.date)}`,
    `URL: ${log.url}`,
    '',
    '---',
    ''
  ];
  log.turns.forEach(turn => {
    lines.push(turn.role === 'user' ? '[ユーザー]' : '[Gemini]');
    lines.push(turn.content);
    lines.push('');
    lines.push('---');
    lines.push('');
  });
  return lines.join('\n');
}

function reDownload(id) {
  const log = allLogs.find(l => l.id === id);
  if (!log) return;

  const text = formatAsText(log);
  const blob = new Blob(['\uFEFF', text], { type: 'text/plain;charset=utf-8' }); // BOM付きUTF-8
  const url = URL.createObjectURL(blob);

  const dateStr = log.date.slice(0, 10);
  const safeName = log.title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 50);
  const filename = `gemini_${dateStr}_${safeName}.txt`;

  chrome.downloads.download({ url, filename, saveAs: false }, () => {
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  });
}

function deleteLog(id) {
  allLogs = allLogs.filter(l => l.id !== id);
  chrome.storage.local.set({ logs: allLogs }, renderList);
}

function clearAll() {
  if (!confirm(`保存済みの全${allLogs.length}件の会話ログを削除しますか？`)) return;
  allLogs = [];
  chrome.storage.local.set({ logs: [] }, renderList);
}

// 初期化
chrome.storage.local.get({ logs: [] }, data => {
  allLogs = data.logs;
  renderList();
});

// 検索入力
document.getElementById('search-input').addEventListener('input', e => {
  currentQuery = e.target.value;
  renderList();
});

// 全削除ボタン
document.getElementById('clear-all-btn').addEventListener('click', clearAll);

// モーダルを閉じる
document.getElementById('modal-close').addEventListener('click', () => {
  document.getElementById('detail-modal').classList.remove('open');
});

document.getElementById('detail-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('detail-modal')) {
    document.getElementById('detail-modal').classList.remove('open');
  }
});

// ストレージの変更をリアルタイム反映
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.logs) {
    allLogs = changes.logs.newValue || [];
    renderList();
  }
});
