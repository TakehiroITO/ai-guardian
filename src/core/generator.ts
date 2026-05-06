import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { ProjectInfo } from './detector';

export interface GeneratedContextFiles {
  'PROJECT.md': string;
  'ARCHITECTURE.md': string;
  'REQUIREMENTS.md': string;
  'DECISIONS.md': string;
  'CURRENT_CONTEXT.md': string;
}

function today(): string {
  return new Date().toISOString().split('T')[0];
}

function buildStackDescription(info: ProjectInfo): string {
  const parts: string[] = [];
  if (info.stack.languages.length > 0) parts.push(`言語: ${info.stack.languages.join(' / ')}`);
  if (info.stack.runtime) parts.push(`ランタイム: ${info.stack.runtime}`);
  if (info.frameworks.length > 0) parts.push(`フレームワーク: ${info.frameworks.join(' / ')}`);
  if (info.buildTools.length > 0) parts.push(`ビルド: ${info.buildTools.join(' / ')}`);
  if (info.stack.packageManager) parts.push(`パッケージ管理: ${info.stack.packageManager}`);
  return parts.map((p) => `- ${p}`).join('\n');
}

function buildDirectoryTree(info: ProjectInfo, projectDir: string): string {
  const lines: string[] = [`${info.name}/`];

  // Top-level items (dirs first, then files)
  const dirs: string[] = [];
  const files: string[] = [];
  for (const item of info.structure.topLevel) {
    const fullPath = path.join(projectDir, item);
    try {
      if (fs.statSync(fullPath).isDirectory()) {
        dirs.push(item);
      } else {
        files.push(item);
      }
    } catch {
      files.push(item);
    }
  }

  // Show dirs with their immediate children
  for (const dir of dirs.sort()) {
    lines.push(`├── ${dir}/`);
    try {
      const children = fs.readdirSync(path.join(projectDir, dir))
        .filter((f) => !f.startsWith('.') && f !== 'node_modules')
        .slice(0, 8);
      for (let i = 0; i < children.length; i++) {
        const isLast = i === children.length - 1;
        const childPath = path.join(projectDir, dir, children[i]);
        const isDir = fs.existsSync(childPath) && fs.statSync(childPath).isDirectory();
        lines.push(`│   ${isLast ? '└──' : '├──'} ${children[i]}${isDir ? '/' : ''}`);
      }
      const total = fs.readdirSync(path.join(projectDir, dir)).filter((f) => !f.startsWith('.') && f !== 'node_modules').length;
      if (total > 8) {
        lines.push(`│   └── ... (${total - 8} more)`);
      }
    } catch { /* empty */ }
  }

  // Show key files
  for (const file of files.sort().slice(0, 10)) {
    lines.push(`├── ${file}`);
  }

  return lines.join('\n');
}

function buildKeyDependencies(info: ProjectInfo): string {
  const deps = info.stack.dependencies;
  if (Object.keys(deps).length === 0) return '';

  const lines = ['## 主要依存パッケージ', ''];
  const entries = Object.entries(deps).slice(0, 15);
  for (const [name, version] of entries) {
    lines.push(`- \`${name}\`: ${version}`);
  }
  if (Object.keys(deps).length > 15) {
    lines.push(`- ... 他 ${Object.keys(deps).length - 15} パッケージ`);
  }
  return lines.join('\n');
}

export function generateProjectMd(info: ProjectInfo): string {
  const stackDesc = buildStackDescription(info);

  return `# PROJECT.md

## プロジェクト概要

プロジェクト名: ${info.name}
${info.git.remoteUrl ? `リポジトリ: ${info.git.remoteUrl}` : ''}

<!-- このプロジェクトの目的・背景を記述してください -->

## 技術スタック

${stackDesc}

${buildKeyDependencies(info)}

## 設計方針

<!-- このプロジェクトの設計方針を記述してください -->
`;
}

export function generateArchitectureMd(info: ProjectInfo, projectDir: string): string {
  const tree = buildDirectoryTree(info, projectDir);
  const entryPoints = info.structure.entryPoints.length > 0
    ? info.structure.entryPoints.map((e) => `- \`${e}\``).join('\n')
    : '<!-- エントリポイントを記述してください -->';

  const configSection = info.configFiles.length > 0
    ? info.configFiles.map((c) => `- \`${c}\``).join('\n')
    : '<!-- 設定ファイルを記述してください -->';

  return `# ARCHITECTURE.md

## ディレクトリ構造

\`\`\`
${tree}
\`\`\`

## エントリポイント

${entryPoints}

## 設定ファイル

${configSection}

## IF仕様

<!-- インターフェース仕様を記述してください -->
`;
}

export function generateRequirementsMd(info: ProjectInfo): string {
  return `# REQUIREMENTS.md

## 解決する課題

<!-- このプロジェクトが解決する課題を記述してください -->

## 機能要件

<!-- 機能要件を記述してください -->

## 非機能要件

${info.hasTests ? `- テスト: ${info.testDirs.join(', ')} に配置` : '- テスト: 未整備'}
${info.configFiles.includes('Dockerfile') ? '- Docker対応' : ''}
${info.configFiles.some((c) => c.includes('eslint') || c.includes('biome')) ? '- リンター設定済み' : ''}
`;
}

export function generateDecisionsMd(): string {
  return `# DECISIONS.md

## 決定事項ログ

---

### ${today()} ai-guardian導入

**決定:** ai-guardianを導入してコンテキスト管理・レビュー自動化を行う

**理由:**
- AIコーディング時のコンテキスト喪失を防止する
- セッション間の引き継ぎを確実にする
- コードレビューの品質を自動化で担保する
`;
}

export function generateCurrentContextMd(info: ProjectInfo): string {
  let gitStatus = '';
  if (info.git.initialized) {
    gitStatus = `- ブランチ: ${info.git.branch || 'N/A'}`;
    if (info.git.totalCommits > 0) {
      gitStatus += `\n- コミット数: ${info.git.totalCommits}`;
    }
    if (info.git.recentCommitMessages.length > 0) {
      gitStatus += '\n- 直近のコミット:';
      for (const msg of info.git.recentCommitMessages.slice(0, 3)) {
        gitStatus += `\n  - ${msg}`;
      }
    }
  }

  return `# CURRENT_CONTEXT.md

更新日時: ${today()}

## 今何をしているか

ai-guardian を導入した初期状態。

## 完了していること

- ai-guardian init によるプロジェクト構成の初期化
${info.git.initialized ? `\n### Git状態\n${gitStatus}` : ''}

## 次にやること

- PROJECT.md にプロジェクトの目的・背景を記述する
- REQUIREMENTS.md に機能要件を記述する
- ARCHITECTURE.md のIF仕様を記述する
${!info.hasTests ? '- テストの整備' : ''}

## 未解決の問題・判断待ち

<!-- 未解決の問題 -->

## チャットに戻す条件

- 設計上の大きな判断が必要なとき
- 要件が曖昧なとき
- IF仕様の変更が必要なとき
`;
}

export function generateGuardianYaml(info: ProjectInfo): string {
  const stackLine = [
    ...info.stack.languages,
    ...info.frameworks,
  ].join(' / ');

  return `# ai-guardian project configuration
# Global settings (~/.ai-guardian/config.yaml) are used as defaults.
# Only override what differs for this project.

project:
  name: "${info.name}"
  stack: "${stackLine}"

# Project-specific hooks
hooks: []

# Active adapters (uncomment to enable)
# adapters:
#   active: ["claude"]
`;
}

export function generateContextFiles(info: ProjectInfo, projectDir: string): GeneratedContextFiles {
  return {
    'PROJECT.md': generateProjectMd(info),
    'ARCHITECTURE.md': generateArchitectureMd(info, projectDir),
    'REQUIREMENTS.md': generateRequirementsMd(info),
    'DECISIONS.md': generateDecisionsMd(),
    'CURRENT_CONTEXT.md': generateCurrentContextMd(info),
  };
}
