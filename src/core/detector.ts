import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';

export interface ProjectInfo {
  name: string;
  stack: StackInfo;
  structure: DirectoryStructure;
  git: GitInfo;
  frameworks: string[];
  buildTools: string[];
  hasTests: boolean;
  testDirs: string[];
  configFiles: string[];
}

export interface StackInfo {
  languages: string[];
  runtime: string;
  packageManager: string;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
}

export interface DirectoryStructure {
  topLevel: string[];
  srcDirs: string[];
  entryPoints: string[];
  depth: number;
}

export interface GitInfo {
  initialized: boolean;
  branch: string;
  remoteUrl: string;
  totalCommits: number;
  recentCommitMessages: string[];
  hasUncommittedChanges: boolean;
}

function execSafe(cmd: string, cwd: string): string {
  try {
    return execSync(cmd, { cwd, encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return '';
  }
}

function detectStackFromPackageJson(projectDir: string): Partial<StackInfo> & { name?: string; frameworks: string[]; buildTools: string[] } {
  const pkgPath = path.join(projectDir, 'package.json');
  if (!fs.existsSync(pkgPath)) return { languages: [], frameworks: [], buildTools: [] };

  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const deps = pkg.dependencies || {};
    const devDeps = pkg.devDependencies || {};
    const allDeps = { ...deps, ...devDeps };

    const languages: string[] = [];
    if (allDeps.typescript || allDeps['ts-node'] || fs.existsSync(path.join(projectDir, 'tsconfig.json'))) {
      languages.push('TypeScript');
    }
    languages.push('JavaScript');

    const frameworks: string[] = [];
    if (allDeps.react) frameworks.push('React');
    if (allDeps.next) frameworks.push('Next.js');
    if (allDeps.vue) frameworks.push('Vue');
    if (allDeps.nuxt) frameworks.push('Nuxt');
    if (allDeps.svelte) frameworks.push('Svelte');
    if (allDeps.angular || allDeps['@angular/core']) frameworks.push('Angular');
    if (allDeps.express) frameworks.push('Express');
    if (allDeps.fastify) frameworks.push('Fastify');
    if (allDeps.nestjs || allDeps['@nestjs/core']) frameworks.push('NestJS');
    if (allDeps.hono) frameworks.push('Hono');
    if (allDeps.electron) frameworks.push('Electron');

    const buildTools: string[] = [];
    if (allDeps.vite) buildTools.push('Vite');
    if (allDeps.webpack) buildTools.push('webpack');
    if (allDeps.esbuild) buildTools.push('esbuild');
    if (allDeps.rollup) buildTools.push('Rollup');
    if (allDeps.turbo || allDeps.turbopack) buildTools.push('Turbo');

    let packageManager = 'npm';
    if (fs.existsSync(path.join(projectDir, 'pnpm-lock.yaml'))) packageManager = 'pnpm';
    else if (fs.existsSync(path.join(projectDir, 'yarn.lock'))) packageManager = 'yarn';
    else if (fs.existsSync(path.join(projectDir, 'bun.lockb'))) packageManager = 'bun';

    return {
      name: pkg.name,
      languages,
      runtime: 'Node.js',
      packageManager,
      dependencies: deps,
      devDependencies: devDeps,
      frameworks,
      buildTools,
    };
  } catch {
    return { languages: ['JavaScript'], frameworks: [], buildTools: [] };
  }
}

function detectStackFromOtherManifests(projectDir: string): Partial<StackInfo> & { name?: string; frameworks: string[]; buildTools: string[] } {
  // Rust
  if (fs.existsSync(path.join(projectDir, 'Cargo.toml'))) {
    const cargo = fs.readFileSync(path.join(projectDir, 'Cargo.toml'), 'utf-8');
    const nameMatch = cargo.match(/name\s*=\s*"([^"]+)"/);
    return {
      name: nameMatch?.[1],
      languages: ['Rust'],
      runtime: 'Rust',
      packageManager: 'cargo',
      frameworks: [],
      buildTools: ['cargo'],
    };
  }

  // Go
  if (fs.existsSync(path.join(projectDir, 'go.mod'))) {
    const goMod = fs.readFileSync(path.join(projectDir, 'go.mod'), 'utf-8');
    const moduleMatch = goMod.match(/module\s+(\S+)/);
    return {
      name: moduleMatch?.[1]?.split('/').pop(),
      languages: ['Go'],
      runtime: 'Go',
      packageManager: 'go modules',
      frameworks: [],
      buildTools: ['go'],
    };
  }

  // Python
  if (fs.existsSync(path.join(projectDir, 'pyproject.toml')) || fs.existsSync(path.join(projectDir, 'setup.py'))) {
    const frameworks: string[] = [];
    const reqFiles = ['requirements.txt', 'pyproject.toml'];
    for (const reqFile of reqFiles) {
      const reqPath = path.join(projectDir, reqFile);
      if (fs.existsSync(reqPath)) {
        const content = fs.readFileSync(reqPath, 'utf-8');
        if (content.includes('django')) frameworks.push('Django');
        if (content.includes('flask')) frameworks.push('Flask');
        if (content.includes('fastapi')) frameworks.push('FastAPI');
      }
    }

    let pm = 'pip';
    if (fs.existsSync(path.join(projectDir, 'poetry.lock'))) pm = 'poetry';
    else if (fs.existsSync(path.join(projectDir, 'Pipfile'))) pm = 'pipenv';
    else if (fs.existsSync(path.join(projectDir, 'uv.lock'))) pm = 'uv';

    return {
      name: path.basename(projectDir),
      languages: ['Python'],
      runtime: 'Python',
      packageManager: pm,
      frameworks,
      buildTools: [],
    };
  }

  // Java/Kotlin
  if (fs.existsSync(path.join(projectDir, 'pom.xml'))) {
    return { name: path.basename(projectDir), languages: ['Java'], runtime: 'JVM', packageManager: 'maven', frameworks: [], buildTools: ['Maven'] };
  }
  if (fs.existsSync(path.join(projectDir, 'build.gradle')) || fs.existsSync(path.join(projectDir, 'build.gradle.kts'))) {
    const lang = fs.existsSync(path.join(projectDir, 'build.gradle.kts')) ? 'Kotlin' : 'Java';
    return { name: path.basename(projectDir), languages: [lang], runtime: 'JVM', packageManager: 'gradle', frameworks: [], buildTools: ['Gradle'] };
  }

  return { languages: [], frameworks: [], buildTools: [] };
}

function detectDirectoryStructure(projectDir: string): DirectoryStructure {
  const ignores = new Set(['node_modules', '.git', '.ai', '.claude', 'dist', 'build', 'out', '.next', '__pycache__', 'target', 'vendor', '.idea', '.vscode']);

  let topLevel: string[] = [];
  try {
    topLevel = fs.readdirSync(projectDir).filter((f) => !ignores.has(f) && !f.startsWith('.'));
  } catch { /* empty */ }

  const srcDirs: string[] = [];
  const entryPoints: string[] = [];
  const commonSrcDirs = ['src', 'lib', 'app', 'pages', 'components', 'api', 'server', 'client', 'pkg', 'cmd', 'internal'];

  for (const dir of commonSrcDirs) {
    if (fs.existsSync(path.join(projectDir, dir)) && fs.statSync(path.join(projectDir, dir)).isDirectory()) {
      srcDirs.push(dir);
    }
  }

  const commonEntries = ['src/index.ts', 'src/main.ts', 'src/app.ts', 'src/cli.ts', 'src/index.js', 'src/main.js', 'index.ts', 'index.js', 'main.go', 'src/main.rs', 'src/lib.rs', 'app/main.py', 'main.py'];
  for (const entry of commonEntries) {
    if (fs.existsSync(path.join(projectDir, entry))) {
      entryPoints.push(entry);
    }
  }

  // Estimate depth by scanning src/
  let depth = 1;
  if (srcDirs.length > 0) {
    const firstSrc = path.join(projectDir, srcDirs[0]);
    depth = estimateDepth(firstSrc, 0, 4);
  }

  return { topLevel, srcDirs, entryPoints, depth };
}

function estimateDepth(dir: string, current: number, maxDepth: number): number {
  if (current >= maxDepth) return current;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    let max = current;
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        const d = estimateDepth(path.join(dir, entry.name), current + 1, maxDepth);
        if (d > max) max = d;
      }
    }
    return max;
  } catch {
    return current;
  }
}

function detectGitInfo(projectDir: string): GitInfo {
  const initialized = fs.existsSync(path.join(projectDir, '.git'));
  if (!initialized) {
    return { initialized: false, branch: '', remoteUrl: '', totalCommits: 0, recentCommitMessages: [], hasUncommittedChanges: false };
  }

  const branch = execSafe('git rev-parse --abbrev-ref HEAD', projectDir);
  const remoteUrl = execSafe('git remote get-url origin', projectDir);
  const totalCommitsStr = execSafe('git rev-list --count HEAD', projectDir);
  const totalCommits = parseInt(totalCommitsStr, 10) || 0;
  const recentLog = execSafe('git log --oneline -5 --no-decorate', projectDir);
  const recentCommitMessages = recentLog ? recentLog.split('\n').map((l) => l.replace(/^[a-f0-9]+\s+/, '')) : [];
  const statusOutput = execSafe('git status --porcelain', projectDir);
  const hasUncommittedChanges = statusOutput.length > 0;

  return { initialized, branch, remoteUrl, totalCommits, recentCommitMessages, hasUncommittedChanges };
}

function detectTests(projectDir: string): { hasTests: boolean; testDirs: string[] } {
  const testDirs: string[] = [];
  const commonTestDirs = ['test', 'tests', '__tests__', 'spec', 'specs', 'e2e', 'cypress', 'playwright'];

  for (const dir of commonTestDirs) {
    if (fs.existsSync(path.join(projectDir, dir))) {
      testDirs.push(dir);
    }
  }

  // Check for test files in src/
  if (testDirs.length === 0) {
    const srcDir = path.join(projectDir, 'src');
    if (fs.existsSync(srcDir)) {
      const hasTestFiles = execSafe('find src -name "*.test.*" -o -name "*.spec.*" | head -1', projectDir);
      if (hasTestFiles) testDirs.push('src (inline)');
    }
  }

  return { hasTests: testDirs.length > 0, testDirs };
}

function detectConfigFiles(projectDir: string): string[] {
  const configs: string[] = [];
  const knownConfigs = [
    'tsconfig.json', '.eslintrc.json', '.eslintrc.js', 'eslint.config.js', 'eslint.config.mjs',
    '.prettierrc', 'prettier.config.js', 'biome.json',
    'vitest.config.ts', 'jest.config.js', 'jest.config.ts',
    'docker-compose.yml', 'docker-compose.yaml', 'Dockerfile',
    '.env.example', '.env.local',
    'tailwind.config.js', 'tailwind.config.ts',
    'next.config.js', 'next.config.mjs', 'next.config.ts',
    'vite.config.ts', 'vite.config.js',
    'webpack.config.js',
    'Makefile', 'justfile',
  ];

  for (const cfg of knownConfigs) {
    if (fs.existsSync(path.join(projectDir, cfg))) {
      configs.push(cfg);
    }
  }

  return configs;
}

export function detectProject(projectDir: string): ProjectInfo {
  logger.debug('Detecting project information...');

  // Try package.json first, then other manifests
  let stackResult = detectStackFromPackageJson(projectDir);
  if (stackResult.languages?.length === 0) {
    stackResult = detectStackFromOtherManifests(projectDir);
  }

  const structure = detectDirectoryStructure(projectDir);
  const git = detectGitInfo(projectDir);
  const { hasTests, testDirs } = detectTests(projectDir);
  const configFiles = detectConfigFiles(projectDir);

  const name = stackResult.name || path.basename(projectDir);

  return {
    name,
    stack: {
      languages: stackResult.languages || [],
      runtime: stackResult.runtime || '',
      packageManager: stackResult.packageManager || '',
      dependencies: stackResult.dependencies || {},
      devDependencies: stackResult.devDependencies || {},
    },
    structure,
    git,
    frameworks: stackResult.frameworks,
    buildTools: stackResult.buildTools,
    hasTests,
    testDirs,
    configFiles,
  };
}
