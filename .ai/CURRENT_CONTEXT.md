# CURRENT_CONTEXT.md

更新日時: 2026-04-28

## 今何をしているか

v0.1.0 を npm に公開済み (`@mohican/ai-guardian`)。
Phase 2 全体（2a/2b/2c/2d）の実装・テスト・README・CLAUDE.md 整備が完了。

## 完了していること

### フェーズ1: 初期実装（2026-02-23完了）
- プロジェクト全体設計（2コンポーネント構成）
- ai-guardianの機能要件定義
- ai-conductorとのREST IF仕様
- 技術スタック決定（Node.js/TypeScript/npm）
- デーモン管理方針（PID/タイムアウト/通知）
- 設定継承モデル（グローバル/プロジェクト）
- **src/utils/logger.ts** - ログ出力ユーティリティ
- **src/utils/pid.ts** - PIDファイル管理
- **src/core/config.ts** - 設定読み込みと継承処理
- **src/core/context.ts** - .ai/ファイル群の読み書き
- **src/commands/init.ts** - `ai-guardian init`
- **templates/** - initコマンド用テンプレートファイル群
- **src/commands/watch.ts** - `ai-guardian watch start/stop/status`
- **src/notifications/macos.ts** - macOS通知
- **src/notifications/slack.ts** - Slack Webhook送信
- **src/commands/notify.ts** - `ai-guardian notify`
- **src/core/reviewer.ts** - ローカルレビュー実行（Anthropic API）
- **src/core/conductor.ts** - ai-conductor RESTクライアント
- **src/commands/review.ts** - `ai-guardian review`
- **src/cli.ts** - エントリポイント
- ビルド成功・CLI基本動作確認済み

### フェーズ2: 設計見直し（2026-04-17完了）
- Claude Code Skills/Hooks/Agents の機能調査
- LLM非依存コア + LLM別アダプタ方式の決定（DECISIONS.md記録済み）
- ARCHITECTURE.md 更新
- REQUIREMENTS.md 更新

### Phase 2a: 基盤層（2026-04-23完了）
- **src/utils/frontmatter.ts** - Markdownフロントマター解析（自前実装）
- **src/utils/glob-matcher.ts** - globパターンマッチング（minimatch）
- **src/core/template-engine.ts** - テンプレート展開エンジン（!`cmd`! / @path / {{var}}）
- **src/providers/provider.ts** - LLMProvider共通インターフェース + ファクトリ
- **src/providers/anthropic.ts** - Anthropicプロバイダ
- **src/providers/openai.ts** - OpenAIプロバイダ
- **src/providers/gemini.ts** - Geminiプロバイダ
- **src/core/config.ts** 拡張 - HookConfig, AdaptersConfig, ContextConfig追加
- **src/core/reviewer.ts** リファクタ - Provider経由に変更（後方互換維持）

### Phase 2b: コア機能（2026-04-23完了）
- **src/core/hooks.ts** - HooksEngine（イベントマッチ・アクション実行・throttle・状態管理・compose）
- **src/core/rules.ts** - ルールローダー（Global/Project、パスマッチ、バリデーション）
- **src/commands/watch.ts** リファクタ - HooksEngine経由に変更
- **src/commands/rules-cmd.ts** - `ai-guardian rules list/test/validate`
- **src/core/skills.ts** - Skillsローダー・テンプレート展開
- **src/commands/skill.ts** - `ai-guardian skill <name> / --list`
- **src/core/agents.ts** - Agents定義・LLM呼び出し・コンテキスト収集
- **src/commands/agent.ts** - `ai-guardian agent <name> / --list`
- **src/core/context.ts** 拡張 - syncContext, diffContext, snapshotContext
- **src/commands/context-cmd.ts** - `ai-guardian context sync/diff/snapshot/compress`
- **src/cli.ts** 更新 - 5新コマンド登録（skill/agent/context/rules/sync）

### Phase 2c: アダプタ層（2026-04-23完了）
- **src/adapters/adapter.ts** - LLMAdapter共通インターフェース + ファクトリ
- **src/adapters/claude/generators/hooks.ts** - Claude Code hooks生成
- **src/adapters/claude/generators/skills.ts** - Claude Code skills生成
- **src/adapters/claude/generators/agents.ts** - Claude Code agents生成
- **src/adapters/claude/generators/rules.ts** - Claude Code rules生成
- **src/adapters/claude/index.ts** - ClaudeAdapter（detect/generate/sync）
- **src/commands/init.ts** 更新 - --agentオプション追加
- **src/commands/sync.ts** - `ai-guardian sync [--agent <llm>]`
- テンプレートファイル追加（skills/agents/rules）

### 応答様態チューニング機能（2026-05-02完了）
- **src/core/response-style.ts** - 応答様態プロンプトの読み込み・注入
- **prompts/response-style.md** - デフォルトの応答様態プロンプト（確信度別表現・冷静評価・根拠提示）
- **src/core/config.ts** 拡張 - `response_style` 設定（enabled/prompt_file）
- **src/core/reviewer.ts** 更新 - レビュー時にresponse styleを注入
- **src/core/agents.ts** 更新 - エージェント実行時にresponse styleを注入
- **tests/response-style.test.ts** - 5テスト追加（合計59テスト）

## 次にやること

### Phase 2d: 強化機能の実装（後回し可）
- hooks の複合トリガー・状態管理の高度化
- skills のスキルチェーン
- agents の専門性自動ルーティング・合議アルゴリズム
- rules のプログラム検証（pattern/command型）・矛盾検出
- context の compress（LLMによる要約）

### テスト・品質
- ユニットテスト追加（vitest検討）
- npmパッケージとしてのインストールテスト
- 実プロジェクトでの統合テスト

### その他
- Cursor/Copilotアダプタの実装
- README.md作成

## 未解決の問題・判断待ち

- Cursor/Copilot向けアダプタの具体的な生成内容（各ツールの仕様調査が必要）
- context compressのLLM呼び出し仕様
- agents の合議アルゴリズムの具体的な実装方針

## チャットに戻す条件

- ai-conductorの設計を詰める必要が生じた場合
- IF仕様に変更が必要な場合
- Cursor/Copilot向けアダプタの仕様が不明な場合
