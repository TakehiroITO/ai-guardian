---
name: review-code
description: コードレビューを実行する
tools: ["ai-guardian review"]
context:
  paths: [".ai/ARCHITECTURE.md"]
  dynamic: true
---

対象ファイルのコードレビューを実行してください。

## アーキテクチャ方針
@.ai/ARCHITECTURE.md

## 最近の変更
!`git diff --stat HEAD~3`!

## プロジェクト情報
- プロジェクト: {{project.name}}
- ブランチ: {{git.branch}}
