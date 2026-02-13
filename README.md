# SUNABA / mf-cleaner

## 概要
`mf-cleaner.html` は MoneyForward 月次明細を整理する静的ツールです。  
入力 CSV/TSV を正規化し、重複候補を除外した状態でダウンロードできます。

## 並行開発向け構成
責務ごとに分割し、同時編集時の衝突を抑えています。

- `src/core/csv.js`: CSV/TSV 読み込み・区切り判定・エンコード判定
- `src/core/normalize.js`: 日付/金額/説明文正規化、`merchant_key`
- `src/core/dedupe.js`: 重複判定エンジン（`same_source` / `cross_account_1to1` / `cross_account_1to2_points`）
- `src/core/export.js`: CSV/TSV/Excel XML 出力
- `src/ui/state.js`: UI 状態と復元/除外トグル
- `src/ui/render.js`: プレビュー/重複パネル/統計描画
- `src/main.js`: イベント接続と処理オーケストレーション

## ブランチ運用ルール
- レーンA（判定エンジン）: `feature/dedupe-engine-*`
- レーンB（UI/UX）: `feature/ui-*`
- レーンC（I/O互換）: `feature/io-export-*`
- 統合: `refactor/modularize-core` -> `main`

運用ルール:
- 1ブランチ1責務
- PR差分は目安 400行以内
- `main` 直push禁止（統合経由）
- `src/main.js` は統合担当が最終調整

## 回帰確認セット
1. `same_source`: 同日同額同内容の重複が1件に集約される
2. `cross_account_1to1`: 異口座同額（例: `-4990`）が候補化される
3. `cross_account_1to2_points`: Nimaso/JBL 例が候補化される
4. 誤検知防止: 1円差は不成立
5. 誤検知防止: 31日差は不成立
6. 出力互換: CSVヘッダは英字のまま

## 使い方
1. `mf-cleaner.html` をブラウザで開く
2. CSV/TSV を選択し「クリーニング実行」
3. 重複候補を確認し、必要な行は復元
4. ダウンロード形式（CSV/TSV/Excel XML）を選んで保存
