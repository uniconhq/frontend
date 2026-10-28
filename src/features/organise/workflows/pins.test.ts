import { describe, expect, it } from 'vitest';
import { workflowOf } from './edit';
import { pinned, warnings } from './pins';

const WORKFLOW = workflowOf(
  [
    'inputs: {n: number}',
    'steps:',
    '  - {id: a, use: kenny/inner@v1}',
    '  - {id: b, use: unicon/exec@v1, with: {time_limit: "${{ inputs.n }}"}}',
    '  - {id: c, use: kenny/inner@v1}',
    'outputs:',
    '  out: ${{ steps.b.output }}',
    '',
  ].join('\n'),
);

const problem = (path: string) => ({ path, message: `wrong at ${path}`, step: null });

function lines(paths: string[]) {
  return warnings(pinned(paths.map(problem), 3, ['n'], ['out']), WORKFLOW, (use) =>
    use === 'kenny/inner@v1' ? 'v2' : null,
  );
}

describe('the line under a box’s head', () => {
  it('says a newer version is out where a box has no problem', () => {
    expect(lines([]).get('step:0')).toEqual({ kind: 'newer', version: 'v2' });
    expect(lines([]).has('step:1')).toBe(false);
  });

  it('says a step’s own problem before a port’s, and before a newer version', () => {
    const found = lines(['steps[0].with.source', 'steps[0]', 'steps[2].with.x']);

    expect(found.get('step:0')).toEqual({
      kind: 'problem',
      problem: problem('steps[0]'),
    });
    expect(found.get('step:2')).toEqual({
      kind: 'problem',
      problem: problem('steps[2].with.x'),
    });
  });

  it('says an input’s problem on its box, and an output’s on the outputs', () => {
    const found = lines(['inputs.n', 'outputs.out']);

    expect(found.get('input:n')).toMatchObject({ kind: 'problem' });
    expect(found.get('outputs')).toMatchObject({ kind: 'problem' });
  });
});
