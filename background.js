// Service Worker: ダウンロード処理を担当
// MV3 service workerではURL.createObjectURLが使えないため、data URLで渡す

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'downloadText') {
    // テキスト文字列 → UTF-8バイト列 → BOM付加 → base64 → data URL
    const enc      = new TextEncoder();
    const bom      = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const body     = enc.encode(msg.text);
    const combined = new Uint8Array(bom.length + body.length);
    combined.set(bom);
    combined.set(body, bom.length);
    let binary = '';
    for (let i = 0; i < combined.length; i++) binary += String.fromCharCode(combined[i]);
    chrome.downloads.download({
      url:      'data:text/plain;charset=utf-8;base64,' + btoa(binary),
      filename: msg.filename
    });
  }

  if (msg.type === 'downloadZip') {
    // content.js側でbase64済みなのでそのまま使う
    chrome.downloads.download({
      url:      'data:application/zip;base64,' + msg.base64,
      filename: msg.filename
    });
  }
});
