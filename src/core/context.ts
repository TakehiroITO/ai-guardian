import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { GuardianConfig } from './config';
import { getProvider } from '../providers/provider';
import { logger } from '../utils/logger';

const AI_DIR = '.ai';

const CONTEXT_FILES = [
  'PROJECT.md',
  'REQUIREMENTS.md',
  'ARCHITECTURE.md',
  'DECISIONS.md',
  'CURRENT_CONTEXT.md',
] as const;

type ContextFileName = typeof CONTEXT_FILES[number];

export function getAiDir(projectDir: string): string {
  return path.join(projectDir, AI_DIR);
}

export function getContextFilePath(projectDir: string, fileName: ContextFileName): string {
  return path.join(getAiDir(projectDir), fileName);
}

export function readContextFile(projectDir: string, fileName: ContextFileName): string | null {
  const filePath = getContextFilePath(projectDir, fileName);
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    logger.debug(`Context file not found: ${filePath}`);
    return null;
  }
}

export function writeContextFile(projectDir: string, fileName: ContextFileName, content: string): void {
  const aiDir = getAiDir(projectDir);
  if (!fs.existsSync(aiDir)) {
    fs.mkdirSync(aiDir, { recursive: true });
  }
  const filePath = getContextFilePath(projectDir, fileName);
  fs.writeFileSync(filePath, content, 'utf-8');
  logger.debug(`Written context file: ${filePath}`);
}

export function ensureReviewsDir(projectDir: string): string {
  const reviewsDir = path.join(getAiDir(projectDir), 'reviews');
  if (!fs.existsSync(reviewsDir)) {
    fs.mkdirSync(reviewsDir, { recursive: true });
  }
  return reviewsDir;
}

export function writeReviewResult(projectDir: string, fileName: string, content: string): string {
  const reviewsDir = ensureReviewsDir(projectDir);
  const filePath = path.join(reviewsDir, fileName);
  fs.writeFileSync(filePath, content, 'utf-8');
  logger.info(`Review result written to: ${filePath}`);
  return filePath;
}

export function aiDirExists(projectDir: string): boolean {
  return fs.existsSync(getAiDir(projectDir));
}

// --- Phase 2 extensions ---

export function syncContext(projectDir: string): void {
  const aiDir = getAiDir(projectDir);
  if (!fs.existsSync(aiDir)) {
    logger.warn('.ai/ directory not found. Run "ai-guardian init" first.');
    return;
  }

  // Check git status
  try {
    const gitStatus = execSync('git status --porcelain', { cwd: projectDir, encoding: 'utf-8' });
    const aiChanges = gitStatus.split('\n').filter((line) => line.includes('.ai/'));
    if (aiChanges.length > 0) {
      logger.info(`Context files with uncommitted changes:`);
      for (const change of aiChanges) {
        logger.info(`  ${change.trim()}`);
      }
    } else {
      logger.info('All context files are in sync with git.');
    }
  } catch {
    logger.debug('Not a git repository or git not available.');
  }

  // Verify all expected context files exist
  for (const fileName of CONTEXT_FILES) {
    const filePath = getContextFilePath(projectDir, fileName);
    if (!fs.existsSync(filePath)) {
      logger.warn(`Missing context file: ${fileName}`);
    }
  }
}

export function diffContext(projectDir: string): string {
  const snapshotsDir = path.join(getAiDir(projectDir), 'snapshots');

  // Try git diff first
  try {
    const diff = execSync('git diff -- .ai/', { cwd: projectDir, encoding: 'utf-8' });
    if (diff.trim()) {
      return diff;
    }
  } catch {
    // Not a git repo, try snapshot comparison
  }

  // Find latest snapshot
  if (fs.existsSync(snapshotsDir)) {
    const snapshots = fs.readdirSync(snapshotsDir)
      .filter((d) => fs.statSync(path.join(snapshotsDir, d)).isDirectory())
      .sort()
      .reverse();

    if (snapshots.length > 0) {
      const latestSnapshot = path.join(snapshotsDir, snapshots[0]);
      const diffs: string[] = [];

      for (const fileName of CONTEXT_FILES) {
        const currentPath = getContextFilePath(projectDir, fileName);
        const snapshotPath = path.join(latestSnapshot, fileName);

        const currentContent = fs.existsSync(currentPath) ? fs.readFileSync(currentPath, 'utf-8') : '';
        const snapshotContent = fs.existsSync(snapshotPath) ? fs.readFileSync(snapshotPath, 'utf-8') : '';

        if (currentContent !== snapshotContent) {
          diffs.push(`--- ${fileName} has changed since snapshot "${snapshots[0]}"`);
        }
      }

      return diffs.length > 0 ? diffs.join('\n') : 'No changes since last snapshot.';
    }
  }

  return 'No previous snapshot found. Use "ai-guardian context snapshot" to create one.';
}

export function snapshotContext(projectDir: string, label?: string): string {
  const aiDir = getAiDir(projectDir);
  const snapshotsDir = path.join(aiDir, 'snapshots');

  if (!fs.existsSync(snapshotsDir)) {
    fs.mkdirSync(snapshotsDir, { recursive: true });
  }

  // Generate label
  let snapshotLabel = label;
  if (!snapshotLabel) {
    try {
      const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: projectDir, encoding: 'utf-8' }).trim();
      snapshotLabel = `${branch}-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    } catch {
      snapshotLabel = `snapshot-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    }
  }

  const snapshotDir = path.join(snapshotsDir, snapshotLabel);
  fs.mkdirSync(snapshotDir, { recursive: true });

  for (const fileName of CONTEXT_FILES) {
    const sourcePath = getContextFilePath(projectDir, fileName);
    if (fs.existsSync(sourcePath)) {
      const destPath = path.join(snapshotDir, fileName);
      fs.copyFileSync(sourcePath, destPath);
    }
  }

  logger.info(`Snapshot saved: ${snapshotLabel}`);
  return snapshotLabel;
}

const COMPRESS_PROMPT = `あなたはプロジェクトドキュメントの要約者です。
以下のコンテキストファイルの内容を、重要な情報を失わずに圧縮してください。

ルール:
- 決定事項・設計方針・未解決の問題は必ず残す
- 完了済みタスクの詳細は箇条書きに圧縮する
- コード例やコマンド例はそのまま残す
- Markdown構造（見出し・リスト）を維持する
- 元のファイル形式（セクション構成）を維持する

圧縮前の文字数と圧縮後の文字数を最後に記載してください。`;

export async function compressContext(projectDir: string, config: GuardianConfig): Promise<void> {
  const aiDir = getAiDir(projectDir);
  if (!fs.existsSync(aiDir)) {
    logger.warn('.ai/ directory not found.');
    return;
  }

  // Snapshot before compressing
  const label = snapshotContext(projectDir, `pre-compress-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  logger.info(`Pre-compression snapshot saved: ${label}`);

  const compressibleFiles: typeof CONTEXT_FILES[number][] = ['CURRENT_CONTEXT.md', 'DECISIONS.md'];

  for (const fileName of compressibleFiles) {
    const content = readContextFile(projectDir, fileName);
    if (!content || content.length < 1000) {
      logger.debug(`Skipping ${fileName} (too short to compress)`);
      continue;
    }

    logger.info(`Compressing ${fileName} (${content.length} chars)...`);

    try {
      const provider = getProvider('anthropic', config);
      const compressed = await provider.chat({
        system: COMPRESS_PROMPT,
        userMessage: `ファイル名: ${fileName}\n\n${content}`,
        model: 'claude-haiku-4-5-20251001',
        maxTokens: 4096,
      });

      writeContextFile(projectDir, fileName, compressed);
      logger.info(`Compressed ${fileName}: ${content.length} -> ${compressed.length} chars (${((1 - compressed.length / content.length) * 100).toFixed(0)}% reduction)`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to compress ${fileName}: ${msg}`);
    }
  }
}
