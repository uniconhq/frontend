import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import type { DeclaredInput } from '@/api/types';
import { problem, server } from '@/test/server';
import { TASK_API } from '@/test/organiser';
import { stageInputFiles } from './input-files';

const PLACE = { kind: 'task', org: 'acme', contest: 'spring', task: 'sum' } as const;

function declared(id: string, type: string): DeclaredInput {
  return {
    id,
    type,
    contestant: false,
    options: null,
    per_test: false,
    optional: false,
    title: null,
    help: null,
    unit: null,
  };
}

/** A task whose `tests/` and `public/` hold files, each read with its token. */
function taskWithFiles() {
  const files: Record<string, string[]> = {
    tests: ['tests/main/1/input', 'tests/main/1/answer'],
    public: ['public/diagram.png'],
  };
  server.use(
    http.get(`${TASK_API}/tree`, ({ request }) => {
      const at = new URL(request.url).searchParams.get('path') ?? '';
      const under = files[at];
      return under === undefined
        ? problem(404, 'not_found')
        : HttpResponse.json(
            under.map((path) => ({ path, kind: 'file', size: 1, upload: null })),
          );
    }),
    http.get(`${TASK_API}/files/:path`, ({ params }) => {
      const path = decodeURIComponent(String(params['path']));
      return Object.values(files).flat().includes(path)
        ? HttpResponse.json({
            path,
            encoding: 'utf-8',
            content: 'x',
            token: `token-${path}`,
            upload: null,
            version: null,
          })
        : problem(404, 'not_found');
    }),
  );
}

/** A file chosen inside a folder, as the browser's folder picker gives it. */
function inFolder(name: string, text: string): File {
  const file = new File([text], name);
  Object.defineProperty(file, 'webkitRelativePath', { value: `mine/${name}` });
  return file;
}

describe('a file chosen for a setting', () => {
  it('goes under the input’s own folder', async () => {
    taskWithFiles();
    const staged = await stageInputFiles(
      PLACE,
      declared('checker', 'file'),
      [new File(['print(1)\n'], 'checker.py')],
      '',
    );
    expect(staged.value).toBe('checker/checker.py');
    expect(staged.planned.map((change) => change.path)).toEqual(['checker/checker.py']);
  });

  it('goes under inputs/ for an input named as a folder the format reserves, taking out nothing there', async () => {
    taskWithFiles();
    const folder = await stageInputFiles(
      PLACE,
      declared('tests', 'folder'),
      [inFolder('runner.py', 'run\n')],
      'tests/',
    );
    expect(folder.value).toBe('inputs/tests/');
    expect(folder.planned.map((change) => change.path)).toEqual([
      'inputs/tests/runner.py',
    ]);

    const file = await stageInputFiles(
      PLACE,
      declared('public', 'file'),
      [new File(['int main() {}\n'], 'checker.cpp')],
      'public/diagram.png',
    );
    expect(file.value).toBe('inputs/public/checker.cpp');
    expect(file.planned.map((change) => change.path)).toEqual([
      'inputs/public/checker.cpp',
    ]);
  });
});
