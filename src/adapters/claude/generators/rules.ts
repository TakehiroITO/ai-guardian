import { loadRules } from '../../../core/rules';
import { GeneratedFile } from '../../adapter';
import { ProjectInfo } from '../../../core/detector';

export function generateRuleFiles(projectDir: string): GeneratedFile[] {
  const rules = loadRules(projectDir);
  const files: GeneratedFile[] = [];

  for (const rule of rules) {
    const claudeRuleContent = `---
description: "${rule.name} (${rule.severity})"
globs: ${JSON.stringify(rule.paths)}
---

${rule.content}
`;

    files.push({
      path: `.claude/rules/guardian-${rule.name}.md`,
      content: claudeRuleContent,
    });
  }

  return files;
}

export function generateClaudeMd(projectInfo?: ProjectInfo): string {
  const projectName = projectInfo?.name || '';
  const stackDesc = projectInfo
    ? [
        ...projectInfo.stack.languages,
        ...projectInfo.frameworks,
      ].filter(Boolean).join(' / ')
    : '';

  return `# CLAUDE.md

## プロジェクト概要

${projectName ? `プロジェクト名: ${projectName}` : '<!-- プロジェクト名を記述 -->'}
${stackDesc ? `技術スタック: ${stackDesc}` : ''}

詳細は \`.ai/PROJECT.md\` を参照。

## セッション開始時

まず \`ai-guardian context sync\` を実行してコンテキストを同期し、以下のファイルを読み込む:

1. \`.ai/CURRENT_CONTEXT.md\` → 今どこにいるか・次にやること
2. \`.ai/ARCHITECTURE.md\` → ディレクトリ構造・設定スキーマ・IF仕様
3. \`.ai/REQUIREMENTS.md\` → 機能要件・非機能要件

## 作業ルール

1. 実装前に \`.ai/ARCHITECTURE.md\` の構成に従う
2. 設計上の判断をした場合は \`.ai/DECISIONS.md\` に追記する
3. 各タスク完了後に \`.ai/CURRENT_CONTEXT.md\` を更新する
4. セッション終了時に次のセッションで再開できる状態に \`.ai/CURRENT_CONTEXT.md\` を整える

## PLANモードで止まる条件

コードを書く前にPLANモードで確認を求める:
- 要件が曖昧なとき
- \`.ai/ARCHITECTURE.md\` に定義されていない設計判断が必要なとき
- IF仕様の変更が必要なとき
- タスクの前提が崩れているとき

## チャットに戻す条件

\`.ai/CURRENT_CONTEXT.md\` の「チャットに戻す条件」に該当する場合は、
CURRENT_CONTEXT.mdを更新してセッションを終了し、チャットで再検討する。

## ai-guardian コマンド

このプロジェクトは ai-guardian で管理されています。

\`\`\`bash
ai-guardian skill <name>                    # スキル実行
ai-guardian agent <name> --input <text>     # エージェント実行
ai-guardian rules list                      # ルール一覧
ai-guardian rules test --file <path>        # ルール検証
ai-guardian context sync                    # コンテキスト同期
ai-guardian context diff                    # 変更差分
ai-guardian review --target <file> --type <type>  # レビュー
ai-guardian sync --agent claude             # Claude連携ファイル再生成
\`\`\`

## ルール

\`.claude/rules/guardian-*.md\` は ai-guardian が生成したルールファイルです。
ルールの編集は \`.ai/rules/\` で行い、\`ai-guardian sync\` で反映してください。
`;
}
