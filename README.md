# Gemini Log Assistant

Geminiの会話ログを保存・検索・ZIP一括エクスポートできるChrome拡張機能です。

---

## 機能

- **💾 ログを保存** — 表示中のチャットをテキストファイルでダウンロード＆ローカルに蓄積
- **📦 全ログをZIP** — 保存済みの全会話を一括ZIPエクスポート（Windowsで文字化けしないShift-JISファイル名）
- **🔍 ログ検索** — ページ内パネルで過去の会話を全文検索・ハイライト表示
- **自動保存** — チャットを開くたびに自動でストレージに蓄積

## インストール

### Chrome Web Store（推奨）
[Gemini Chat Logger](https://chromewebstore.google.com/detail/faalgjigfkchegchcgepoalebnahpjlh) をChromeに追加

### 手動インストール
1. このリポジトリをダウンロード（Code → Download ZIP）
2. ZIPを展開
3. Chromeで `chrome://extensions/` を開く
4. 右上の「デベロッパーモード」をオン
5. 「パッケージ化されていない拡張機能を読み込む」→ 展開したフォルダを選択

## 使い方

1. [Gemini](https://gemini.google.com) を開くと右側にボタンが表示されます
2. **💾 ログを保存** — 現在のチャットを保存
3. **📦 全ログをZIP** — 蓄積した全ログをZIPでダウンロード
4. **🔍 ログ検索** — キーワードで過去の会話を検索

---

## プライバシーポリシー / Privacy Policy

**最終更新：2026年3月**

### データの収集と利用

本拡張機能が収集・保存するデータは以下の通りです：

- **会話ログ** — Gemini上でユーザーが保存操作を行ったチャットの内容（ユーザーの発言・Geminiの返答）

### データの保存場所

- すべてのデータはユーザーのブラウザ内（`chrome.storage.local`）にのみ保存されます
- 外部サーバーへのデータ送信は一切行いません
- 開発者を含む第三者がデータにアクセスすることはありません

### データの利用目的

保存されたデータは以下の目的にのみ使用されます：

- ダウンロード機能（テキストファイル・ZIP）の提供
- 拡張機能内の検索機能の提供

### データの削除

- 拡張機能のポップアップ画面から「すべて削除」でいつでも全データを削除できます
- 拡張機能をアンインストールすると、すべてのデータが削除されます

### 必要な権限

| 権限 | 用途 |
|------|------|
| `storage` | 会話ログをブラウザにローカル保存するため |
| `downloads` | テキスト・ZIPファイルをダウンロードするため |
| `host_permissions: gemini.google.com` | Geminiのページにボタンを表示し会話を読み取るため |

---

### Privacy Policy (English)

**Last updated: March 2026**

#### Data Collection and Use

This extension collects and stores only the following data:

- **Conversation logs** — The content of Gemini chats that the user explicitly saves (user messages and Gemini responses)

#### Data Storage

- All data is stored exclusively in the user's browser (`chrome.storage.local`)
- No data is ever transmitted to external servers
- No third party, including the developer, has access to your data

#### Purpose of Data Use

Stored data is used solely for:

- Providing download functionality (text files and ZIP)
- Providing in-extension search functionality

#### Data Deletion

- Users can delete all data at any time via the "Delete All" button in the extension popup
- Uninstalling the extension removes all stored data

#### Permissions

| Permission | Purpose |
|------------|---------|
| `storage` | To save conversation logs locally in the browser |
| `downloads` | To download text and ZIP files |
| `host_permissions: gemini.google.com` | To display buttons on Gemini and read conversation content |

---

## ライセンス / License

MIT License
