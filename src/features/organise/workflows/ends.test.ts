import { describe, expect, it } from 'vitest';
import { workflowSources } from './ends';

const names = (paths: string[], changes: Parameters<typeof workflowSources>[1] = []) =>
  workflowSources(paths, changes).map((ref) => ref.name);

describe('workflow file sources', () => {
  it('includes saved files and each folder that holds them, except workflow.yaml', () => {
    expect(
      names(['workflow.yaml', 'checker/src/checker.cpp', 'checker/program.yaml']),
    ).toEqual([
      'checker/',
      'checker/program.yaml',
      'checker/src/',
      'checker/src/checker.cpp',
    ]);
    expect(workflowSources(['checker.cpp'], [])).toEqual([
      { kind: 'workflow', name: 'checker.cpp' },
    ]);
  });

  it('offers staged uploads once and takes staged removals out of the sources', () => {
    expect(
      names(
        ['checker/old.cpp', 'checker/kept.cpp'],
        [
          { path: 'checker/old.cpp', token: 'old', encoding: 'utf-8', remove: true },
          {
            path: 'checker/kept.cpp',
            token: 'kept',
            encoding: 'utf-8',
            remove: false,
            upload: 'replacement',
          },
          {
            path: 'new/extra.cpp',
            token: null,
            encoding: 'utf-8',
            remove: false,
            upload: 'new',
          },
        ],
      ),
    ).toEqual(['checker/', 'checker/kept.cpp', 'new/', 'new/extra.cpp']);
  });

  it('does not offer a folder once its last file is removed', () => {
    expect(
      names(
        ['checker/checker.cpp'],
        [
          {
            path: 'checker/checker.cpp',
            token: 'old',
            encoding: 'utf-8',
            remove: true,
          },
        ],
      ),
    ).toEqual([]);
  });
});
