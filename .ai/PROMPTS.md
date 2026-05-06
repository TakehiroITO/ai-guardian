# Claude Code 起動プロンプト

## 使い方

以下のプロンプトをClaude Code CLIセッション開始時にそのまま貼り付ける。

---

## プロンプト

```
まず以下のファイルを順番に読んでください。

1. .claude/CLAUDE.md
2. .ai/CURRENT_CONTEXT.md
3. .ai/ARCHITECTURE.md
4. .ai/REQUIREMENTS.md

読み終えたら、CURRENT_CONTEXTの「次にやること」に従って実装を開始してください。
不明点や設計判断が必要な場合はPLANモードで確認してください。
```

---

## セッション再開時（中断後）

```
まず .claude/CLAUDE.md と .ai/CURRENT_CONTEXT.md を読んでください。
前回の続きから再開します。
```

---

## レビュー依頼時

```
以下のファイルをレビューしてください。
完了後、ai-guardian review コマンドで結果を .ai/reviews/ に書き出してください。

対象: <ファイルパス>
種別: code | architecture | requirements | task
```

---

## チャットへの引き継ぎ時

Claude Codeで問題が発生した場合は `.ai/CURRENT_CONTEXT.md` を更新後、
チャットで以下のように貼り付ける。

```
.ai/CURRENT_CONTEXT.md を読んでください。
問題の種類: 設計 | 要件 | アーキテクチャ | IF仕様

<問題の概要を1-3行で記述>

議論して結論が出たら、CURRENT_CONTEXT.md と該当ファイル（REQUIREMENTS/ARCHITECTURE/DECISIONS）
への反映内容をテキストで出力してください。
```
