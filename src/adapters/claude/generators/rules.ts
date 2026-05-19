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

SessionStart フックで \`ai-guardian session check\` が自動実行され、次の情報が表示される:
- 前回セッションの未完了タスク（あればクラッシュ疑い警告）
- \`git status\` の差分
- verify コマンド（ビルド等）の成否
- \`.ai/CURRENT_CONTEXT.md\` の内容

その結果を読み、以下を実行する:

1. クラッシュ疑い警告があればコードの破損状況を確認し、ユーザーに報告
2. \`.ai/CURRENT_CONTEXT.md\` / \`.ai/ARCHITECTURE.md\` / \`.ai/REQUIREMENTS.md\` を読み込む
3. 現在の状況と次にやることをユーザーに報告し、次の指示を伺う

## 作業ルール

1. 実装前に \`.ai/ARCHITECTURE.md\` の構成に従う
2. 設計上の判断をした場合は \`.ai/DECISIONS.md\` に追記する
3. **タスク着手時に** \`ai-guardian session start --task "<概要>"\` を実行する
4. **タスク完了時に** \`ai-guardian session complete\` を実行し、続けて \`.ai/CURRENT_CONTEXT.md\` を更新する
5. セッション終了時に次のセッションで再開できる状態に \`.ai/CURRENT_CONTEXT.md\` を整える（SessionEnd フックがセッション自体は自動完了する）

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
ai-guardian session start --task "<text>"   # タスク開始記録
ai-guardian session complete                # タスク/セッション完了記録
ai-guardian session check                   # 再開時診断（クラッシュ検出+verify）
ai-guardian session status                  # 未完了エントリ確認
\`\`\`

## ルール

\`.claude/rules/guardian-*.md\` は ai-guardian が生成したルールファイルです。
ルールの編集は \`.ai/rules/\` で行い、\`ai-guardian sync\` で反映してください。
`;
}
