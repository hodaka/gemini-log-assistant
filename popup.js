// ポップアップの表示ロジック

let allLogs = [];

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getSnippet(log) {
  const first = log.turns.find(t => t.role === 'model');
  return first ? first.content.slice(0, 80) + (first.content.length > 80 ? '...' : '') : '';
}

function formatDate(isoStr) {
  const d = new Date(isoStr);
  return d.toLocaleString('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });
}

function renderList() {
  const listEl = document.getElementById('log-list');
  const resultInfo = document.getElementById('result-info');

  document.getElementById('total-count').textContent = `${allLogs.length}件`;
  resultInfo.textContent = `保存済み: ${allLogs.length}件`;

  if (allLogs.length === 0) {
    listEl.innerHTML = `
      <div class="empty">
        <div class="icon">📭</div>
        <div>まだ会話が保存されていません</div>
        <div style="font-size:12px;margin-top:6px">Geminiのページで「💾 ログを保存」ボタンをクリックしてください</div>
      </div>
    `;
    return;
  }

  listEl.innerHTML = allLogs.map(log => {
    const snippet = getSnippet(log);
    return `
      <div class="log-item" data-id="${escapeHtml(log.id)}">
        <div class="title">${escapeHtml(log.title)}</div>
        <div class="meta">
          <span>${formatDate(log.date)}</span>
          <span>${log.turns.length}ターン</span>
        </div>
        ${snippet ? `<div class="snippet">${escapeHtml(snippet)}</div>` : ''}
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
      <div class="content">${escapeHtml(turn.content)}</div>
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
