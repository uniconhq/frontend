import type { Catalogue } from './catalogue';
import type { FormulaScope } from './parse';

type Block = Catalogue['blocks'][number];
type Form = Block['forms'][number];
type Input = Form['inputs'][string];

const WORDS: Record<Input['kind'], string> = {
  number: 'a number',
  text: 'text',
  runs: 'a group',
  run: 'one run',
  results: "a task's results",
  submission: 'one submission',
  number_or_text: 'a number or text',
  either: 'a number or a submission',
  name: "a value's name",
  directions: 'ranking directions',
  weights: 'run weights',
  missing: 'a missing value',
  path: 'a program folder',
  language: 'a language',
};

export function kindWords(kind: Input['kind']): string {
  return WORDS[kind];
}

export function inputWords(input: Input, where: FormulaScope['where']): string {
  const limits =
    input.least === null
      ? ''
      : ` (at least ${String(input.least)}${input.most === null ? '' : `, at most ${String(input.most)}`})`;
  return `${kindWords(input.kind)}${input.per_run ? (where === 'task' ? ' for each run' : ' for each submission') : ''}${input.plain ? ', written out' : ''}${limits}`;
}

function shortShape(form: Form): string {
  const inputs = Object.values(form.inputs);
  const group = inputs.find(
    (input) => input.kind === 'runs' || input.kind === 'results',
  );
  const picks = form.gives === 'run' || form.gives === 'submission';
  const perRun = inputs.some((input) => input.per_run && !input.optional);
  let given: string;
  if (inputs.some((input) => input.kind === 'path')) given = 'a program';
  else if (group !== undefined && (picks || !perRun))
    given = group.kind === 'runs' ? 'a group' : 'task results';
  else if (form.given === "submissions' results") given = 'submissions';
  else if (
    inputs.some((input) => input.kind === 'number_or_text' || input.kind === 'either')
  )
    given = 'numbers/text';
  else given = 'numbers';
  const gives =
    form.gives === 'number'
      ? 'one number'
      : form.gives === 'number_or_text'
        ? 'number/text'
        : form.gives === 'either'
          ? 'number/submission'
          : kindWords(form.gives);
  return `${given} → ${gives}`;
}

/** Pass only the forms available on this page. */
export function shapeOf(block: Block): string {
  const shapes = block.forms.map(shortShape);
  return `${shapes[0] ?? ''}${new Set(shapes).size > 1 ? '…' : ''}`;
}

export function columnOf(
  block: Block,
): 'start' | 'many' | 'pick' | 'program' | 'maths' {
  const forms = block.forms;
  if (forms.some((form) => Object.values(form.inputs).some((i) => i.kind === 'path')))
    return 'program';
  if (forms.some((form) => form.gives === 'run' || form.gives === 'submission'))
    return 'pick';
  if (
    forms.some((form) =>
      Object.values(form.inputs).some((i) => i.kind === 'runs' || i.kind === 'results'),
    )
  )
    return 'many';
  return 'maths';
}
