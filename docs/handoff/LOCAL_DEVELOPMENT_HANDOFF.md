# ローカル開発引継ぎ

2026-10-30 JST。初期版を実装済み。作業先はこのフォルダ。公開先は `https://yama-books.github.io/book-flea-register/`。検証範囲はdocs/VALIDATION.mdを参照。iPad Safari実機検収は未実施。

## 最初にすること

1. README → AGENTS → REQUIREMENTS → UI_DESIGN → ASSET_INVENTORYを読む。
2. 添付元画像 `assets/reference/pixel-ui-model.png` と切り出しを確認する。
3. `index.html`、`styles.css`、`src/calculation.js`、`src/storage.js`、`src/app.js`が本体。計算・永続化・UIを分離している。不要なビルド環境やフレームワークを導入しない。
4. `npm test`と`npm run check`、tests/browser.htmlの保存テストで変更を確認する。
5. 次の優先作業は実機Safariでキーボード・ダウンロード・再起動後保存を確認すること。実機検収結果を別途記録する。
6. マークは赤/黄/緑/白/青/白丸の「そ」。ピンクの旧履歴を保持する移行あり。QRによるお客さん画面接続はdocs/CUSTOMER_DISPLAY.mdを読み、別の実機2台で確認する。カメラ権限は読み取りボタンを押した時だけ要求する。

## デザインの優先順位

モデル画像から反映する。ネコ・本をSVGで描き直さない。切り出しPNGを小さく使い、必要な操作アイコンだけSVG可。シンプルでかわいいこと、読みやすいこと、会計が速いことを優先する。画像内の古い価格・会計手順は採用しない。

## GitHub保存と開発再開

- 保存先は `yama-books/book-flea-register` Public。2026-10-30 JSTに本人権限で作成し、GitHub APIで所有者・Public設定・書込権限を確認した。Factory Issue #16を参照。
- 仕様書と画像素材をこのリポジトリで管理する。次セッションはリモートの最新mainとローカル変更を照合し、既存内容を上書きしない。認証情報や診断内容を公開資料へ記録しない。
- 正常なyama-books本人認証でのみ新規作成。Factoryのowner固定、Secret、承認ラベルは変更しない。別アカウントへ作らない。
- GitHubに保存する際は公開可能な資料とassetsだけを選ぶ。認証診断・ローカルログ・バックアップ・実売上を混ぜない。
- 既存履歴を上書きせずcommitし、push後はGitHubから全保存ファイルを読戻してSHAと照合する。サイト配信は別工程。
- 保存コミットとPages配信履歴はGitHubを参照。APP-ID、台帳登録、実機Safari検証は未実施。

## 未確定事項

6色の初期価格割当は初回設定で指定。分類は任意/未分類という実装案で開始可能。CDの呼称、営業日締め、上限、素材再配布条件はREQUIREMENTSの未確定一覧を見る。画像の生成元・利用条件は独立に確認されたものではない。

## 次のセッションへそのまま渡す文

> yama-books/book-flea-registerの最新mainとREADME、AGENTS.md、docs/REQUIREMENTS.md、docs/UI_DESIGN.md、docs/VALIDATION.mdを読んで初期版を引き継いでください。モデル画像由来のPNGとシンプルな会計中心UIを維持し、ネコのSVG描き直しや不要な機能追加は行わないでください。計算はsrc/calculation.js、IndexedDB保存はsrc/storage.js、操作はsrc/app.jsです。初期価格100/200/400円、色価格は初回設定、「完了」で保存成功後のみ次会計へ進む設計を守ってください。まずiPad Safari実機で数字キーボード・CSV/JSON保存・再起動後の履歴・横縦画面を確認し、結果に基づいて必要な修正を行ってください。GitHubと公開先の保存内容を読戻し、売上やバックアップをリポジトリへ入れないでください。
