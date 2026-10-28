import { http, HttpResponse } from 'msw';
import type { PrimitiveInfo, PortDecl } from '@/features/organise/workflows/primitives';
import { problem } from './server';

/**
 * Run workflows as the editor's tests draw them, and the platform's
 * primitives as the backend lists them: each primitive's v1 in the format
 * before 2026-10-07, which the platform no longer reads, and its current
 * version with its ports, its title and what it and each port do (#436), as
 * each primitive's own `primitive.yaml` says them.
 *
 * `CLASSIC` is one run of a task judged by comparing output with an answer,
 * as deploy's unicon/classic@v3 is (SIMPLER-CORE.md section 7): compile the
 * submission, run the program on the run's input under the task's limits,
 * and compare its output with the run's answer. Deploy's compares with a diff
 * script given a manifest, whose outputs no primitive here declares, so this
 * one compares with diff-check.
 */
export const CLASSIC = `# unicon/classic@v3, one run of a task judged by comparing output with an
# answer: compile the submission, run the program on the run's input under
# the task's limits, and compare its output with the run's answer. The
# format is SIMPLER-CORE.md section 7.
inputs:
  submission: file
  language: {type: enum, options: [c, cpp, java, python]}
  time_limit: number
  memory_limit: number
  input: file
  answer: file
steps:
  - id: compile
    use: unicon/compile@v3
    with:
      source: \${{ inputs.submission }}
      language: \${{ inputs.language }}
  - id: run
    use: unicon/exec@v1
    with:
      program: \${{ steps.compile.program }}
      stdin: \${{ inputs.input }}
      time_limit: \${{ inputs.time_limit }}
      memory_limit: \${{ inputs.memory_limit }}
  - id: check
    use: unicon/diff-check@v2
    with:
      actual: \${{ steps.run.output }}
      expected: \${{ inputs.answer }}
outputs:
  time_ms: {from: "\${{ steps.run.time_ms }}", unit: ms}
  memory_kb: {from: "\${{ steps.run.memory_kb }}", unit: KB}
  log: \${{ steps.compile.log }}
`;

/** One run of a program of several files, started from the entry point the entrant names. */
export const FOLDER = `# A program of several files: compile the entrant's folder of sources,
# starting from the entry point they name, run the program on the run's
# input under the task's limits, and compare its output with the run's
# answer.
inputs:
  program: folder
  language: {type: enum, options: [c, cpp, java, python]}
  entry: text
  time_limit: number
  memory_limit: number
  input: file
  answer: file
steps:
  - id: compile
    use: unicon/compile@v3
    with:
      source: \${{ inputs.program }}
      entry: \${{ inputs.entry }}
      language: \${{ inputs.language }}
  - id: run
    use: unicon/exec@v1
    with:
      program: \${{ steps.compile.program }}
      stdin: \${{ inputs.input }}
      time_limit: \${{ inputs.time_limit }}
      memory_limit: \${{ inputs.memory_limit }}
  - id: check
    use: unicon/diff-check@v2
    with: {actual: "\${{ steps.run.output }}", expected: "\${{ inputs.answer }}"}
outputs:
  time_ms: {from: "\${{ steps.run.time_ms }}", unit: ms}
  memory_kb: {from: "\${{ steps.run.memory_kb }}", unit: KB}
  log: \${{ steps.compile.log }}
`;

function port(type: string, more: Partial<PortDecl> = {}): PortDecl {
  return {
    type,
    options: null,
    optional: false,
    runs: null,
    secret: false,
    description: null,
    outcomes: null,
    at_least: null,
    at_most: null,
    better: null,
    inputs: null,
    names: null,
    outputs: null,
    ...more,
  };
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
    title: null,
    description: null,
    version: 'v1',
    batch: false,
    network: false,
    forms: {},
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
    ref: 'unicon/compile@v3',
    name: 'compile',
    title: 'Compile',
    description: 'Compiles source files into one program.',
    version: 'v3',
    batch: false,
    network: false,
    forms: {},
    limits: { ...LIMITS, time_ms: 60000, cpu_ms: 60000, memory_mb: 1024 },
    limits_from: {},
    inputs: {
      source: port('folder', {
        runs: true,
        description: 'The source files to compile, with their layout.',
      }),
      language: port('enum', {
        options: ['c', 'cpp', 'java', 'python'],
        description: 'The language the source files are written in.',
      }),
      entry: port('text', {
        optional: true,
        description: 'The file the program starts from, such as src/Main.java.',
      }),
    },
    outputs: {
      program: port('file', { description: 'The compiled program, ready to run.' }),
      log: port('text', { description: 'Everything the compiler printed.' }),
      outcome: port('outcome', {
        description: 'Whether the source compiled.',
        outcomes: {
          accepted: 'the source compiles',
          compile_error: 'it does not compile, or the compiler goes over a limit',
        },
      }),
    },
    problem: null,
  },
  retired('diff-check'),
  {
    ref: 'unicon/diff-check@v2',
    name: 'diff-check',
    title: 'Compare with the answer',
    description:
      "Compares a program's output with the answer, ignoring trailing whitespace.",
    version: 'v2',
    batch: true,
    network: false,
    forms: {},
    limits: { ...LIMITS, pids: 32, output_mb: 1 },
    limits_from: {},
    inputs: {
      actual: port('file', { runs: false, description: 'What the program printed.' }),
      expected: port('file', {
        runs: false,
        description: 'The expected answer, from the task.',
      }),
    },
    outputs: {
      outcome: port('outcome', {
        description: 'Whether the output matches the answer.',
        outcomes: {
          accepted: 'the output matches the answer, ignoring trailing whitespace',
          wrong_answer: 'it does not',
        },
      }),
    },
    problem: null,
  },
  {
    ref: 'unicon/exec@v1',
    name: 'exec',
    title: 'Run program',
    description:
      'Runs a program once under limits and records its output, time and memory.',
    version: 'v1',
    batch: true,
    network: false,
    forms: {},
    limits: LIMITS,
    limits_from: {
      time_ms: {
        input: 'time_limit',
        scale: '2000',
        add: '3000',
        max: null,
        sum: null,
      },
      cpu_ms: { input: 'time_limit', scale: '2000', add: '3000', max: null, sum: null },
      memory_mb: {
        input: 'memory_limit',
        scale: '1',
        add: '256',
        max: null,
        sum: null,
      },
    },
    inputs: {
      program: port('file', { runs: true, description: 'The program to run.' }),
      stdin: port('file', {
        runs: false,
        description: 'What the program reads on standard input.',
      }),
      args: port('text', {
        optional: true,
        description: "Arguments added to the program's command line, split on spaces.",
      }),
      time_limit: port('number', {
        description: 'Seconds of CPU time the program may use.',
      }),
      memory_limit: port('number', {
        description: 'Megabytes of memory the program may use.',
      }),
    },
    outputs: {
      output: port('file', {
        description: 'What the program printed on standard output.',
      }),
      time_ms: port('number', {
        description: 'The CPU time the program used, in milliseconds.',
      }),
      memory_kb: port('number', {
        description: 'The most memory the program used, in kilobytes.',
      }),
      outcome: port('outcome', {
        description: 'How the program ended.',
        outcomes: {
          accepted: 'the program finishes within its limits',
          time_limit: 'it runs out of time',
          memory_limit: 'it uses more memory than allowed',
          output_limit: 'it prints more than allowed',
          runtime_error: 'it crashes or exits with an error',
        },
      }),
    },
    problem: null,
  },
];

/** A primitive of two forms, as exec declares itself: one program, or programs side by side. */
export const FORMED: PrimitiveInfo = {
  ref: 'unicon/exec@v2',
  name: 'exec',
  title: 'Run programs',
  description: 'Runs one program, or several linked by pipes, under limits.',
  version: 'v2',
  batch: true,
  network: false,
  forms: {
    one: {
      description: 'Runs a program once under limits.',
      outputs_from: 'manifest',
      limits: LIMITS,
      limits_from: {},
      inputs: {
        program: port('file', { runs: true }),
        stdin: port('file', { optional: true }),
        time_limit: port('number'),
      },
      outputs: {
        output: port('file'),
        time_ms: port('number'),
        outcome: port('outcome'),
      },
    },
    programs: {
      description: 'Runs programs side by side, linked by pipes.',
      outputs_from: 'programs',
      limits: LIMITS,
      limits_from: {},
      inputs: {
        programs: port('programs', {
          inputs: { program: port('file', { runs: true }), time_limit: port('number') },
          outputs: { time_ms: port('number'), memory_kb: port('number') },
        }),
        links: port('links', { optional: true }),
      },
      outputs: { facts: port('file'), outcome: port('outcome') },
    },
  },
  limits: {},
  limits_from: {},
  inputs: {},
  outputs: {},
  problem: null,
};

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
    problems?: (
      content: string,
    ) => { path: string; message: string; step?: string | null }[];
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
    /** How many times the version check has answered. */
    checks: 0,
  };
  // As the forge reads it back: a private workflow is shared once someone is
  // on its list, and private while nobody is, whatever was last chosen.
  const shown = () =>
    state.visibility === 'public'
      ? ('public' as const)
      : state.readers.length > 0
        ? ('shared' as const)
        : ('private' as const);
  const page = () => ({
    owner: 'kenny',
    name: 'tuned',
    visibility: shown(),
    versions: state.versions,
    editable: true,
    draft: { content: state.draft, token: state.token },
    readers: state.readers,
  });
  const handlers = [
    http.get(`${WORKFLOW_API}/tree`, () => HttpResponse.json([])),
    http.get(WORKFLOW_API, () => HttpResponse.json(page())),
    http.get('/api/v1/workflows', () =>
      HttpResponse.json([
        {
          owner: 'kenny',
          name: 'tuned',
          visibility: shown(),
          versions: state.versions,
          editable: true,
        },
        {
          owner: 'unicon',
          name: 'classic',
          visibility: 'public',
          versions: ['v3'],
          editable: false,
        },
      ]),
    ),
    http.get('/api/v1/primitives', () => HttpResponse.json(PRIMITIVES)),
    http.get('/api/v1/workflows/:owner/:name/versions/:version/box', () =>
      HttpResponse.json({
        inputs: [],
        outputs: [],
        newer_version: null,
        run: false,
      }),
    ),
    http.post('/api/v1/workflows/check', async ({ request }) => {
      const { content } = (await request.json()) as { content: string };
      state.checks += 1;
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
      if (!/^v[1-9][0-9]*$/.test(version))
        return problem(422, 'invalid_name', {
          detail: `'${version}' cannot name a version: a version is v and a whole number from 1, with no leading zero, such as v1, v2 or v10`,
        });
      const found = options.problems?.(state.draft) ?? [];
      if (found.length > 0)
        return problem(422, 'invalid_definition', { errors: found });
      if (state.versions.includes(version))
        return problem(409, 'conflict', {
          detail: `kenny/tuned already has a version ${version}. Choose another version.`,
        });
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
