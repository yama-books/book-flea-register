# ローカル開発引継ぎ

2026-10-30 JST更新。作業先 D:\dev\bookfreemarket、Public: yama-books/book-flea-register、公開先 https://yama-books.github.io/book-flea-register/ 。最新コミットはGitHub main・git log・LOCAL_STATUS.mdで確認し、資料内の固定SHAに依存しない。この資料を含むmainが基準。iPad Safari実機での新UI検収は未実施。

## 最初に読むもの

この資料→README→AGENTS→docs/REQUIREMENTS.md→docs/UI_DESIGN.md→docs/CUSTOMER_DISPLAY.md→docs/MENU.md→docs/CALL_SETUP.md→docs/VALIDATION.md→LOCAL_STATUS.md。素材はdocs/ASSET_INVENTORY.mdとassets/reference/pixel-ui-model.pngを参照。元画像PNGと切り出しを維持し、ネコをSVGで描き直さない。

## 現在の仕様

- 静的HTML/CSS/JavaScript。iPad横優先。上段左は7マーク/お預かり候補/やりなおす、右は明細/お会計/お預かり/お釣り/完了。下段は売上。依存や操作を増やさず会計を優先。
- 上部は練習モード・山本を呼ぶ・設定を常設しスクロール中も表示。お客さん表示と対応端末の全画面は設定内。会計中/練習中も接続操作は可能、設定編集・復元はロック。
- 7マーク: 赤/黄/緑/白/青/白丸そ/白丸CD。初期は全て100円、価格候補100/200/400円。分類名は赤文庫・黄新書・緑単行本・白漫画・そその他・CD=CD、青は未分類。分類名20文字以内。markerVersion:3。旧版の価格対応と履歴は保持して移行。
- 色1タップで1点追加。明細の＋/−でも訂正。お預かり候補はちょうど＋500/1000/5000/10000単位の切り上げで重複除外。整数円、不足は完了不可。完了はIndexedDB保存成功後だけ次会計へ。
- 取消は確認付きの追記、訂正は取消と差替を原子的保存。確定時の価格/色/分類はsnapshot。確定履歴を物理削除しない。設定リセットは設定のみで売上は残す。
- 売上内訳は最初から表示。広い画面では合計・内訳・履歴の3領域、1000px以下は2列＋履歴、620px以下は縦積み。分類別の売上金額円グラフ/金額・点数・比率の凡例、切替で1時間ごとの金額・点数・会計数。価格別/色別の重複内訳は出さない。取消/別日を除き確定時の分類で集計。
- グラフ内だけ漫画（白）は青灰色#8196a8、その他（そ）は紫#9b70b8、CDはオレンジ#d68b45。値札と履歴の色は変えない。円グラフは画面に入ると1秒で1回転して現れる。動き低減では静止、差替時の監視を解除。
- 練習は本番設定だけを別DBへ複写し、会計/履歴/取消/採番は別保存。紫の背景・網掛け・バナー・練習完了ラベルで識別。本番と練習の途中会計を別sessionStorageに保持。練習JSONは本番復元を拒否。お客さん画面は練習中0円待機。
- 山本呼出は共通GAS URLをコードに固定。端末は「設定」内のメール通知で合言葉だけを保存する。担当者名1〜80文字と要件1〜500文字を毎回入力し、source=book-saleとともに送る。レジの合言葉がなければ同じoriginのentrance-counter-call設定を参照。宛先はGASプロパティのみ。練習はfetchなし。実メール着信は未確認。詳細は最新docs/CALL_SETUP.md。
- お客さん画面はお会計/お預かり/お釣りの3行。完了後は次会計までありがとうございました＋前回金額。QRを往復してWebRTC接続。送るのは会計表示情報だけ。両画面でWake Lock再取得、一時途絶では接続を閉じず、8秒更新なしで古い金額を隠す。再開不能ならQRを交換し直す。
- 接続診断はレジの接続見出し/お客さん案内文を3秒以内に5回タップ。Safari用の任意カメラ許可準備も設定内接続画面にある。ユーザーは同じテザリングでiPad2台の接続成功を報告済み（新UI以前）。9:00〜16:30連続表示は実機未検証。

## 実装の入口

src/app.js: 会計/設定/練習切替/描画。src/calculation.js: 検証・会計計算・設定移行・候補額。src/storage.js: IndexedDB。src/practice.js: 練習DB。src/sales-summary.js: 分類と時間帯の集計/グラフ色、src/chart-motion.js: 可視時の回転開始。src/staff-call.js: 呼出、src/menu.js: 全画面。src/signaling.js/amount-link.js/qr.js/customer-controls.js/customer.js: 端末間表示。src/display-support.js: Wake Lock/5回タップ。

## 変更時の検証と公開

1. `node tests/run-checks.mjs`（構文＋Node45件×JST/UTC）。依存インストール不要。
2. `tests/browser.html` 保存9件、`tests/realtime.html` 実QR/WebRTC9件。保存テストは専用DB。本番/実売上をテストに使わない。tests/layout.htmlで1024×768/768×1024/390幅を確認。
3. 実テスト後、適用AGENTSとJev規則に従う。正本allowlist外のローカル資料は無断送信しない。ローカルaudit packはsend_allowed=falseで未送信、公開済みupstreamの差分と実CIログだけで監査してきた。verified/contradicted/unsupportedとreview confidenceを区別する。
4. 公開はyama-booksだけ。CI Register checksとPages成功、GitHub読戻しと公開Pagesのハッシュ一致を確認。LOCAL_STATUS.mdに最新コミット/検証/限界を記録する。Factory owner/Secret/認証境界は変更しない。

## 未検証・残る確認

- iPad Safariの新UI、円グラフの動き、全画面、数字キーボード、CSV/JSON保存と復元、Wake Lock・7.5時間接続。
- GAS本デプロイとメール着信。現状は模擬送信テストのみ。勝手に実呼出を試さない。
- 青の分類名、営業日締め、売上も含むリセットの要否は未確定。現在は設定のみリセットし履歴は残す。
- 以前、公開直後に一度だけ読込中で止まり再読込で正常化した。原因は未確定。再発時は具体的なエラーを調べ、原因を推測だけで断定しない。
- 台帳登録、素材の独立した利用条件確認は未実施。

## 触らないもの

vendor/sources.jsonの既存改行差分、entrance-counter/（参照のみ）、.claude/。合言葉/宛先/端末設定/売上/バックアップをGitへ入れない。公開承認された共通GAS URLは既存コードに固定済み。LOCAL_STATUS.mdと.codex-localは公開対象外。Slack報告はユーザーのこの作業での不要指定を維持。

## 次セッションへ渡す文

> D:\dev\bookfreemarket（yama-books/book-flea-register）の最新mainを引き継いでください。まずdocs/handoff/LOCAL_DEVELOPMENT_HANDOFF.mdと指定順の資料、LOCAL_STATUS.mdを読んでください。上部の練習/山本呼出/設定、会計中心UI、内訳常時表示の売上3領域、白マークのグラフ色分け、可視時の1秒回転まで実装済みです。練習は別保存、顧客表示はQR/WebRTCとWake Lockです。PNGを維持し、不要な機能追加・確定履歴削除はしないでください。変更時はnode tests/run-checks.mjs、保存/通信ブラウザテストを実行し、公開後はCI/Pages/ファイル照合を行ってください。iPad実機とGAS実着信は未確認。vendor/sources.json、entrance-counter/、.claude/は変更しないでください。
