# CURRENT_CONTEXT.md

更新日時: 2026-05-19

## 今何をしているか

v0.2.0 (session 機能) を GitHub にプッシュ完了（2026-05-20）。
v0.1.1 のシークレット除去 amend → v0.2.0 commit → push -u origin main すべて成功。
GitHub: https://github.com/TakehiroITO/ai-guardian

**次の作業**: 漏洩した旧 npm トークンの revoke + v0.2.0 の npm 公開。

### v0.2.0 で追加した内容
- `ai-guardian session start/complete/check/status` の4サブコマンド
- `.ai/.session.log` (JSONL) によるセッション/タスク追跡
- `session check` でクラッシュ検出 + git status + verify_command + context sync を実行
- verify_command 自動検出: `package.json` scripts.build → cargo → go
- Claude アダプタ: SessionStart hook で `session check`、SessionEnd hook で `session complete --type session`
- CLAUDE.md テンプレ: タスク着手/完了時に `session start --task` / `session complete` を呼ぶ指示を追加
- `.ai-guardian.yaml` テンプレに `session:` セクション追加
- init 実行時にユーザの `.gitignore` へ `.ai/.session.log` を追記
- tests/session.test.ts (13テスト追加) — 全72テストグリーン

### 次回セッション最初にやること
1. 漏洩した旧 npm トークンの revoke + 新トークン発行（**ユーザ作業**: https://www.npmjs.com/）
2. 新トークンで v0.2.0 を npm 公開
3. v0.2.0 の動作確認（実プロジェクトで `init` → `sync --agent claude` → Claude Code 起動で SessionStart/SessionEnd hook が動くか）

## v0.1.1 積み残し（v0.2.0 公開前に解消必要）

GitHub Push Protection で初回プッシュ失敗:
1. `git rm --cached .claude/settings.local.json` 済み（status上 `D` 表示）
2. `.gitignore` に `.claude/settings.local.json` 追加済み
3. **未完了**: シークレットを含むコミットを修正してプッシュ
4. **未完了**: 漏洩した旧 npm トークンを revoke して再発行

## プッシュ未完了の理由と次のアクション

`.claude/settings.local.json` にnpmトークンが含まれた状態でコミットしたため、
GitHub Push Protection にブロックされた。

### 途中まで完了した作業:
1. `git rm --cached .claude/settings.local.json` 済み
2. `.gitignore` に `.claude/settings.local.json` を追加済み

### 次回セッションで最初にやること:
1. `.gitignore` の変更とsettings.local.json除去をコミットし直す
   ```bash
   git add .gitignore
   git commit --amend  # シークレットを含むコミットを修正
   git push -u origin main
   ```
2. プッシュが成功することを確認
3. npm トークン（漏洩した旧トークン）は npm Web で **revoke して再発行** することを推奨

## v0.1.1 での変更内容

1. **PreSession フック削除** (`src/adapters/claude/generators/hooks.ts`)
   - `PreSession` は Claude Code の有効なフックイベントではなかった
   - 代わりに CLAUDE.md の指示でセッション開始時に `ai-guardian context sync` を実行する方式に変更

2. **CLAUDE.md テンプレート更新** (`src/adapters/claude/generators/rules.ts`)
   - 「セッション開始時に必ず読み込むファイル」→「セッション開始時」に変更
   - `ai-guardian context sync` 実行の指示を追加

3. **settings.local.json マージ対応** (`src/adapters/claude/index.ts`)
   - sync 時に settings.local.json を全上書きしていたバグを修正
   - 既存の permissions 等を保持し、hooks のみ更新するように変更

4. **バージョン** `0.1.0` → `0.1.1`

## 完了していること

### フェーズ1: 初期実装（2026-02-23完了）
- プロジェクト全体設計（2コンポーネント構成）
- ai-guardianの機能要件定義
- ai-conductorとのREST IF仕様
- 技術スタック決定（Node.js/TypeScript/npm）
- デーモン管理方針（PID/タイムアウト/通知）
- 設定継承モデル（グローバル/プロジェクト）
- 全コアモジュール・コマンド実装
- ビルド成功・CLI基本動作確認済み

### フェーズ2: 設計見直し〜Phase 2c（2026-04-23完了）
- Claude Code Skills/Hooks/Agents の機能調査
- LLM非依存コア + LLM別アダプタ方式
- 基盤層・コア機能・アダプタ層の実装

### 応答様態チューニング機能（2026-05-02完了）
- response-style プロンプト注入機能

### v0.1.1 バグフィックス（2026-05-07完了）
- PreSession フック削除・CLAUDE.md指示方式へ変更
- settings.local.json マージ対応
- npm 公開済み、GitHub プッシュ未完了

### v0.2.0 session 機能（2026-05-19ローカル完了）
- session start/complete/check/status コマンド実装
- クラッシュ検出 (`*_start` に対応する `*_complete` なし) で警告
- Claude SessionStart/SessionEnd hook 自動生成
- CLAUDE.md テンプレ更新
- 全72テストグリーン、ビルド成功

## 次にやること

### 即時（次回セッション冒頭）
- GitHub へのプッシュ完了
- npm トークンの revoke と再発行

### Phase 2d: 強化機能の実装（後回し可）
- hooks の複合トリガー・状態管理の高度化
- skills のスキルチェーン
- agents の専門性自動ルーティング・合議アルゴリズム
- rules のプログラム検証（pattern/command型）・矛盾検出
- context の compress（LLMによる要約）

### その他
- Cursor/Copilotアダプタの実装
- ChatGPT/Gemini アダプタでもセッション開始時指示を統一

## 未解決の問題・判断待ち

- Cursor/Copilot向けアダプタの具体的な生成内容（各ツールの仕様調査が必要）
- context compressのLLM呼び出し仕様
- agents の合議アルゴリズムの具体的な実装方針

## チャットに戻す条件

- ai-conductorの設計を詰める必要が生じた場合
- IF仕様に変更が必要な場合
- Cursor/Copilot向けアダプタの仕様が不明な場合
