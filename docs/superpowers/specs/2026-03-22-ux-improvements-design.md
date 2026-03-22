# UX改善 設計書

**作成日**: 2026-03-22
**ステータス**: 承認済み

---

## 概要

5つのUX改善をフロントエンドのみで実施する。バックエンドAPIの変更はなし。対象ページ: Dashboard、Facility、Documents、Sidebar（モバイル対応）。

---

## 1. ダッシュボード「今日のアジェンダ」

### 変更内容

`frontend/src/pages/Dashboard.jsx` を全面的に書き直す。

### レイアウト

```
┌─────────────────────────────────────────────┐
│ 今日のアジェンダ（今日の日付ヘッダー）        │
│ ┌─────────────────────────────────────────┐ │
│ │ 10:00  マーケティング定例  第1会議室     │ │
│ │ 13:00  プロジェクターA予約  備品         │ │
│ │ 17:00  週次レビュー  公開               │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ [統計カード x4: 今月予定 / 今日の予約 / フォルダ / ユーザー] │
└─────────────────────────────────────────────┘
```

### データ取得

- 今日のスケジュール: `GET /schedules?month=YYYY-MM` → 当日分をフィルタ（既存API）
- 今日の施設予約: `getFacilities()` で全施設取得後、各施設に `getReservations(facilityId, today)` をファンアウト（既存 `Facility.jsx` と同じパターン）。`facilityType: "group"` の施設は除外してから予約取得する
- 統計カード: 既存のAPI呼び出しを流用（カウント値のみ表示）
- 統計カードのアイコン: 絵文字は使わずSVGアイコンに置き換える

### アジェンダ行の仕様

- スケジュールと施設予約を `startDatetime` でソートして混在表示
- 種別アイコン: スケジュール（カレンダーSVG）/ 施設予約（建物SVG）
- 表示項目: 時刻・タイトル・場所/施設名
- 予定なしの場合は Empty State（→ 提案5の仕様に従う）
- ローディング中はスケルトン表示
- `startDatetime` が null/undefined のアイテムはリスト末尾に追加（ソートから除外）

---

## 2. 施設予約 グリッドビューへの変更

### 変更内容

`frontend/src/pages/Facility.jsx` を全面書き直し。既存のカードビューを廃止し、グリッドビューをデフォルトとする。

### レイアウト

```
施設予約 — 今日の空き状況

         9:00  12:00  15:00  18:00
本社ビル  ─────────────────────────  (グループヘッダー行)
  第1会議室  [予約済み]
  第2会議室  ─────────────────────
備品       ─────────────────────────
  プロジェクターA  [予約済み]
（parentId=ROOTの施設は最下部にフラット表示）
```

### 仕様

- `facilityType: "group"` の施設はグループヘッダー行として表示（予約行なし、予約ボタンなし）
- `facilityType: "facility"` の施設は予約可能行として表示
- グループへの子施設割り当て: `f.parentId === group.facilityId` で判定。`f.parentId === "ROOT"`（リテラル文字列）の施設はグループなしでリスト末尾に表示
- タイムライン範囲: 9:00〜18:00（既存の `toMin` ロジックを流用）
- 各行右端に「予約する」ボタン → 既存のドロワーをそのまま使用
- ローディング中はスケルトン行
- 施設0件の場合は Empty State（→ 提案5の仕様に従う）

---

## 3. ドキュメント ファイルカード 情報追加

### 変更内容

`frontend/src/pages/Documents.jsx` のファイルカード表示に更新者と更新日時を追加。

### 表示仕様

```
┌─────────────────────────┐
│ [PDFアイコン]            │
│ 議事録_2026-03.pdf       │
│ 田中 · 3日前             │  ← 追加
└─────────────────────────┘
```

- `uploadedBy` (userId) → ユーザー一覧から名前に変換（既存の `getUsers()` API使用）。`uploadedBy` はAPIレスポンスに含まれる
- 日時は `updatedAt` を優先し、なければ `createdAt` を使用 → 相対時間表示（例: 「3日前」「1時間前」）
- ユーザー名解決はコンポーネントマウント時に1回だけ `getUsers()` を呼んでマップ作成
- userId→名前のマップが未解決の場合はuserIdをそのまま表示（フォールバック）

### 相対時間のロジック

`frontend/src/lib/helpers.js` に `timeAgo(isoString)` ヘルパーを追加:
- 1分未満 → 「たった今」
- 1時間未満 → 「N分前」
- 24時間未満 → 「N時間前」
- 7日未満（168時間未満、境界値は「N日前」側に含む） → 「N日前」
- 7日以上 → 「YYYY/MM/DD」

---

## 4. Empty State 共通コンポーネント

### 新規コンポーネント

`frontend/src/components/EmptyState.jsx` を新規作成。

### インターフェース

```jsx
<EmptyState
  icon="calendar"      // "calendar" | "building" | "document" | "user"
  message="予定がありません"
  action={{ label: "予定を追加", onClick: () => {} }}  // optional
/>
```

### 表示仕様

```
┌────────────────────────────────────┐
│                                    │
│   [SVGイラスト（80×80px）]         │
│   予定がありません                  │
│                                    │
│   [+ 予定を追加する]  (optional)   │
│                                    │
└────────────────────────────────────┘
```

- SVGアイコンはシンプルな線画（既存のサイドバーアイコンと同スタイル）
- メッセージは `color: var(--color-text-muted)`
- アクションボタンは `btn btn-primary`（任意、なくても可）
- 最小高さ 200px、中央揃え

### 適用箇所

| ページ | 条件 | icon | message | action |
|--------|------|------|---------|--------|
| Dashboard（アジェンダ） | 今日の予定0件 | calendar | 今日の予定はありません | 予定を追加 → `/schedule` |
| Facility | 施設0件 | building | 施設が登録されていません | adminのみ: 呼び出し元 `Facility.jsx` が `user.role === 'admin'` のときのみ `action` propを渡す。EmptyState自体はroleを知らない |
| Documents（ファイル） | ファイル0件 | document | このフォルダにファイルはありません | ファイルをアップロード |
| Documents（フォルダ） | フォルダ0件 | document | フォルダがありません | フォルダを作成 |
| Admin（ユーザー） | ユーザー0件 | user | ユーザーがいません | ユーザーを招待 |

---

## 5. モバイル対応 ハンバーガーメニュー

### 変更内容

`frontend/src/components/Sidebar.jsx` と `frontend/src/styles/globals.css` を変更。

### 仕様

**768px以上（PC）**: 現状のサイドバー（200px固定）をそのまま維持。

**768px以下（モバイル）**:
- サイドバーは非表示
- TopBarの左端にハンバーガーアイコン（≡）を追加
- タップするとサイドバーが左からスライドイン（translateX アニメーション）
- 背景オーバーレイ（半透明黒）表示、タップで閉じる
- ナビ項目タップで画面遷移＆メニューを閉じる

### 実装方針

- `Sidebar.jsx` に `isOpen` / `onClose` props を追加してモバイル時のオーバーレイ制御
- `TopBar.jsx` にハンバーガーボタンを追加（モバイル時のみ表示）
- 状態管理: `App.jsx` の `AppLayout` で `menuOpen` state を持ち、TopBar と Sidebar に渡す
- Sidebar の各ナビ項目の `onClick` で `navigate(path)` に加えて `onClose()` を呼ぶ（useEffect で location変化を監視する方式は不可）
- z-index 階層: オーバーレイ背景 z-index 40、サイドバー z-index 45、TopBar z-index 50（TopBarが最前面）
- CSSの変更: `@media (max-width: 768px)` でサイドバーを `position: fixed; top: var(--topbar-h); left: 0; height: 100%; transform: translateX(-100%)` に変更、`open` クラスで `transform: translateX(0)`
- EmptyState のスタイルはインラインスタイルで実装（globals.css には追加しない）

---

## 6. 変更ファイル一覧

| ファイル | 変更内容 |
|---------|---------|
| `frontend/src/pages/Dashboard.jsx` | 全面書き直し（アジェンダ表示） |
| `frontend/src/pages/Facility.jsx` | 全面書き直し（グリッドビュー） |
| `frontend/src/pages/Documents.jsx` | ファイルカードに更新者・更新日追加、Empty State適用 |
| `frontend/src/components/EmptyState.jsx` | 新規作成 |
| `frontend/src/components/Sidebar.jsx` | モバイル対応（props追加、オーバーレイ） |
| `frontend/src/components/TopBar.jsx` | ハンバーガーボタン追加（モバイル時） |
| `frontend/src/App.jsx` | menuOpen state追加、TopBarとSidebarに渡す |
| `frontend/src/lib/helpers.js` | `timeAgo()` ヘルパー追加 |
| `frontend/src/styles/globals.css` | モバイル用CSSメディアクエリ追加 |

---

## 7. 非機能要件・制約

- バックエンドAPIの変更なし
- 既存のデザイントークン（CSS変数）を使用
- 絵文字不使用（SVGアイコンのみ）
- ビルドが通ること（`npm run build`）
- モバイル対応はCSSのみ（ReactNative等は使わない）
