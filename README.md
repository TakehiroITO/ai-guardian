# ai-guardian

AI駆動でも非AI駆動でも使える、LLM非依存の開発支援CLIフレームワーク。

Claude Code / Cursor / Copilot などのAIコーディングツールが持つ Skills / Hooks / Agents 機能を超える体験を、特定のLLMに依存せず提供します。

## 解決する課題

- AIコーディング中のコンテキスト喪失（チャット上限・セッション断絶）
- 議論・決定事項が次のセッションに引き継がれない
- コード品質のレビューが手動で面倒
- 特定のLLMツールへのロックイン

## インストール

```bash
npm install -g @mohican/ai-guardian
```

## クイックスタート

```bash
# 1. グローバル設定を初期化（初回のみ）
ai-guardian setup

# 2. プロジェクトで初期化
cd your-project
ai-guardian init

# Claude Code 連携付きで初期化する場合
ai-guardian init --agent claude
```

`init` はプロジェクトの技術スタック・ディレクトリ構造・Git状態を**自動検出**し、実用的なコンテキストファイルを生成します。

## コマンド一覧

| コマンド | 説明 |
|---|---|
| `ai-guardian setup` | グローバル設定（`~/.ai-guardian/`）を初期化 |
| `ai-guardian init` | プロジェクト初期化（`.ai/` + `.ai-guardian.yaml`） |
| `ai-guardian watch start\|stop\|status` | ファイル監視デーモン（hooks発火） |
| `ai-guardian review --target <file> --type <type>` | LLMコードレビュー |
| `ai-guardian notify` | macOS / Slack 通知 |
| `ai-guardian skill <name>` | スキル実行（テンプレート展開→stdout） |
| `ai-guardian agent <name> --input <text>` | エージェント実行（LLM呼び出し） |
| `ai-guardian context sync\|diff\|snapshot\|compress` | コンテキスト管理 |
| `ai-guardian rules list\|test\|validate` | ルール管理・検証 |
| `ai-guardian sync [--agent <llm>]` | LLMツール連携ファイルの再生成 |

## 主な機能

### Skills — テンプレート展開エンジン

Markdown + フロントマターでスキルを定義し、テンプレート構文で動的に展開。

```markdown
---
name: review-code
description: コードレビューを実行する
---

## アーキテクチャ方針
@.ai/ARCHITECTURE.md

## 最近の変更
!`git diff --stat HEAD~3`!

## プロジェクト
- 名前: {{project.name}}
- ブランチ: {{git.branch}}
```

テンプレート構文:
- `` !`command`! `` → シェルコマンド実行結果
- `@path` → ファイル内容埋め込み
- `{{var}}` → プロジェクトメタデータ

**スキルチェーン**: パイプで連結可能

```bash
ai-guardian skill gather-context | ai-guardian skill review-code
```

### Agents — LLMエージェント実行

エージェントを定義し、コンテキストを自動収集してLLMに渡す。

```bash
# 特定のエージェントを実行
ai-guardian agent architecture-reviewer --input "src/core/config.ts を変更したい"

# ファイルパターンから最適なエージェントを自動選択
ai-guardian agent --auto --files "src/api/routes.ts" --input "レビューしてください"
```

### Rules — ルール定義・自動検証

レビュー時のLLM注入だけでなく、正規表現やコマンドによるプログラム検証も可能。

```markdown
---
name: no-any-type
paths: ["src/**/*.ts"]
severity: warning
type: pattern
---

- TypeScriptの any 型を禁止: `/: any/`
```

```bash
ai-guardian rules test --file src/core/config.ts
```

### Hooks — イベント駆動の自動化

ファイル変更・タイムアウト・レビュー完了などのイベントに応じてアクションを自動実行。

```yaml
hooks:
  - name: "auto-review"
    event: "file_change"
    matcher:
      paths: [".ai/CURRENT_CONTEXT.md"]
    action:
      type: "review"
      review_type: "architecture"
    throttle_ms: 60000
```

### Review — マルチプロバイダ合議レビュー

複数のLLM（Claude + GPT + Gemini）で並列レビューし、結果を合議で集約。

```bash
# 単一プロバイダ
ai-guardian review --target src/api.ts --type code

# 3社並列 + 多数決
ai-guardian review --target src/api.ts --type code \
  --providers anthropic,openai,gemini \
  --consensus majority-vote
```

合議戦略: `majority-vote` / `unanimous` / `any`

### Context — コンテキスト管理

```bash
ai-guardian context sync       # git状態と.ai/の整合性確認
ai-guardian context diff       # 前回スナップショットとの差分
ai-guardian context snapshot    # 現在のコンテキストを保存
ai-guardian context compress    # LLMで要約・圧縮
```

## LLMツール連携（アダプタ）

ai-guardianの設定を各LLMツールのネイティブ形式に変換。

```bash
ai-guardian init --agent claude   # Claude Code 向け連携ファイル生成
ai-guardian sync --agent claude   # 設定変更を反映
```

Claude Code アダプタが生成するもの:
- `CLAUDE.md` — プロジェクトコンテキスト
- `.claude/settings.local.json` — Hooks設定
- `.claude/skills/guardian-*.md` — スキル
- `.claude/agents/guardian-*.md` — エージェント
- `.claude/rules/guardian-*.md` — ルール

## 設定

### グローバル設定

`~/.ai-guardian/config.yaml` で全プロジェクト共通の設定を管理。

```yaml
api:
  anthropic_api_key: ""  # または環境変数 ANTHROPIC_API_KEY
  model: claude-opus-4-6
```

### プロジェクト設定

`.ai-guardian.yaml` でプロジェクト固有の設定のみ上書き。

```yaml
project:
  name: "my-app"
  stack: "TypeScript / React"
hooks: []
adapters:
  active: ["claude"]
```

### スコープと優先順位

Skills / Agents / Rules はそれぞれ:

`Global (~/.ai-guardian/)` < `Project (.ai/)` の優先順位。同名定義はProject側が優先。

## 対応LLMプロバイダ

| プロバイダ | APIキー環境変数 |
|---|---|
| Anthropic (Claude) | `ANTHROPIC_API_KEY` |
| OpenAI (GPT) | `OPENAI_API_KEY` |
| Google (Gemini) | `GOOGLE_API_KEY` |

## 開発

```bash
git clone https://github.com/your-org/ai-guardian.git
cd ai-guardian
npm install
npm run build
npm test         # 54 tests
npm link         # ローカルで ai-guardian コマンドを使えるようにする
```

## ライセンス

MIT
