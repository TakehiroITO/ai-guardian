# CURRENT_CONTEXT.md

更新日時: 2026-05-26

## 今何をしているか

v0.2.0 (session 機能) を npm に公開完了 + GitHub プッシュ完了。
- npm: `@mohican/ai-guardian@0.2.0` (latest) — 2026-05-26 公開
- GitHub: https://github.com/TakehiroITO/ai-guardian (`3d9a882` が最新)
- 全72テストグリーン、ビルド成功

トークン漏洩リスクも全て解消済み（後述）。

## 次回セッションで最初にやること

1. **Trusted Publishing への移行**（このセッションで合意済み、次回着手）
   - `.github/workflows/publish.yml` 作成（タグ push → npm publish with provenance）
   - npmjs.com の package settings で `TakehiroITO/ai-guardian` の `publish.yml` を Trusted Publisher として登録
   - README に「リリース手順: `npm version <patch|minor|major>` → `git push --follow-tags`」追記
   - 以後 publish に長期トークン不要 → 今回のような事故が構造的に起こらなくなる

2. v0.2.0 の動作確認（別プロジェクトで `init` → `sync --agent claude` → Claude Code 起動で SessionStart/SessionEnd hook が実際に走るか）

3. （任意）v0.2.0 の git タグを切る:
   ```bash
   git tag v0.2.0 23bdff8 -m "Release v0.2.0: session lifecycle tracking"
   git push origin v0.2.0
   ```
   `23bdff8` が v0.2.0 として npm 公開した commit（`3d9a882` は post-release の context 更新）。

## 完了していること

### フェーズ1: 初期実装（2026-02-23完了）
プロジェクト全体設計、機能要件定義、技術スタック決定、コアモジュール実装。

### フェーズ2: 設計見直し〜Phase 2c（2026-04-23完了）
LLM非依存コア + LLM別アダプタ方式へ。基盤・コア・アダプタ層実装。

### 応答様態チューニング（2026-05-02完了）
response-style プロンプト注入機能。

### v0.1.1 リリース（2026-05-07 npm 公開、2026-05-20 GitHub 公開）
- PreSession フック削除・CLAUDE.md 指示方式へ変更
- settings.local.json マージ対応
- npm 公開時にトークンを `.claude/settings.local.json` に書いたまま git commit してしまい、
  GitHub Push Protection でブロック → root commit を amend してシークレット除去後にプッシュ
- GitHub: `fe5746b`

### v0.2.0 session 機能リリース（2026-05-26 npm + GitHub 公開）
- 新コマンド: `ai-guardian session start/complete/check/status`
- `.ai/.session.log` (JSONL) でセッション/タスクの start/complete を記録
- `session check`: クラッシュ検出 (`*_start` に対応する `*_complete` 無し) + git status +
  verify_command 実行 + context sync
- verify_command 自動検出: `package.json` scripts.build → `Cargo.toml` → `go.mod`
- Claude アダプタ: SessionStart hook で `session check`、SessionEnd hook で
  `session complete --type session`
- CLAUDE.md テンプレ: タスク着手/完了時に `session start --task` / `session complete` を呼ぶ指示
- `.ai-guardian.yaml` テンプレに `session:` セクション
- init 実行時にユーザの `.gitignore` へ `.ai/.session.log` を自動追記
- tests/session.test.ts 13テスト追加、全72テストグリーン
- GitHub commits: `23bdff8` (実装), `3d9a882` (post-release context update)

### トークン漏洩対策（2026-05-26 完了）
当初 `.claude/settings.local.json` に npm トークン `npm_y7QS...` を平文で書いた状態で
git commit していたため、念のため全レイヤーで対策実施:
- GitHub 公開リポジトリ: そもそも到達せず（Push Protection が阻止、漏洩なし）
- ローカル git 履歴: root commit amend で除去、dangling objects も `gc --prune=now` で完全 purge
- `~/.npmrc`: 旧トークン削除 → 新トークンで再構成 → publish 後に revoke + ファイル空に
- npm 側のトークン: 旧 `y7QS` も含めて全て revoke 済み（`npm token list` で 0 件確認済み）
- 結論: 現時点で有効な publish トークンは存在しない状態。次回 publish は Trusted Publishing で実施予定

## このセッションで学んだこと / 次回に活かしたい

- トークンを `.claude/settings.local.json` のような **git 管理対象になりうるファイル** に書かないこと
  - 環境変数 / OS keychain / `~/.npmrc` (gitignore 外) のいずれかにとどめる
- `~/.npmrc` の自動 token は npm CLI が暗黙的に保存するので、`~/.npmrc` 自体をリポジトリ近傍に置かない
- 一度コミットしたシークレットは `git commit --amend` でハッシュは変わるが、reflog と dangling object に
  残る。完全除去には `git reflog expire --expire=now --all && git gc --prune=now --aggressive` が必要
- npm の publish は 2022 以降デフォルトで 2FA 必須。CLI で `--otp` を渡せない場合は
  granular access token に **「Allow 2FA bypass on publish」** を必ず ON にする
- 長期トークンは原理的に漏洩リスクが残る。CI/CD では **Trusted Publishing (OIDC)** を使うのが現代の正解

## Phase 2d 以降の TODO（後回し可）

- hooks の複合トリガー・状態管理の高度化
- skills のスキルチェーン
- agents の専門性自動ルーティング・合議アルゴリズム
- rules のプログラム検証（pattern/command型）・矛盾検出
- context の compress（LLMによる要約）
- Cursor / Copilot アダプタの実装
- ChatGPT / Gemini アダプタでもセッション開始時指示を統一

## 未解決の問題・判断待ち

- Cursor/Copilot 向けアダプタの具体的な生成内容（各ツールの仕様調査が必要）
- context compress の LLM 呼び出し仕様
- agents の合議アルゴリズムの具体的な実装方針

## チャットに戻す条件

- ai-conductor の設計を詰める必要が生じた場合
- IF 仕様に変更が必要な場合
- Cursor/Copilot 向けアダプタの仕様が不明な場合
