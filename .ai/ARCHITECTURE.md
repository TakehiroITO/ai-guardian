# ARCHITECTURE.md

## ディレクトリ構造

```
src/
├── cli.ts                 # エントリポイント
├── commands/              # CLIコマンド
│   ├── setup.ts / init.ts / sync.ts
│   ├── watch.ts / review.ts / notify.ts
│   ├── skill.ts / agent.ts
│   ├── context-cmd.ts / rules-cmd.ts
│   └── session.ts         # セッション/タスクライフサイクル
├── core/                  # コアロジック (LLM非依存)
│   ├── config.ts / context.ts / detector.ts / generator.ts
│   ├── hooks.ts / rules.ts / skills.ts / agents.ts
│   ├── consensus.ts / reviewer.ts / conductor.ts
│   ├── template-engine.ts
│   └── session.ts         # セッションログ/診断
├── providers/             # LLMプロバイダ
├── adapters/              # LLMツール連携 (claude/)
├── notifications/
└── utils/
templates/                 # init 用テンプレート
tests/                     # vitest テスト
```

## 設定ファイル (`.ai-guardian.yaml`)

```yaml
api:
  anthropic_api_key: ""
  model: claude-opus-4-6

response_style:
  enabled: true
  prompt_file: ~/.ai-guardian/prompts/response-style.md

session:
  enabled: true
  log_file: .ai/.session.log
  verify_command: ""        # 空欄で自動検出
  check_on_start: true

watch:
  timeout_minutes: 120
  debounce_ms: 1000

# 他: notifications / agents / conductor / rules / hooks / adapters / reviewers / project
```

## セッション機能 (v0.2.0〜)

LLM非依存でセッション/タスクのライフサイクルを管理し、再開時にクラッシュ検出と
コード破損チェックを行う。

### コマンド

| コマンド | 用途 |
|---|---|
| `ai-guardian session start [--task "<desc>"]` | セッション/タスク開始記録 |
| `ai-guardian session complete [--type session\|task]` | 直近の未完了エントリを完了 (デフォルトはLIFO) |
| `ai-guardian session check [--skip-verify] [--skip-sync] [--json]` | 再開時診断 + 新セッション開始 |
| `ai-guardian session status [--json]` | 未完了エントリ一覧 |

### ログ形式 (`.ai/.session.log`, JSONL, gitignore対象)

```jsonl
{"type":"session_start","id":"<uuid>","at":"2026-05-18T..."}
{"type":"task_start","id":"<uuid>","at":"...","task":"実装内容"}
{"type":"task_complete","id":"<uuid>","at":"...","refId":"<task_start id>"}
{"type":"session_complete","id":"<uuid>","at":"...","refId":"<session_start id>"}
```

`*_start` に対応する `*_complete` (refId 一致) が無いものを「未完了」とみなし、
複数あれば**クラッシュ疑い**として警告。

### `session check` の動作

1. (デフォルト) `ai-guardian context sync` を自動実行
2. ログから未完了エントリを検出 → あればクラッシュ警告
3. `git status --short` を実行
4. `verify_command` を実行（未設定なら `package.json` の `scripts.build` →
   `Cargo.toml` → `go.mod` の順で自動検出）
5. `.ai/CURRENT_CONTEXT.md` の内容を表示
6. 新しいセッションを開始（`session_start` を記録）

### Claude Code アダプタ連携

`ai-guardian sync --agent claude` で `.claude/settings.local.json` に以下のフックが
自動生成される:

- `SessionStart` → `ai-guardian session check`
- `SessionEnd` → `ai-guardian session complete --type session`

タスク単位の start/complete は CLAUDE.md の指示で LLM が明示的に呼ぶ。

### 非AI利用

ユーザは手動で `session start --task ...` / `session complete` を実行する。
git hook やシェルラッパーでの自動化はオプションとして将来追加予定。

## IF仕様

<!-- ai-conductor との REST IF 仕様を記述 -->
