import { http, HttpResponse } from 'msw';
import type { PrimitiveInfo, PortDecl } from '@/features/organise/workflows/primitives';
import { problem } from './server';

/**
 * The seeded workflows as deploy's bootstrap writes them, and the platform's
 * primitives as the backend lists them: the v1s in the format before
 * 2026-10-07, which the platform no longer reads, and the v2s with their
 * ports.
 */
export const CLASSIC_V1 = `# unicon/classic@v1, the built-in workflow for a task judged by comparing
# output with an answer: compile the submission once, run the binary on
# every testcase under the task's limits, and diff each run's output
# against that testcase's answer. Seeded by \`uv run bootstrap\` into the
# repository unicon/classic.workflow at the forge, at the tag v1. The
# format is TASK-FORMAT.md section 6.3.
#
# Inside a foreach, steps.<id>.<output> naming another step of the same
# foreach list means that step's output for the same testcase.
name: unicon/classic
version: v1

inputs:
  - id: submission
    type: code
  - id: testcases
    type: file[]
  - id: time_limit
    type: number
  - id: memory_limit
    type: number

steps:
  - id: compile
    use: unicon/compile@v1
    with:
      source: \${{ inputs.submission }}
      language: \${{ inputs.submission.language }}

  - id: run
    use: unicon/sandbox-run@v1
    foreach: \${{ inputs.testcases }}
    with:
      binary: \${{ steps.compile.binary }}
      input: \${{ item.input }}
      time_limit: \${{ inputs.time_limit }}
      memory_limit: \${{ inputs.memory_limit }}

  - id: check
    use: unicon/diff-check@v1
    foreach: \${{ inputs.testcases }}
    with:
      actual: \${{ steps.run.output }}
      expected: \${{ item.answer }}

outputs:
  outcome: \${{ steps.check.outcome }}
  metrics:
    points: \${{ steps.check.points }}
  tests:
    time_ms: \${{ steps.run.time_ms }}
    memory_kb: \${{ steps.run.memory_kb }}
  summary: \${{ steps.compile.compile_log }}
`;

export const CLASSIC_V2 = `# unicon/classic@v2, the built-in workflow for a task judged by comparing
# output with an answer: compile the submission once, run the program on
# every test under the task's limits, and compare each run's output with
# that test's answer. Seeded by \`uv run bootstrap\` into the repository
# unicon/classic.workflow at the forge, at the tag v2. The format is
# TASK-FORMAT.md section 1.3.
inputs:
  submission: {type: file, contestant: true}
  language: {type: enum, options: [c, cpp, java, python], contestant: true}
  time_limit: number
  memory_limit: number
test:
  input: file
  answer: file
steps:
  - id: compile
    use: unicon/compile@v2
    with:
      source: \${{ inputs.submission }}
      language: \${{ inputs.language }}
  - id: run
    use: unicon/sandbox-run@v2
    per_test: true
    with:
      binary: \${{ steps.compile.binary }}
      input: \${{ test.input }}
      time_limit: \${{ inputs.time_limit }}
      memory_limit: \${{ inputs.memory_limit }}
  - id: check
    use: unicon/diff-check@v2
    per_test: true
    with:
      actual: \${{ steps.run.output }}
      expected: \${{ test.answer }}
report:
  time_ms: {from: "\${{ steps.run.time_ms }}", fold: max, better: lower, at_least: 0}
  memory_kb: {from: "\${{ steps.run.memory_kb }}", fold: max, better: lower, at_least: 0}
  log: \${{ steps.compile.compile_log }}
`;

export const CLASSIC_FOLDER = `# unicon/classic-folder@v1, the built-in workflow for a program of several
# files: compile the contestant's folder of sources once, starting from the
# entry point they name, run the program on every test under the task's
# limits, and compare each run's output with that test's answer. Seeded by
# \`uv run bootstrap\` into the repository unicon/classic-folder.workflow at
# the forge, at the tag v1. The format is TASK-FORMAT.md section 1.3, and
# the workflow is section 4.7's.
inputs:
  program: {type: folder, contestant: true}
  language: {type: enum, options: [c, cpp, java, python], contestant: true}
  entry: {type: text, contestant: true}
  time_limit: number
  memory_limit: number
test:
  input: file
  answer: file
steps:
  - id: compile
    use: unicon/compile@v2
    with:
      source: \${{ inputs.program }}
      entry: \${{ inputs.entry }}
      language: \${{ inputs.language }}
  - id: run
    use: unicon/sandbox-run@v2
    per_test: true
    with:
      binary: \${{ steps.compile.binary }}
      input: \${{ test.input }}
      time_limit: \${{ inputs.time_limit }}
      memory_limit: \${{ inputs.memory_limit }}
  - id: check
    use: unicon/diff-check@v2
    per_test: true
    with: {actual: "\${{ steps.run.output }}", expected: "\${{ test.answer }}"}
report:
  time_ms: {from: "\${{ steps.run.time_ms }}", fold: max, better: lower, at_least: 0}
  memory_kb: {from: "\${{ steps.run.memory_kb }}", fold: max, better: lower, at_least: 0}
  log: \${{ steps.compile.compile_log }}
`;

function port(type: string, more: Partial<PortDecl> = {}): PortDecl {
  return { type, options: null, optional: false, runs: null, secret: false, ...more };
}

const LIMITS = {
  time_ms: 2000,
  cpu_ms: 2000,
  memory_mb: 256,
  pids: 128,
  output_mb: 64,
  gpus: 0,
};

function retired(name: string): PrimitiveInfo {
  return {
    ref: `unicon/${name}@v1`,
    name,
    version: 'v1',
    batch: false,
    network: false,
    limits: {},
    limits_from: {},
    inputs: {},
    outputs: {},
    problem: `The primitive unicon/${name}@v1 is not in the current format.`,
  };
}

export const PRIMITIVES: PrimitiveInfo[] = [
  retired('compile'),
  {
    ref: 'unicon/compile@v2',
    name: 'compile',
    version: 'v2',
    batch: false,
    network: false,
    limits: { ...LIMITS, time_ms: 60000, cpu_ms: 60000, memory_mb: 1024 },
    limits_from: {},
    inputs: {
      source: port('folder', { runs: true }),
      language: port('enum', { options: ['c', 'cpp', 'java', 'python'] }),
      entry: port('text', { optional: true }),
    },
    outputs: {
      binary: port('file'),
      compile_log: port('text'),
      outcome: port('outcome'),
    },
    problem: null,
  },
  retired('diff-check'),
  {
    ref: 'unicon/diff-check@v2',
    name: 'diff-check',
    version: 'v2',
    batch: true,
    network: false,
    limits: { ...LIMITS, pids: 32, output_mb: 1 },
    limits_from: {},
    inputs: {
      actual: port('file', { runs: false }),
      expected: port('file', { runs: false }),
    },
    outputs: { outcome: port('outcome') },
    problem: null,
  },
  retired('sandbox-run'),
  {
    ref: 'unicon/sandbox-run@v2',
    name: 'sandbox-run',
    version: 'v2',
    batch: true,
    network: false,
    limits: LIMITS,
    limits_from: {
      time_ms: { input: 'time_limit', scale: 2000, add: 3000 },
      cpu_ms: { input: 'time_limit', scale: 2000, add: 3000 },
      memory_mb: { input: 'memory_limit', scale: 1, add: 256 },
    },
    inputs: {
      binary: port('file', { runs: true }),
      input: port('file', { runs: false }),
      args: port('text', { optional: true }),
      time_limit: port('number'),
      memory_limit: port('number'),
    },
    outputs: {
      output: port('file'),
      time_ms: port('number'),
      memory_kb: port('number'),
      outcome: port('outcome'),
    },
    problem: null,
  },
];

export const WORKFLOW_API = '/api/v1/workflows/kenny/tuned';

/**
 * The backend of a workflow page for kenny/tuned, which kenny may edit: its
 * draft held here, written by each save, the version check answering with
 * `problems` for whatever it is sent, and every save and version asked for
 * kept for the test to read.
 */
export function workflowBackend(
  draft: string,
  options: {
    problems?: (content: string) => { path: string; message: string }[];
    versions?: string[];
  } = {},
) {
  const state = {
    draft,
    token: 'token-1',
    saves: [] as { content: string; token: string | null }[],
    versions: [...(options.versions ?? [])],
    visibility: 'private' as 'private' | 'shared' | 'public',
    readers: [] as string[],
  };
  const page = () => ({
    owner: 'kenny',
    name: 'tuned',
    visibility: state.visibility,
    versions: state.versions,
    editable: true,
    draft: { content: state.draft, token: state.token },
    readers: state.readers,
  });
  const handlers = [
    http.get(WORKFLOW_API, () => HttpResponse.json(page())),
    http.get('/api/v1/workflows', () =>
      HttpResponse.json([
        {
          owner: 'kenny',
          name: 'tuned',
          visibility: state.visibility,
          versions: state.versions,
          editable: true,
        },
        {
          owner: 'unicon',
          name: 'classic',
          visibility: 'public',
          versions: ['v2'],
          editable: false,
        },
      ]),
    ),
    http.get('/api/v1/primitives', () => HttpResponse.json(PRIMITIVES)),
    http.post('/api/v1/workflows/check', async ({ request }) => {
      const { content } = (await request.json()) as { content: string };
      return HttpResponse.json({ problems: options.problems?.(content) ?? [] });
    }),
    http.put(`${WORKFLOW_API}/draft`, async ({ request }) => {
      const body = (await request.json()) as { content: string; token: string | null };
      state.saves.push(body);
      if (body.token !== state.token) return problem(409, 'conflict');
      state.draft = body.content;
      state.token = `token-${String(state.saves.length + 1)}`;
      return HttpResponse.json({ content: state.draft, token: state.token });
    }),
    http.post(`${WORKFLOW_API}/versions`, async ({ request }) => {
      const { version } = (await request.json()) as { version: string };
      const found = options.problems?.(state.draft) ?? [];
      if (found.length > 0)
        return problem(422, 'invalid_definition', { errors: found });
      state.versions.push(version);
      return HttpResponse.json({ version }, { status: 201 });
    }),
    http.put(`${WORKFLOW_API}/visibility`, async ({ request }) => {
      const { visibility } = (await request.json()) as {
        visibility: typeof state.visibility;
      };
      state.visibility = visibility;
      if (visibility !== 'shared') state.readers = [];
      return new HttpResponse(null, { status: 204 });
    }),
    http.put(`${WORKFLOW_API}/readers/:username`, ({ params }) => {
      const username = String(params.username);
      if (state.visibility === 'public') return problem(409, 'conflict');
      state.readers.push(username);
      return HttpResponse.json({ username });
    }),
    http.delete(`${WORKFLOW_API}/readers/:username`, ({ params }) => {
      state.readers = state.readers.filter(
        (reader) => reader !== String(params.username),
      );
      return new HttpResponse(null, { status: 204 });
    }),
  ];
  return { state, handlers };
}
