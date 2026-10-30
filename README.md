# 古本フリマレジ

iPad / Safariで古本フリーマーケットの会計を素早く行う、依存を抑えた静的Webアプリの設計資料です。売上分析よりも会計操作を優先します。

**現在は設計・素材整理段階です。アプリ本体は未実装です。**

- 色を選ぶ → 数量を増減 → 合計確認 → お預かり入力 → 「完了」で保存して次のお客さんへ。
- 初期価格は100・200・400円の3種類。6色と価格の対応は初回設定で指定します。
- 添付モデル画像を優先し、シンプルでかわいいUIにします。ネコをSVGで描き直しません。
- 端末内保存。ログイン、クラウドDB、外部API、ISBN読取は初期版に不要です。

## 読む順序

1. [ローカル開発引継ぎ](docs/handoff/LOCAL_DEVELOPMENT_HANDOFF.md)
2. [確定仕様と設計上の選択](docs/REQUIREMENTS.md)
3. [UI設計](docs/UI_DESIGN.md)
4. [素材一覧](docs/ASSET_INVENTORY.md)
5. [開発計画](docs/ROADMAP.md)

元画像は [モデル画像](assets/reference/pixel-ui-model.png)、切り出しは `assets/images/` に保存します。元画像の画面内の価格・文言・手順より文章仕様を優先します。

## 保存・バックアップ

実装では同じ端末・同じブラウザ・同じサイトの保存領域を使います。ブラウザデータの消去、プライベートブラウズ、端末故障等で消失する可能性があります。営業終了時にCSVと復元用JSONを端末外へ保存してください。CSVだけでは設定・取消関係を完全復元できません。アプリの配信元URLを変更すると別の保存領域になる点にも注意が必要です。

## GitHub状況

保存先は **[yama-books/book-flea-register](https://github.com/yama-books/book-flea-register) / Public**。2026-10-30 JSTに作成し、仕様書と画像素材を保存する開発準備リポジトリです。App Factoryの [Issue #16](https://github.com/moyashimisosoup/app-factory/issues/16) で追跡します。Factoryの認証境界は変更していません。Pages公開、台帳登録、実機検収は未実施です。
