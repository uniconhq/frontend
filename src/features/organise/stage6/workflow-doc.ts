import type { GraphBox, GraphWire } from './graph';

/**
 * The run workflow the mock draws, and the workflows a box opens, at the
 * version the box pins. Only the outer draft is edited; an inner one is the
 * picture of that version. A wire from `inputs` reads one of the workflow's
 * own inputs.
 */

export type StepKind = 'input' | 'primitive' | 'workflow';

export type Step = {
  id: string;
  title: string;
  /** Its ref, `owner/name@version`. */
  line: string;
  description: string;
  kind: StepKind;
  inputs: string[];
  outputs: string[];
  /** An input that is a problem until a wire feeds it. */
  needed: string[];
  opens?: string;
  steps?: number;
  version?: string;
  newer?: string;
};

export type Wire = { from: string; fromPort: string; to: string; toPort: string };

/** A name the level gives, and the step output it comes from. */
export type Report = { name: string; box: string; port: string; unit?: string };

export type WorkflowInput = {
  name: string;
  type: string;
  said: string;
  /** A file the workflow holds beside its `workflow.yaml`, offered for download. */
  own?: boolean;
  /** Filled only by one of the contest's secrets, and read only by ports marked secret. */
  secret?: boolean;
};

export type Level = {
  name: string;
  inputs: WorkflowInput[];
  boxes: Step[];
  wires: Wire[];
  /**
   * What it gives: a task reads them from each run, and a workflow that uses
   * this one as a box wires them on. One list for both.
   */
  outputs: Report[];
};

export type CatalogueItem = {
  group: 'input' | 'primitive' | 'workflow';
  title: string;
  /** What it does, in a line. */
  line: string;
  /** Small under the line: its ref, or who can use it and how much it holds. */
  note?: string;
  what: string;
  ref: string;
  inputs: string[];
  outputs: string[];
  opens?: string;
  steps?: number;
  version?: string;
};

const input = (title: string, line: string): CatalogueItem => ({
  group: 'input',
  title,
  line,
  what: 'Input',
  ref: title,
  inputs: [],
  outputs: ['value'],
});

export const INPUTS: CatalogueItem[] = [
  input('text', 'A line of text, such as a language name'),
  input('number', 'A number, such as a time limit in seconds'),
  input('true or false', 'A switch, such as whether to lint'),
  input('choice', 'One of a list, such as c, cpp or python'),
  input('file', "One file, such as a test's input"),
  input('folder', "A folder of files, such as the entrant's code"),
];

export const PRIMITIVES: CatalogueItem[] = [
  {
    group: 'primitive',
    title: 'Compile',
    line: 'Builds source code into a program',
    note: 'unicon/compile@v3',
    what: 'Compile',
    ref: 'unicon/compile@v3',
    inputs: ['source', 'language'],
    outputs: ['program', 'log'],
  },
  {
    group: 'primitive',
    title: 'Run program',
    line: 'Runs a program on one input, with time and memory limits',
    note: 'unicon/exec@v1',
    what: 'Run program',
    ref: 'unicon/exec@v1',
    inputs: ['program', 'input', 'time_limit', 'memory_limit'],
    outputs: ['output', 'time_ms', 'memory_kb'],
  },
  {
    group: 'primitive',
    title: 'Run linked programs',
    line: 'Runs programs that talk to each other, such as a player and a referee',
    note: 'unicon/interact@v2',
    what: 'Run linked programs',
    ref: 'unicon/interact@v2',
    inputs: ['programs', 'links'],
    outputs: ['facts'],
  },
];

const workflow = (
  title: string,
  line: string,
  version: string,
  steps: number,
  inputs: string[],
  outputs: string[],
  opens?: string,
): CatalogueItem => ({
  group: 'workflow',
  title,
  line,
  note: `Public · ${version} · ${String(steps)} steps`,
  what: title,
  ref: `${title}@${version}`,
  inputs,
  outputs,
  opens,
  steps,
  version,
});

export const WORKFLOWS: CatalogueItem[] = [
  workflow(
    'unicon/build',
    'Compiles the code, then lints it',
    'v3',
    4,
    ['source', 'language'],
    ['program', 'notes'],
    'build',
  ),
  workflow(
    'unicon/run',
    'Runs the program on one input, in a box',
    'v1',
    6,
    ['program', 'input', 'time_limit', 'memory_limit'],
    ['output', 'time_ms'],
    'run',
  ),
  workflow(
    'unicon/score',
    'Compares the output with the answer and gives points',
    'v2',
    3,
    ['output', 'answer'],
    ['points'],
    'score',
  ),
  workflow(
    'unicon/lint',
    'Lists style notes on the code',
    'v1',
    3,
    ['program'],
    ['notes'],
    'lint',
  ),
  workflow(
    'unicon/classic',
    'Build, run and score, in one box',
    'v3',
    3,
    ['code', 'language', 'time_limit', 'memory_limit', 'input', 'answer'],
    ['points', 'time_ms'],
  ),
  workflow(
    'cs2109s/cartpole',
    'Plays a cartpole agent for a few episodes',
    'v1',
    2,
    ['weights'],
    ['reward'],
  ),
];

export const CLASSIC: Level = {
  name: 'unicon/classic',
  inputs: [
    { name: 'code', type: 'folder', said: 'the code to build' },
    { name: 'language', type: 'choice', said: 'which compiler builds it' },
    { name: 'time_limit', type: 'number', said: 'seconds each run may take' },
    { name: 'memory_limit', type: 'number', said: 'megabytes each run may use' },
    { name: 'input', type: 'file', said: 'what the program reads on this run' },
    { name: 'answer', type: 'file', said: 'what it should print on this run' },
  ],
  boxes: [
    {
      id: 'build',
      title: 'build',
      line: 'unicon/build@v2',
      description: 'Compiles the code, then lints it.',
      kind: 'workflow',
      inputs: ['source', 'language'],
      outputs: ['program', 'notes'],
      needed: ['source', 'language'],
      opens: 'build',
      steps: 4,
      version: 'v2',
      newer: 'v3',
    },
    {
      id: 'run',
      title: 'run',
      line: 'unicon/run@v1',
      description: "Runs the program on this run's input, in a box with limits.",
      kind: 'workflow',
      inputs: ['program', 'input', 'time_limit', 'memory_limit'],
      outputs: ['output', 'time_ms'],
      needed: ['program', 'input', 'time_limit', 'memory_limit'],
      opens: 'run',
      steps: 6,
      version: 'v1',
    },
    {
      id: 'score',
      title: 'score',
      line: 'unicon/score@v2',
      description: 'Compares the output with the answer and gives points.',
      kind: 'workflow',
      inputs: ['output', 'answer'],
      outputs: ['points'],
      needed: ['output', 'answer'],
      opens: 'score',
      steps: 3,
      version: 'v2',
    },
  ],
  wires: [
    { from: 'inputs', fromPort: 'code', to: 'build', toPort: 'source' },
    { from: 'inputs', fromPort: 'language', to: 'build', toPort: 'language' },
    { from: 'build', fromPort: 'program', to: 'run', toPort: 'program' },
    { from: 'inputs', fromPort: 'input', to: 'run', toPort: 'input' },
    { from: 'inputs', fromPort: 'time_limit', to: 'run', toPort: 'time_limit' },
    { from: 'inputs', fromPort: 'memory_limit', to: 'run', toPort: 'memory_limit' },
    { from: 'run', fromPort: 'output', to: 'score', toPort: 'output' },
  ],
  outputs: [
    { name: 'points', box: 'score', port: 'points' },
    { name: 'time_ms', box: 'run', port: 'time_ms', unit: 'ms' },
  ],
};

const PROGRAMS: Record<string, Level> = {};

/**
 * A step. One that runs a program file of its own is a small workflow: open
 * it and the file goes in, `compile` builds it, `exec` runs it, and what
 * `exec` reports comes out.
 */
const step = (
  id: string,
  file: string | null,
  line: string,
  description: string,
  inputs: string[],
  outputs: string[],
): Step => {
  if (file === null)
    return {
      id,
      title: id,
      line,
      description,
      kind: 'primitive',
      inputs,
      outputs,
      needed: inputs,
    };
  const opens = `program:${id}`;
  PROGRAMS[opens] = {
    name: id,
    inputs: [
      { name: file, type: 'file', said: 'in this workflow', own: true },
      ...inputs.map((name) => ({
        name,
        type: 'file',
        said: 'from the outer workflow',
      })),
    ],
    boxes: [
      {
        id: 'compile',
        title: 'compile',
        line: 'unicon/compile@v3',
        description: `Builds ${file} into a program.`,
        kind: 'primitive',
        inputs: ['source'],
        outputs: ['program'],
        needed: ['source'],
      },
      {
        id: 'exec',
        title: 'exec',
        line: 'unicon/exec@v1',
        description,
        kind: 'primitive',
        inputs: ['program', ...inputs],
        outputs,
        needed: ['program', ...inputs],
      },
    ],
    wires: [
      { from: 'inputs', fromPort: file, to: 'compile', toPort: 'source' },
      { from: 'compile', fromPort: 'program', to: 'exec', toPort: 'program' },
      ...inputs.map((name) => ({
        from: 'inputs',
        fromPort: name,
        to: 'exec',
        toPort: name,
      })),
    ],
    outputs: outputs.map((name) => ({ name, box: 'exec', port: name })),
  };
  return {
    id,
    title: id,
    line: `unicon/${id}@v1`,
    description,
    kind: 'workflow',
    inputs,
    outputs,
    needed: inputs,
    opens,
    steps: 2,
    version: 'v1',
  };
};

export const INNERS: Record<string, Level> = {
  build: {
    name: 'build',
    inputs: [
      { name: 'source', type: 'folder', said: 'from the outer workflow' },
      { name: 'language', type: 'choice', said: 'from the outer workflow' },
    ],
    boxes: [
      step(
        'compile',
        null,
        'unicon/compile@v3',
        'Builds the source into a program.',
        ['source', 'language'],
        ['program', 'log'],
      ),
      {
        id: 'lint',
        title: 'lint',
        line: 'unicon/lint@v1',
        description: 'Lists style notes on the code.',
        kind: 'workflow',
        inputs: ['program'],
        outputs: ['notes'],
        needed: ['program'],
        opens: 'lint',
        steps: 3,
        version: 'v1',
      },
    ],
    wires: [
      { from: 'inputs', fromPort: 'source', to: 'compile', toPort: 'source' },
      { from: 'inputs', fromPort: 'language', to: 'compile', toPort: 'language' },
      { from: 'compile', fromPort: 'program', to: 'lint', toPort: 'program' },
    ],
    outputs: [
      { name: 'program', box: 'compile', port: 'program' },
      { name: 'notes', box: 'lint', port: 'notes' },
    ],
  },
  lint: {
    name: 'lint',
    inputs: [{ name: 'program', type: 'folder', said: 'from the outer workflow' }],
    boxes: [
      step(
        'read',
        'read.py',
        'unicon/exec@v1',
        'Reads every source file as text.',
        ['source'],
        ['text'],
      ),
      step(
        'check',
        'check.py',
        'unicon/exec@v1',
        'Finds the lines that break the style rules.',
        ['text'],
        ['notes'],
      ),
      step(
        'list',
        'list.py',
        'unicon/exec@v1',
        'Puts the notes in a list the entrant sees.',
        ['notes'],
        ['list'],
      ),
    ],
    wires: [
      { from: 'inputs', fromPort: 'program', to: 'read', toPort: 'source' },
      { from: 'read', fromPort: 'text', to: 'check', toPort: 'text' },
      { from: 'check', fromPort: 'notes', to: 'list', toPort: 'notes' },
    ],
    outputs: [{ name: 'notes', box: 'list', port: 'list' }],
  },
  run: {
    name: 'run',
    inputs: [
      { name: 'program', type: 'file', said: 'from the outer workflow' },
      { name: 'input', type: 'file', said: 'from the outer workflow' },
      { name: 'time_limit', type: 'number', said: 'from the outer workflow' },
      { name: 'memory_limit', type: 'number', said: 'from the outer workflow' },
    ],
    boxes: [
      step(
        'prepare',
        'prepare.py',
        'unicon/exec@v1',
        'Puts the program in a fresh box.',
        ['program'],
        ['image'],
      ),
      step(
        'execute',
        null,
        'unicon/exec@v1',
        'Runs it on the input, with the time and memory limits.',
        ['image', 'input', 'time_limit', 'memory_limit'],
        ['output', 'time_ms'],
      ),
      step(
        'collect',
        'collect.py',
        'unicon/exec@v1',
        'Keeps what it printed, cut to the size limit.',
        ['output'],
        ['output'],
      ),
    ],
    wires: [
      { from: 'inputs', fromPort: 'program', to: 'prepare', toPort: 'program' },
      { from: 'prepare', fromPort: 'image', to: 'execute', toPort: 'image' },
      { from: 'inputs', fromPort: 'input', to: 'execute', toPort: 'input' },
      { from: 'inputs', fromPort: 'time_limit', to: 'execute', toPort: 'time_limit' },
      {
        from: 'inputs',
        fromPort: 'memory_limit',
        to: 'execute',
        toPort: 'memory_limit',
      },
      { from: 'execute', fromPort: 'output', to: 'collect', toPort: 'output' },
    ],
    outputs: [
      { name: 'output', box: 'collect', port: 'output' },
      { name: 'time_ms', box: 'execute', port: 'time_ms' },
    ],
  },
  score: {
    name: 'score',
    inputs: [
      { name: 'output', type: 'file', said: 'from the outer workflow' },
      { name: 'answer', type: 'file', said: 'from the outer workflow' },
      { name: 'points.py', type: 'file', said: 'in this workflow', own: true },
    ],
    boxes: [
      step(
        'match',
        null,
        'unicon/diff-check@v2',
        'Says whether the output is the answer, ignoring spaces.',
        ['output', 'answer'],
        ['same'],
      ),
      step(
        'compile',
        null,
        'unicon/compile@v3',
        'Builds points.py into a program.',
        ['source'],
        ['program'],
      ),
      step(
        'points',
        null,
        'unicon/exec@v1',
        'Runs points.py: 1 point for a match, 0 otherwise.',
        ['program', 'same'],
        ['points'],
      ),
    ],
    wires: [
      { from: 'inputs', fromPort: 'output', to: 'match', toPort: 'output' },
      { from: 'inputs', fromPort: 'answer', to: 'match', toPort: 'answer' },
      { from: 'inputs', fromPort: 'points.py', to: 'compile', toPort: 'source' },
      { from: 'compile', fromPort: 'program', to: 'points', toPort: 'program' },
      { from: 'match', fromPort: 'same', to: 'points', toPort: 'same' },
    ],
    outputs: [{ name: 'points', box: 'points', port: 'points' }],
  },
};

Object.assign(INNERS, PROGRAMS);

export type StepProblem = { id: string; where: string; message: string };

export function problemsOfLevel(level: Level): StepProblem[] {
  const found: StepProblem[] = [];
  for (const box of level.boxes) {
    for (const port of box.needed) {
      const fed = level.wires.some(
        (wire) => wire.to === box.id && wire.toPort === port,
      );
      if (!fed)
        found.push({
          id: box.id,
          where: box.title,
          message: `nothing goes into ${port}`,
        });
    }
  }
  const names = new Set<string>();
  for (const output of level.outputs) {
    if (names.has(output.name))
      found.push({
        id: 'outputs',
        where: 'Outputs',
        message: `${output.name} is used twice`,
      });
    names.add(output.name);
    const box = level.boxes.find((item) => item.id === output.box);
    if (box === undefined || !box.outputs.includes(output.port))
      found.push({
        id: 'outputs',
        where: 'Outputs',
        message: `${output.name} does not read a step output`,
      });
  }
  return found;
}

let added = 0;

export function addStepTo(level: Level, item: CatalogueItem): Level {
  added += 1;
  const id = `box-${String(added)}`;
  const taken = new Set(level.boxes.map((box) => box.title));
  const title = taken.has(item.title) ? `${item.title} ${String(added)}` : item.title;
  if (item.group === 'input') {
    const taken = new Set(level.inputs.map((each) => each.name));
    const base = item.title.replace(/[^a-z]+/g, '_');
    let name = base;
    for (let n = 2; taken.has(name); n += 1) name = `${base}_${String(n)}`;
    return {
      ...level,
      inputs: [...level.inputs, { name, type: item.title, said: 'say what it is for' }],
    };
  }
  const box: Step = {
    id,
    title,
    line: item.ref,
    description: item.line + '.',
    kind: item.group,
    inputs: item.inputs,
    outputs: item.outputs,
    needed: item.inputs,
    opens: item.opens,
    steps: item.steps,
    version: item.version,
  };
  return { ...level, boxes: [...level.boxes, box] };
}

export function moveToNewer(level: Level, id: string): Level {
  return {
    ...level,
    boxes: level.boxes.map((box) => {
      if (box.id !== id || box.newer === undefined) return box;
      const version = box.newer;
      return {
        ...box,
        version,
        newer: undefined,
        line: box.line.replace(/@v\d+$/, `@${version}`),
      };
    }),
  };
}

export function renameStep(level: Level, id: string, title: string): Level {
  return {
    ...level,
    boxes: level.boxes.map((box) => (box.id === id ? { ...box, title } : box)),
  };
}

export function setOutputs(level: Level, outputs: Report[]): Level {
  return { ...level, outputs };
}

export function setSecret(level: Level, name: string, secret: boolean): Level {
  return {
    ...level,
    inputs: level.inputs.map((each) =>
      each.name === name ? { ...each, secret } : each,
    ),
  };
}

/** What feeds one input. An empty source clears the wire. */
export function setInput(
  level: Level,
  id: string,
  port: string,
  source: string,
): Level {
  const wires = level.wires.filter((wire) => !(wire.to === id && wire.toPort === port));
  if (source === '') return { ...level, wires };
  const dot = source.indexOf('.');
  if (dot <= 0) return level;
  const box = source.slice(0, dot);
  const fromPort = source.slice(dot + 1);
  return { ...level, wires: [...wires, { from: box, fromPort, to: id, toPort: port }] };
}

/** Its inputs and outputs in a line, while its ports are hidden. */
function ioOf(inputs: string[], outputs: string[]): string {
  const needs = inputs.length === 0 ? '' : `needs ${inputs.join(', ')}`;
  const gives = outputs.length === 0 ? '' : `gives ${outputs.join(', ')}`;
  return [needs, gives].filter((part) => part !== '').join(' · ');
}

/** What feeds a port, in words, as the workflow graph says it. */
function fedBy(level: Level, id: string, port: string): string | undefined {
  const wire = level.wires.find((each) => each.to === id && each.toPort === port);
  if (wire === undefined) return undefined;
  return sourceWords(level, wire.from, wire.fromPort);
}

function sourceWords(level: Level, from: string, port: string): string {
  if (from === 'inputs') return `${port} from the inputs`;
  const box = level.boxes.find((each) => each.id === from);
  return `${port} from ${box?.title ?? from}`;
}

/** The level as boxes: each input its own box on the left, its outputs on the right. */
export function viewOf(level: Level): { boxes: GraphBox[]; wires: GraphWire[] } {
  const boxes: GraphBox[] = [
    ...level.inputs.map((each): GraphBox => ({
      id: `input:${each.name}`,
      title: each.name,
      role: 'input',
      kind: each.own === true ? 'file' : 'input',
      ...(each.own === true
        ? {
            file: each.name,
            description: 'A file in this workflow, beside workflow.yaml.',
          }
        : {
            what: `${each.type.charAt(0).toUpperCase()}${each.type.slice(1)}${each.secret === true ? ' · secret' : ''}`,
            description: `${each.said.charAt(0).toUpperCase()}${each.said.slice(1)}.`,
          }),
      ports: [{ name: each.name, side: 'out' }],
    })),
    ...level.boxes.map((box): GraphBox => {
      const unfed = box.needed.filter(
        (port) => fedBy(level, box.id, port) === undefined,
      );
      return {
        id: box.id,
        title: box.title,
        kind: box.kind === 'workflow' ? 'workflow' : 'primitive',
        ref: box.line,
        description: box.description,
        warn:
          unfed.length > 0
            ? `nothing goes into ${unfed.join(', ')}`
            : box.newer !== undefined
              ? `${box.newer} is out`
              : undefined,
        io: ioOf(box.inputs, box.outputs),
        foot:
          box.kind === 'workflow'
            ? `${String(box.steps ?? 0)} steps inside`
            : undefined,
        stacked: box.kind === 'workflow',
        openable: box.opens !== undefined,
        ports: [
          ...box.inputs.map((name) => ({
            name,
            side: 'in' as const,
            said: fedBy(level, box.id, name) ?? 'nothing yet',
          })),
          ...box.outputs.map((name) => ({ name, side: 'out' as const })),
        ],
      };
    }),
  ];
  const wires: GraphWire[] = level.wires.map((wire) =>
    wire.from === 'inputs' ? { ...wire, from: `input:${wire.fromPort}` } : { ...wire },
  );
  boxes.push({
    id: 'outputs',
    title: 'Outputs',
    role: 'output',
    kind: String(level.outputs.length),
    description:
      level.outputs.length === 0
        ? 'None yet.'
        : level.outputs
            .map((output) => sourceWords(level, output.box, output.port))
            .join('; '),
    ports: level.outputs.map((output) => ({
      name: output.name,
      side: 'in' as const,
      said: sourceWords(level, output.box, output.port),
    })),
  });
  for (const output of level.outputs)
    wires.push({
      from: output.box,
      fromPort: output.port,
      to: 'outputs',
      toPort: output.name,
    });
  return { boxes, wires };
}

export function isCatalogueItem(value: unknown): value is CatalogueItem {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Partial<CatalogueItem>;
  return (
    (item.group === 'input' ||
      item.group === 'primitive' ||
      item.group === 'workflow') &&
    typeof item.title === 'string' &&
    typeof item.line === 'string' &&
    typeof item.ref === 'string' &&
    Array.isArray(item.inputs) &&
    Array.isArray(item.outputs)
  );
}
