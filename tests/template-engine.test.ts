import { describe, it, expect } from 'vitest';
import { expandTemplate, TemplateContext } from '../src/core/template-engine';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const mockContext: TemplateContext = {
  project: { name: 'test-project', stack: 'TypeScript' },
  git: { branch: 'main', diff_stats: '3 files changed' },
  context: { current: 'doing something' },
};

describe('expandTemplate', () => {
  it('expands {{var}} variables', () => {
    const result = expandTemplate('Project: {{project.name}}', mockContext, '/tmp');
    expect(result).toBe('Project: test-project');
  });

  it('expands nested variables', () => {
    const result = expandTemplate('Branch: {{git.branch}}, Stack: {{project.stack}}', mockContext, '/tmp');
    expect(result).toBe('Branch: main, Stack: TypeScript');
  });

  it('replaces unknown variables with empty string', () => {
    const result = expandTemplate('{{nonexistent.var}}', mockContext, '/tmp');
    expect(result).toBe('');
  });

  it('expands !`command`! with shell output', () => {
    const result = expandTemplate('!`echo hello`!', mockContext, '/tmp');
    expect(result).toBe('hello');
  });

  it('handles failed commands gracefully', () => {
    const result = expandTemplate('!`false_command_that_does_not_exist`!', mockContext, '/tmp');
    expect(result).toContain('[ERROR:');
  });

  it('expands @path with file content', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-test-'));
    const testFile = path.join(tmpDir, 'test.txt');
    fs.writeFileSync(testFile, 'file content here');

    const result = expandTemplate(`@test.txt`, mockContext, tmpDir);
    expect(result).toBe('file content here');

    fs.rmSync(tmpDir, { recursive: true });
  });

  it('handles missing file in @path', () => {
    const result = expandTemplate('@nonexistent-file.txt', mockContext, '/tmp');
    expect(result).toContain('[FILE NOT FOUND:');
  });

  it('expands multiple patterns in one template', () => {
    const result = expandTemplate(
      'Project {{project.name}} on {{git.branch}} with !`echo ok`!',
      mockContext,
      '/tmp',
    );
    expect(result).toBe('Project test-project on main with ok');
  });
});
