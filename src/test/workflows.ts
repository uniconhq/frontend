import { http, HttpResponse } from 'msw';
import type { PrimitiveInfo, PortDecl } from '@/features/organise/workflows/primitives';
import { problem } from './server';

/**
 * Run workflows as the editor's tests draw them, and the platform's
 * primitives as the backend lists them: versions the platform no longer
 * reads, with why (diff-check's v1, in the format before 2026-10-07, and
 * exec's v1, retired since exec's v2 compiles what it runs), and each
 * primitive's current version with its ports, its title and what it and
 * each port do (#436), as each primitive's own `primitive.yaml` says them.
 *
 * `CLASSIC` is one run of a task judged by comparing output with an answer,
 * in the shape of deploy's unicon/classic@v4 but not a copy of it: its `run`
 * step compiles the submission and runs it on the run's input under the
 * task's limits, and its `check` step compares the output with the run's
 * answer with diff-check, where deploy's compares with a diff script run by
 * exec given a manifest. `FOLDER` is the same with a folder of sources.
 * `CLASSIC_V4` is deploy's workflow.yaml for unicon/classic@v4 as it is.
 */
export const CLASSIC = `# One run of a task judged by comparing output with an answer, in the
# shape of unicon/classic@v4: compile the submission and run it on the
# run's input under the task's limits, then compare its output with the
# run's answer. The format is SIMPLER-CORE.md section 7.
inputs:
  submission: file
  language: {type: enum, options: [c, cpp, java, python]}
  time_limit: number
  memory_limit: number
  input: file
  answer: file
steps:
  - id: run
    use: unicon/exec@v2
    with:
      source: \${{ inputs.submission }}
      language: \${{ inputs.language }}
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
  log: \${{ steps.run.log }}
`;

/** One run of a program of several files, started from the entry point the entrant names. */
export const FOLDER = `# A program of several files: compile the entrant's folder of sources,
# starting from the entry point they name, and run it on the run's input
# under the task's limits, then compare its output with the run's answer.
inputs:
  program: folder
  language: {type: enum, options: [c, cpp, java, python]}
  entry: text
  time_limit: number
  memory_limit: number
  input: file
  answer: file
steps:
  - id: run
    use: unicon/exec@v2
    with:
      source: \${{ inputs.program }}
      entry: \${{ inputs.entry }}
      language: \${{ inputs.language }}
      stdin: \${{ inputs.input }}
      time_limit: \${{ inputs.time_limit }}
      memory_limit: \${{ inputs.memory_limit }}
  - id: check
    use: unicon/diff-check@v2
    with: {actual: "\${{ steps.run.output }}", expected: "\${{ inputs.answer }}"}
outputs:
  time_ms: {from: "\${{ steps.run.time_ms }}", unit: ms}
  memory_kb: {from: "\${{ steps.run.memory_kb }}", unit: KB}
  log: \${{ steps.run.log }}
`;

/** deploy's workflows/classic/v4/workflow.yaml, unicon/classic@v4 as deploy seeds it. */
export const CLASSIC_V4 = `# unicon/classic@v4, workflow.yaml: one run of an entrant's program on one
# input, its output compared word by word with the answer by the diff
# script beside this file. The format is SIMPLER-CORE.md 7.
inputs:
  code: {type: folder, title: Solution}
  language: {type: enum, options: [c, cpp, java, python], title: Language}
  input: {type: file, title: Input}
  answer: {type: file, title: Answer}
  time_limit: {type: number, title: Time limit, unit: seconds}
  memory_limit: {type: number, title: Memory limit, unit: MB}

steps:
  - id: solution
    use: unicon/exec@v2
    with:
      source: \${{ inputs.code }}
      language: \${{ inputs.language }}
      stdin: \${{ inputs.input }}
      time_limit: \${{ inputs.time_limit }}
      memory_limit: \${{ inputs.memory_limit }}
  - id: compare
    use: unicon/exec@v2
    with:
      source: \${{ workflow.diff/ }}
      language: python
      manifest: \${{ workflow.diff/program.yaml }}
      time_limit: 3
      memory_limit: 256
      files:
        output: \${{ steps.solution.output }}
        answer: \${{ inputs.answer }}

outputs:
  score: \${{ steps.compare.score }}
  time_ms: {from: "\${{ steps.solution.time_ms }}", title: Run time, unit: ms}
  memory_kb: {from: "\${{ steps.solution.memory_kb }}", title: Memory used, unit: KB}
  log: {from: "\${{ steps.solution.log }}", title: Compile log}
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

/** A version the platform lists but no longer reads, with why. */
function retired(name: string, problem: string): PrimitiveInfo {
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
    problem,
  };
}

/** What exec's every form takes to compile a program. */
const SOURCE = {
  source: port('folder', {
    runs: true,
    description: "The program's source files, with their layout.",
  }),
  language: port('enum', {
    options: ['c', 'cpp', 'java', 'python', 'ipynb'],
    description: 'The language the source is written in; ipynb is a Jupyter notebook.',
  }),
  entry: port('text', {
    optional: true,
    description:
      'The file the program starts from, when the folder holds more than one that could be.',
  }),
};

/** A limit raised from a number input, as `n * scale + add`. */
function raised(
  from: { input: string } | { max: string } | { sum: string },
  scale: string,
  add: string,
) {
  return { input: null, max: null, sum: null, ...from, scale, add };
}

/** What a run takes and how long and how much memory it used, as exec gives them. */
const TIME_LIMIT = port('number', {
  description: 'Seconds of CPU time the program may use.',
});
const MEMORY_LIMIT = port('number', {
  description: 'Megabytes of memory the program may use.',
});
const TIME_MS = port('number', {
  better: 'lower',
  at_least: '0',
  description: 'The CPU time the program used, in milliseconds.',
});
const MEMORY_KB = port('number', {
  better: 'lower',
  at_least: '0',
  description: 'The most memory the program used, in kilobytes.',
});
const ARGS = port('text', {
  optional: true,
  description: "Arguments added to the program's command line, split on spaces.",
});

/**
 * exec as its `primitive.yaml` declares itself, its limits as the backend
 * lists them: a program compiled once and run under limits, programs side by
 * side, or a program compiled and run not at all, which the save uses to
 * check that an organiser's program compiles. The editor draws a step as the
 * first form holding every port it gives (`declared`), so a step given
 * `source` and `language` alone is drawn as the one form.
 */
const EXEC: PrimitiveInfo = {
  ref: 'unicon/exec@v2',
  name: 'exec',
  title: 'Run programs',
  description:
    'Compiles one program, or several linked by pipes, once, runs them under limits, and records how each ended.',
  version: 'v2',
  batch: true,
  network: false,
  forms: {
    one: {
      description:
        'Compiles a program once, runs it under limits and records its output, time and memory.',
      outputs_from: 'manifest',
      limits: {
        time_ms: 2000,
        cpu_ms: 2000,
        memory_mb: 1136,
        pids: 160,
        output_mb: 64,
        gpus: 0,
      },
      limits_from: {
        time_ms: raised({ input: 'time_limit' }, '2000', '3000'),
        cpu_ms: raised({ input: 'time_limit' }, '2000', '3000'),
        memory_mb: raised({ input: 'memory_limit' }, '1', '256'),
      },
      inputs: {
        ...SOURCE,
        stdin: port('file', {
          runs: false,
          optional: true,
          description:
            'What the program reads on standard input; nothing when left out.',
        }),
        files: port('named_files', {
          runs: false,
          optional: true,
          description:
            "Files placed read-only in the program's working directory, under their names.",
        }),
        loads: port('named_files', {
          runs: true,
          optional: true,
          description:
            'Code the program loads, placed as files are, such as the module a test harness imports.',
        }),
        manifest: port('file', {
          runs: false,
          optional: true,
          description:
            'The reports the program declares, its program.yaml as JSON, when it is one that reports, such as a checker.',
        }),
        self_reported: port('boolean', {
          optional: true,
          description:
            "True when the program given a manifest runs the entrant's code, so a report that does not hold is the entrant's runtime error, not a fault.",
        }),
        args: ARGS,
        time_limit: TIME_LIMIT,
        memory_limit: MEMORY_LIMIT,
      },
      outputs: {
        output: port('file', {
          description: 'What the program printed on standard output.',
        }),
        time_ms: TIME_MS,
        memory_kb: MEMORY_KB,
        label: port('text', {
          optional: true,
          description: 'A finer name for the outcome, from a program given a manifest.',
        }),
        message: port('text', {
          optional: true,
          description: 'A message shown with the run, from a program given a manifest.',
        }),
        staff_message: port('text', {
          optional: true,
          description: 'A message only staff see, from a program given a manifest.',
        }),
        extras: port('folder', {
          optional: true,
          description:
            'Every other file a program given a manifest reported, shown with the run and never a column.',
        }),
        log: port('text', { description: 'What the compiler printed, up to 64 KB.' }),
        outcome: port('outcome', {
          description:
            "How the program's run ended, or that its source did not compile.",
          outcomes: {
            accepted:
              'the program finishes within its limits, and given a manifest reports a verdict of 0',
            wrong_answer: 'the program given a manifest reports a verdict of 1',
            time_limit:
              'it runs out of time, or a program given a manifest reports a verdict of time_limit',
            memory_limit:
              'it uses more memory than allowed, or a program given a manifest reports a verdict of memory_limit',
            output_limit:
              'it prints more than allowed, or a program given a manifest reports a verdict of output_limit',
            runtime_error:
              'it crashes or exits with an error, or a program given a manifest reports a verdict of runtime_error',
            compile_error: 'the source does not compile, so nothing runs',
          },
        }),
      },
    },
    programs: {
      description:
        'Compiles programs once, runs them side by side, linked by pipes, each under its own limits, and records how each one ended.',
      outputs_from: 'programs',
      limits: {
        time_ms: 4000,
        cpu_ms: 4000,
        memory_mb: 1136,
        pids: 1056,
        output_mb: 64,
        gpus: 0,
      },
      limits_from: {
        time_ms: raised({ max: 'programs.time_limit' }, '4000', '6000'),
        cpu_ms: raised({ max: 'programs.time_limit' }, '4000', '6000'),
        memory_mb: raised({ sum: 'programs.memory_limit' }, '1', '512'),
      },
      inputs: {
        programs: port('programs', {
          description:
            'The programs to run side by side, one to eight, by the names the step gives them.',
          inputs: {
            ...SOURCE,
            files: port('named_files', {
              runs: false,
              optional: true,
              description:
                "Files placed read-only in this program's working directory alone, under their names, such as the hidden input.",
            }),
            args: ARGS,
            time_limit: TIME_LIMIT,
            memory_limit: MEMORY_LIMIT,
            manifest: port('file', {
              runs: false,
              optional: true,
              description:
                'The reports the program declares, its program.yaml as JSON, for a program that reports as a checker does.',
            }),
            stops_others: port('boolean', {
              optional: true,
              description: 'True to stop every other program when this one ends.',
            }),
          },
          outputs: {
            time_ms: TIME_MS,
            memory_kb: MEMORY_KB,
            ended: port('enum', {
              options: [
                'finished',
                'time_limit',
                'memory_limit',
                'output_limit',
                'runtime_error',
              ],
              description: 'How the program ended, finished for a clean exit.',
            }),
            signal: port('text', {
              optional: true,
              description: 'The signal that ended the program, such as SIGPIPE.',
            }),
            ended_at: port('number', {
              at_least: '0',
              description: 'When the program ended, in milliseconds from the start.',
            }),
            stopped_by: port('text', {
              optional: true,
              description:
                'What stopped the program, wall_clock or the name of the program whose ending stopped it.',
            }),
            log: port('text', {
              description: 'What the compiler printed for the program, up to 64 KB.',
            }),
          },
        }),
        links: port('links', {
          optional: true,
          description:
            'The pipes between the programs, each "<from> -> <to>"; a program\'s first each way is its standard output or input.',
        }),
      },
      outputs: {
        facts: port('file', {
          description:
            "Every program's facts and reports, as one JSON file, for a verdict script to read.",
        }),
        outcome: port('outcome', {
          description:
            'Whether every program was started and measured, or a source did not compile.',
          outcomes: {
            accepted: 'every program was started and measured, however it ended',
            compile_error: "a program's source does not compile, so nothing runs",
          },
        }),
      },
    },
    build: {
      description:
        'Compiles a program and runs nothing, so saving a task can check that its programs compile.',
      outputs_from: null,
      limits: {
        time_ms: 1000,
        cpu_ms: 1000,
        memory_mb: 1136,
        pids: 160,
        output_mb: 64,
        gpus: 0,
      },
      limits_from: {},
      inputs: SOURCE,
      outputs: {
        log: port('text', { description: 'What the compiler printed, up to 64 KB.' }),
        outcome: port('outcome', {
          description: 'Whether the source compiles.',
          outcomes: {
            accepted: 'the source compiles',
            compile_error: 'it does not',
          },
        }),
      },
    },
  },
  limits: {},
  limits_from: {},
  inputs: {},
  outputs: {},
  problem: null,
};

export const PRIMITIVES: PrimitiveInfo[] = [
  retired(
    'diff-check',
    'The primitive unicon/diff-check@v1 is not in the current format.',
  ),
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
  retired('exec', 'unicon/compile and unicon/exec@v1 are retired; use unicon/exec@v2.'),
  EXEC,
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
          versions: ['v4'],
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
        description: null,
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
