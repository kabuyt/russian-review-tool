# Russian Review Tool

React + TypeScript + Vite 版のロシア語ミニ復習ツールです。

## Features

- ロシア語音声読み上げ（Web Speech API / `ru-RU`）
- LocalStorage による学習履歴と SRS 進捗保存
- 間隔反復カードレビュー
- 会話ログからの自動問題生成
- PWA 対応
- GitHub Pages デプロイ対応

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

`dist/` が GitHub Pages に配信できる静的ファイルです。

## GitHub Pages

このリポジトリを GitHub に push すると、`.github/workflows/deploy.yml` により `main` ブランチへの push で Pages へデプロイできます。
GitHub 側で Pages の source を `GitHub Actions` に設定してください。
