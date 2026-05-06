import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { detectProject } from '../src/core/detector';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-detect-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true });
});

describe('detectProject', () => {
  it('detects Node.js/TypeScript project', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
      name: 'my-app',
      dependencies: { express: '^5.0.0' },
      devDependencies: { typescript: '^5.0.0' },
    }));
    fs.writeFileSync(path.join(tmpDir, 'tsconfig.json'), '{}');
    fs.mkdirSync(path.join(tmpDir, 'src'));
    fs.writeFileSync(path.join(tmpDir, 'src', 'index.ts'), '');

    const info = detectProject(tmpDir);
    expect(info.name).toBe('my-app');
    expect(info.stack.languages).toContain('TypeScript');
    expect(info.stack.runtime).toBe('Node.js');
    expect(info.frameworks).toContain('Express');
    expect(info.structure.entryPoints).toContain('src/index.ts');
    expect(info.configFiles).toContain('tsconfig.json');
  });

  it('detects Python project', () => {
    fs.writeFileSync(path.join(tmpDir, 'pyproject.toml'), '[project]\nname = "mypy"\n');

    const info = detectProject(tmpDir);
    expect(info.stack.languages).toContain('Python');
    expect(info.stack.runtime).toBe('Python');
  });

  it('detects Go project', () => {
    fs.writeFileSync(path.join(tmpDir, 'go.mod'), 'module github.com/user/mygoapp\n');

    const info = detectProject(tmpDir);
    expect(info.name).toBe('mygoapp');
    expect(info.stack.languages).toContain('Go');
  });

  it('detects Rust project', () => {
    fs.writeFileSync(path.join(tmpDir, 'Cargo.toml'), '[package]\nname = "myrust"\nversion = "0.1.0"\n');

    const info = detectProject(tmpDir);
    expect(info.name).toBe('myrust');
    expect(info.stack.languages).toContain('Rust');
  });

  it('detects test directories', () => {
    fs.mkdirSync(path.join(tmpDir, 'tests'));
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'test-proj' }));

    const info = detectProject(tmpDir);
    expect(info.hasTests).toBe(true);
    expect(info.testDirs).toContain('tests');
  });

  it('detects package manager from lockfiles', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'pnpm-proj' }));
    fs.writeFileSync(path.join(tmpDir, 'pnpm-lock.yaml'), '');

    const info = detectProject(tmpDir);
    expect(info.stack.packageManager).toBe('pnpm');
  });

  it('handles empty directory gracefully', () => {
    const info = detectProject(tmpDir);
    expect(info.name).toBe(path.basename(tmpDir));
    expect(info.stack.languages).toEqual([]);
  });
});
