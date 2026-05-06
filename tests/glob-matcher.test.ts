import { describe, it, expect } from 'vitest';
import { matchGlob, matchGlobs } from '../src/utils/glob-matcher';

describe('matchGlob', () => {
  it('matches simple glob', () => {
    expect(matchGlob('*.ts', 'index.ts')).toBe(true);
    expect(matchGlob('*.ts', 'index.js')).toBe(false);
  });

  it('matches double star glob', () => {
    expect(matchGlob('src/**/*.ts', 'src/core/config.ts')).toBe(true);
    expect(matchGlob('src/**/*.ts', 'src/cli.ts')).toBe(true);
    expect(matchGlob('src/**/*.ts', 'tests/foo.ts')).toBe(false);
  });

  it('matches dotfiles with dot option', () => {
    expect(matchGlob('.*', '.gitignore')).toBe(true);
  });

  it('matches exact paths', () => {
    expect(matchGlob('.ai/ARCHITECTURE.md', '.ai/ARCHITECTURE.md')).toBe(true);
    expect(matchGlob('.ai/ARCHITECTURE.md', '.ai/PROJECT.md')).toBe(false);
  });
});

describe('matchGlobs', () => {
  it('returns true if any pattern matches', () => {
    expect(matchGlobs(['*.ts', '*.js'], 'index.ts')).toBe(true);
    expect(matchGlobs(['*.ts', '*.js'], 'index.js')).toBe(true);
    expect(matchGlobs(['*.ts', '*.js'], 'index.py')).toBe(false);
  });

  it('returns false for empty patterns', () => {
    expect(matchGlobs([], 'index.ts')).toBe(false);
  });
});
