# CLAUDE.md

## プロジェクト概要

ai-guardian: AI駆動でも非AI駆動でも使える開発支援CLIフレームワーク（Node.js/TypeScript/npm）。
Claude Code の Skills/Hooks/Agents を超える機能を LLM非依存で提供する。

## セッション開始時に必ず読み込むファイル

1. `.ai/CURRENT_CONTEXT.md` → 今どこにいるか・次にやること
2. `.ai/ARCHITECTURE.md` → ディレクトリ構造・設定スキーマ・IF仕様
3. `.ai/REQUIREMENTS.md` → 機能要件・非機能要件

## ディレクトリ構成

```
src/
├── cli.ts                 # エントリポイント（11コマンド登録）
├── commands/              # CLIコマンド（setup/init/watch/review/notify/skill/agent/context/rules/sync）
├── core/                  # コアロジック（config/context/hooks/rules/skills/agents/consensus/detector/generator/template-engine/reviewer/conductor）
├── providers/             # LLMプロバイダ（provider/anthropic/openai/gemini）
├── adapters/              # LLMツール連携（adapter + claude/）
├── notifications/         # 通知（macos/slack）
└── utils/                 # ユーティリティ（logger/pid/frontmatter/glob-matcher）
tests/                     # vitest テスト（9ファイル・54テスト）
templates/                 # init用テンプレート（.ai/配下 + skills/agents/rules）
```

## 作業ルール

1. 実装前に `.ai/ARCHITECTURE.md` の構成に従う
2. 設計上の判断をした場合は `.ai/DECISIONS.md` に追記する
3. 各タスク完了後に `.ai/CURRENT_CONTEXT.md` を更新する
4. セッション終了時に次のセッションで再開できる状態に `.ai/CURRENT_CONTEXT.md` を整える
5. テストを書く — `npm test` で全パスを確認してから完了とする

## PLANモードで止まる条件

コードを書く前にPLANモードで確認を求める:
- 要件が曖昧なとき
- `.ai/ARCHITECTURE.md` に定義されていない設計判断が必要なとき
- IF仕様の変更が必要なとき
- タスクの前提が崩れているとき

## チャットに戻す条件

`.ai/CURRENT_CONTEXT.md` の「チャットに戻す条件」に該当する場合は、
CURRENT_CONTEXT.mdを更新してセッションを終了し、チャットで再検討する。

## 技術スタック

- 言語: TypeScript / Node.js (ES2020, CommonJS)
- CLI: commander
- ファイル監視: chokidar
- HTTP: axios
- 設定: js-yaml
- Glob: minimatch
- テスト: vitest
- パッケージ配布: npm (`bin` 設定でグローバルインストール対応)
- 対応OS: macOS（メイン）/ Linux

## ビルド・テスト

```bash
npm run build    # TypeScript コンパイル
npm test         # vitest 実行（54テスト）
npm run dev      # ts-node で開発実行
```
