import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  autocompletion,
  closeCompletion,
  startCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
  type CompletionSection,
} from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { forceLinting, linter, type Diagnostic } from '@codemirror/lint';
import {
  Annotation,
  Compartment,
  EditorState,
  RangeSetBuilder,
  StateEffect,
  Transaction,
} from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  keymap,
  placeholder as placeholderText,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import { BodyText } from '@/ui/BodyText';
import type { Catalogue } from './catalogue';
import {
  contextAt,
  describeFormula,
  formsFor,
  piecesOf,
  readLine,
  spanOf,
  type Context,
  type FormulaScope,
  type PieceKind,
} from './parse';
import type { Insert, Inserter } from './target';
import type { FlowAbout } from './flow';
import { TileCard } from './TileCard';
import { columnOf, inputWords, kindWords, shapeOf } from './shapes';
import { exampleFor } from './examples';
import classes from './formula.module.css';

const SYMBOL: Record<string, string> = {
  add: '+',
  sub: '-',
  mul: '*',
  div: '/',
  lt: '<',
  le: '<=',
  gt: '>',
  ge: '>=',
  eq: '==',
  ne: '!=',
  and: 'and',
  or: 'or',
  not: 'not',
};

export type FormulaMark = { path: readonly (string | number)[]; message: string };

function insertFor(name: string): Insert {
  const symbol = SYMBOL[name];
  if (symbol === undefined) return { text: `${name}()`, caret: name.length + 1 };
  if (symbol === 'not') return { text: 'not ' };
  return { text: ` ${symbol} ` };
}

function signature(
  name: string,
  input: string,
  form: ReturnType<typeof formsFor>[number],
): ReactNode {
  const keys = Object.keys(form.inputs);
  const at = keys.indexOf(input);
  return (
    <>
      {name}(
      {keys.map((key, index) => (
        <span key={key}>
          {index > 0 && ', '}
          {index === at ? <b>{key}</b> : key}
          {form.inputs[key]?.optional === true && '?'}
        </span>
      ))}
      )
    </>
  );
}

const CHIP: Partial<Record<PieceKind, string | undefined>> = {
  value: classes.chipValue,
  'text-value': classes.chipText,
  each: classes.chipEach,
  set: classes.chipSet,
  field: classes.chipValue,
  block: classes.chipBlock,
  number: classes.chipNumber,
  text: classes.chipString,
  hole: classes.chipHole,
};

const SECTIONS: Record<string, CompletionSection> = {
  set: { name: 'Groups', rank: 0 },
  field: { name: 'Columns', rank: 1 },
  each: { name: 'For each one', rank: 2 },
  value: { name: 'Values', rank: 3 },
  block: { name: 'Work it out', rank: 4 },
};

function blocksIn(catalogue: Catalogue, where: FormulaScope['where']) {
  return catalogue.blocks.filter((block) =>
    block.forms.some((form) => form.scope === 'both' || form.scope === where),
  );
}

function completionsFor(
  context: Context,
  scope: FormulaScope,
  catalogue: Catalogue,
): Completion[] {
  const task = scope.where === 'task';
  const texts = new Set(scope.texts ?? []);
  const named = (names: readonly string[], section: string, fallback: string) =>
    names.map((name): Completion => ({
      label: name,
      detail: texts.has(name) ? 'text' : undefined,
      info: scope.about?.[name] ?? fallback,
      section: SECTIONS[section],
    }));
  if (context.want === 'field')
    return Object.entries(scope.fields ?? {}).map(([name, kind]) => ({
      label: name,
      displayLabel: `.${name}`,
      detail: kind,
      section: SECTIONS.field,
    }));
  if (context.want === 'set')
    return named(scope.sets, 'set', task ? 'A group of runs' : 'A task');
  const seen = new Set<string>();
  const blocks = blocksIn(catalogue, scope.where)
    .filter((block) => SYMBOL[block.name] === undefined && !seen.has(block.name))
    .map((block): Completion => {
      seen.add(block.name);
      const insert = insertFor(block.name);
      return {
        label: block.name,
        displayLabel: `${block.name}(…)`,
        detail: block.words,
        info: block.words,
        section: SECTIONS.block,
        apply: (view, _completion, from, to) => {
          view.dispatch({
            changes: { from, to, insert: insert.text },
            selection: { anchor: from + (insert.caret ?? insert.text.length) },
          });
          setTimeout(() => startCompletion(view), 0);
        },
      };
    });
  return [
    ...(context.each
      ? named(scope.each, 'each', task ? 'One for each run' : 'One for each submission')
      : []),
    ...named(scope.names, 'value', task ? 'A value' : 'A column'),
    ...blocks,
  ];
}

const fromValue = Annotation.define<boolean>();
const rescoped = StateEffect.define<null>();

function chipsOf(
  view: EditorView,
  scope: FormulaScope,
  catalogue: Catalogue,
): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const piece of piecesOf(view.state.doc.toString(), scope, catalogue)) {
    const kind =
      piece.kind === 'field' && scope.fields?.[piece.text.slice(1)] === 'text'
        ? 'text-value'
        : piece.kind;
    const chip = CHIP[kind];
    if (chip !== undefined && piece.from < piece.to)
      builder.add(piece.from, piece.to, Decoration.mark({ class: chip }));
  }
  return builder.finish();
}

const look = EditorView.theme({
  '&': {
    fontSize: '14px',
    color: 'var(--unicon-text-primary)',
    backgroundColor: 'var(--unicon-body)',
    border: '1px solid var(--unicon-border-strong)',
    borderRadius: 'var(--mantine-radius-sm)',
  },
  '&.cm-focused': {
    outline: 'none',
    borderColor: 'var(--mantine-primary-color-filled)',
    boxShadow: '0 0 0 1px var(--mantine-primary-color-filled)',
  },
  '.cm-scroller': { fontFamily: 'inherit', lineHeight: '1.8' },
  '.cm-content': { padding: '5px 8px', caretColor: 'var(--unicon-text-primary)' },
  '.cm-line': { padding: '0' },
  '.cm-placeholder': { color: 'var(--unicon-text-meta)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    backgroundColor: 'var(--unicon-border-strong) !important',
  },
  '.cm-tooltip': {
    border: '1px solid var(--unicon-border)',
    borderRadius: 'var(--mantine-radius-sm)',
    backgroundColor: 'var(--unicon-body)',
    color: 'var(--unicon-text-body)',
    boxShadow: '0 8px 24px rgb(0 0 0 / 16%)',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul': {
    fontFamily: 'inherit',
    maxHeight: '18em',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li': { padding: '3px 10px' },
  '.cm-tooltip-autocomplete ul li[aria-selected]': {
    backgroundColor: 'var(--unicon-hover)',
    color: 'var(--unicon-text-primary)',
  },
  '.cm-completionSection': {
    padding: '6px 10px 2px',
    fontSize: '11px',
    fontWeight: '600',
    color: 'var(--unicon-text-meta)',
    borderBottom: '0',
  },
  '.cm-completionDetail': {
    marginLeft: '10px',
    fontStyle: 'normal',
    fontSize: '12px',
    color: 'var(--unicon-text-secondary)',
  },
  '.cm-completionInfo': { padding: '6px 10px', maxWidth: '280px', fontSize: '12px' },
  '.cm-diagnostic': { fontSize: '12px' },
});

/**
 * One formula as a line of text. Names, groups and columns show as coloured
 * blocks as they are typed; what fits at the cursor pops up as you type (or
 * with Ctrl+Space); mistakes are underlined once you leave the line, so a
 * half-typed word is never called wrong. A forge refusal is underlined from
 * its path. Under the line it says what the formula means, in words.
 */
export function FormulaLine({
  label,
  scope: given,
  catalogue,
  value,
  onChange,
  onFocusLine,
  onPoint,
  marks = [],
  placeholder = 'Type, or click a tile above',
  autoFocus = false,
  trouble,
  disabled = false,
}: {
  label: string;
  scope: FormulaScope;
  catalogue: Catalogue;
  value: string;
  onChange: (value: string) => void;
  onFocusLine?: (insert: Inserter) => void;
  onPoint?: (name: string | null) => void;
  /** A forge refusal, named by the path in the block tree. */
  marks?: readonly FormulaMark[];
  placeholder?: string;
  autoFocus?: boolean;
  trouble?: string;
  disabled?: boolean;
}) {
  const scope = useMemo(
    () => ({ ...given, names: given.names.filter((name) => name !== label) }),
    [given, label],
  );
  const access = useRef(new Compartment());
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const [caret, setCaret] = useState<number | null>(null);
  const reading = useMemo(
    () => readLine(value, scope, catalogue),
    [value, scope, catalogue],
  );

  const latest = useRef({
    scope,
    catalogue,
    onChange,
    onFocusLine,
    onPoint,
    marks,
    disabled,
  });
  useEffect(() => {
    latest.current = {
      scope,
      catalogue,
      onChange,
      onFocusLine,
      onPoint,
      marks,
      disabled,
    };
  });
  const start = useRef({ value, placeholder, label, autoFocus, disabled });

  useEffect(() => {
    if (host.current === null) return;
    const scopeNow = () => latest.current.scope;
    const catalogueNow = () => latest.current.catalogue;
    const insert: Inserter = (piece) => {
      const current = view.current;
      if (current === null || latest.current.disabled) return;
      const doc = current.state.doc.toString();
      const { from: begin, to } = current.state.selection.main;
      const from =
        begin === to && /^[A-Za-z_]/.test(piece.text)
          ? contextAt(doc, to, scopeNow(), catalogueNow()).from
          : begin;
      let text = piece.text;
      let land = piece.caret ?? text.length;
      if (text.startsWith(' ') && (from === 0 || doc[from - 1] === ' ')) {
        text = text.slice(1);
        land -= 1;
      }
      if (text.endsWith(' ') && doc[to] === ' ') text = text.slice(0, -1);
      current.focus();
      current.dispatch({
        changes: { from, to, insert: text },
        selection: { anchor: from + Math.min(land, text.length) },
      });
      if (text.endsWith('()')) setTimeout(() => startCompletion(current), 0);
    };
    const source = (context: CompletionContext): CompletionResult | null => {
      if (latest.current.disabled) return null;
      const doc = context.state.doc.toString();
      const at = contextAt(doc, context.pos, scopeNow(), catalogueNow());
      const quiet =
        !context.explicit &&
        at.typed === '' &&
        at.want === 'value' &&
        !/[(,]\s*$/.test(doc.slice(0, context.pos));
      if (quiet) return null;
      return {
        from: at.from,
        options: completionsFor(at, scopeNow(), catalogueNow()),
        validFor: /^[A-Za-z0-9_.]*$/,
      };
    };
    const chips = ViewPlugin.fromClass(
      class {
        decorations: DecorationSet;
        constructor(editor: EditorView) {
          this.decorations = chipsOf(editor, scopeNow(), catalogueNow());
        }
        update(update: ViewUpdate) {
          if (
            update.docChanged ||
            update.transactions.some((tr) => tr.effects.some((e) => e.is(rescoped)))
          )
            this.decorations = chipsOf(update.view, scopeNow(), catalogueNow());
        }
      },
      { decorations: (plugin) => plugin.decorations },
    );
    const mistakes = linter(
      (editor): Diagnostic[] => {
        const doc = editor.state.doc.toString();
        const read = readLine(doc, scopeNow(), catalogueNow());
        const refused = latest.current.marks.flatMap((mark): Diagnostic[] => {
          if (read.node === null) return [];
          const span = spanOf(read.node, mark.path, catalogueNow(), scopeNow().where);
          if (span === null) return [];
          return [
            {
              from: span.from,
              to: span.to,
              severity: 'error',
              message: mark.message,
            },
          ];
        });
        if (editor.hasFocus) return refused;
        if (read.unread !== null) {
          const from = Math.min(read.unread.at, doc.length);
          return [
            ...refused,
            {
              from,
              to: Math.min(from + 1, doc.length),
              severity: 'error',
              message: read.unread.message,
            },
          ];
        }
        return [
          ...refused,
          ...read.problems.flatMap((problem): Diagnostic[] =>
            problem.span === undefined
              ? []
              : [
                  {
                    from: problem.span.from,
                    to: problem.span.to,
                    severity: 'error',
                    message: problem.message,
                  },
                ],
          ),
        ];
      },
      { delay: 200 },
    );
    const initial = start.current;
    const created = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: initial.value,
        extensions: [
          access.current.of([
            EditorState.readOnly.of(initial.disabled),
            EditorView.editable.of(!initial.disabled),
          ]),
          EditorState.changeFilter.of(
            (tr) => !latest.current.disabled || tr.annotation(fromValue) === true,
          ),
          history(),
          autocompletion({ override: [source], icons: false }),
          keymap.of([
            { key: 'Enter', run: () => true },
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          EditorState.transactionFilter.of((tr) =>
            tr.docChanged && tr.newDoc.lines > 1
              ? {
                  changes: {
                    from: 0,
                    to: tr.startState.doc.length,
                    insert: tr.newDoc.toString().replace(/\n/g, ' '),
                  },
                  selection: tr.newSelection,
                }
              : tr,
          ),
          EditorView.lineWrapping,
          placeholderText(initial.placeholder),
          look,
          chips,
          mistakes,
          EditorView.contentAttributes.of({
            'aria-label': initial.label,
            role: 'textbox',
            tabindex: '0',
          }),
          EditorView.updateListener.of((update) => {
            const focused = update.view.hasFocus;
            if (
              !latest.current.disabled &&
              update.docChanged &&
              !update.transactions.some((tr) => tr.annotation(fromValue) === true)
            )
              latest.current.onChange(update.state.doc.toString());
            if (update.focusChanged) {
              if (focused && !latest.current.disabled)
                latest.current.onFocusLine?.(insert);
              else forceLinting(update.view);
            }
            if (update.focusChanged || update.selectionSet || update.docChanged)
              setCaret(focused ? update.state.selection.main.head : null);
          }),
        ],
      }),
    });
    view.current = created;
    if (initial.autoFocus && !initial.disabled) created.focus();
    return () => {
      created.destroy();
      view.current = null;
    };
  }, []);

  useEffect(() => {
    const current = view.current;
    if (current === null) return;
    current.contentDOM.setAttribute('aria-label', label);
    current.contentDOM.setAttribute('aria-readonly', String(disabled));
    if (disabled) closeCompletion(current);
    current.dispatch({
      effects: access.current.reconfigure([
        EditorState.readOnly.of(disabled),
        EditorView.editable.of(!disabled),
      ]),
    });
  }, [label, disabled]);

  useEffect(() => {
    const current = view.current;
    if (current === null) return;
    const text = current.state.doc.toString();
    if (text === value) return;
    current.dispatch({
      changes: { from: 0, to: text.length, insert: value },
      annotations: [fromValue.of(true), Transaction.addToHistory.of(false)],
    });
  }, [value]);

  const scopeKey = JSON.stringify(scope);
  const markKey = JSON.stringify(marks);
  useEffect(() => {
    const current = view.current;
    if (current === null) return;
    current.dispatch({ effects: rescoped.of(null) });
    forceLinting(current);
  }, [scopeKey, markKey]);

  const context = caret === null ? null : contextAt(value, caret, scope, catalogue);
  const pointed =
    caret === null
      ? null
      : (piecesOf(value, scope, catalogue).find(
          (piece) =>
            piece.from <= caret &&
            caret <= piece.to &&
            ['value', 'text-value', 'each', 'set', 'field'].includes(piece.kind),
        )?.text ?? null);
  const said = useRef<string | null>(null);
  useEffect(() => {
    if (said.current === pointed) return;
    said.current = pointed;
    latest.current.onPoint?.(pointed);
  }, [pointed]);

  const node = reading.node;
  const marked =
    node === null
      ? []
      : marks.flatMap((mark) =>
          spanOf(node, mark.path, catalogue, scope.where) === null
            ? []
            : [mark.message],
        );
  const problems = [
    ...marked,
    ...(reading.unread === null
      ? reading.problems.map((problem) => problem.message)
      : [reading.unread.message]),
  ];
  const first = problems[0];
  const call =
    context?.call === undefined
      ? undefined
      : formsFor(catalogue, context.call.block, scope.where).find((form) =>
          Object.hasOwn(form.inputs, context.call?.input ?? ''),
        );
  const words = catalogue.blocks.find(
    (block) => block.name === context?.call?.block,
  )?.words;

  return (
    <div className={classes.formulaBox}>
      <div ref={host} />
      {trouble !== undefined ? (
        <div className={classes.formulaProblems}>{trouble}</div>
      ) : context?.call !== undefined && call !== undefined ? (
        <div className={classes.formulaHint}>
          <span className={classes.formulaSign}>
            {signature(context.call.block, context.call.input, call)}
          </span>{' '}
          {words}
        </div>
      ) : (
        reading.node !== null &&
        value.trim() !== '' && (
          <div className={classes.formulaHint}>
            {describeFormula(reading.node, scope)}
          </div>
        )
      )}
      {trouble === undefined && caret === null && first !== undefined && (
        <div className={classes.formulaProblems}>
          {first}
          {problems.length > 1 &&
            ` (and ${String(problems.length - 1)} more: point at the underlines)`}
        </div>
      )}
    </div>
  );
}

type Tile = {
  key: string;
  name: string;
  shape: string;
  details: ReactNode;
  kind: PieceKind;
  insert: Insert;
};

function Tiles({ tiles, onInsert }: { tiles: Tile[]; onInsert: Inserter }) {
  return (
    <div className={classes.tiles}>
      {tiles.map((tile) => (
        <TileCard
          key={tile.key}
          name={tile.name}
          shape={tile.shape}
          tone={CHIP[tile.kind]}
          insert={tile.insert}
          onInsert={onInsert}
        >
          {tile.details}
        </TileCard>
      ))}
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={`${classes.group} ${classes.tray}`}>
      <h2 className={classes.groupTitle}>{title}</h2>
      {children}
    </div>
  );
}

/** Everything a formula can use, one tile per name and per block, plus the symbols. */
export function FormulaTiles({
  scope: given,
  catalogue,
  onInsert,
  target,
  names,
}: {
  scope: FormulaScope;
  catalogue: Catalogue;
  onInsert: Inserter;
  target: string | null;
  names?: ReadonlyMap<string, Omit<FlowAbout, 'name'>>;
}) {
  const scope = {
    ...given,
    names: given.names.filter(
      (name) => name !== target && given.real?.[name] !== target,
    ),
  };
  const task = scope.where === 'task';
  const texts = new Set(scope.texts ?? []);
  const named = (items: readonly string[], kind: PieceKind): Tile[] =>
    items.map((name) => {
      const members = scope.members?.[name];
      const shape =
        kind === 'set'
          ? task
            ? `a group${members === undefined ? '' : ` · ${String(members.length)} ${members.length === 1 ? 'run' : 'runs'}`}`
            : "a task's results"
          : kind === 'each'
            ? `${texts.has(name) ? 'text' : 'a number'} for each ${task ? 'run' : 'submission'}`
            : scope.picks?.includes(name)
              ? task
                ? 'one run'
                : 'one submission'
              : texts.has(name)
                ? 'text'
                : 'one number';
      return {
        key: name,
        name,
        shape,
        details:
          members === undefined ? (
            <p>{names?.get(name)?.description ?? scope.about?.[name] ?? ''}</p>
          ) : (
            <ul>
              {members.map((member, index) => (
                <li key={index}>{member}</li>
              ))}
            </ul>
          ),
        kind: texts.has(name) ? 'text-value' : kind,
        insert: { text: name },
      };
    });
  const blocks = blocksIn(catalogue, scope.where).map((block) => ({
    ...block,
    forms: block.forms.filter(
      (form) => form.scope === 'both' || form.scope === scope.where,
    ),
  }));
  const tileOf = (block: Catalogue['blocks'][number]): Tile => {
    const example = exampleFor(block, scope, catalogue);
    return {
      key: block.name,
      name: SYMBOL[block.name] ?? `${block.name}(…)`,
      shape: shapeOf(block),
      kind: 'block',
      insert: insertFor(block.name),
      details: (
        <>
          <p>{block.words}</p>
          {block.forms.map((form, index) => (
            <div key={index} className={classes.tileForm}>
              {index > 0 && <div>or</div>}
              <dl>
                <dt>Takes</dt>
                <dd>
                  {form.given}
                  <ul>
                    {Object.entries(form.inputs).map(([name, input]) => (
                      <li key={name}>
                        {name}
                        {input.optional ? ' (optional)' : ''}:{' '}
                        {inputWords(input, scope.where)}
                      </li>
                    ))}
                  </ul>
                </dd>
                <dt>Gives</dt>
                <dd>
                  {form.gives === 'number' ? 'one number' : kindWords(form.gives)}
                </dd>
              </dl>
            </div>
          ))}
          {example !== null && (
            <div className={classes.tileExample}>
              e.g. <code>{example.formula}</code>
              <p>{example.words}</p>
            </div>
          )}
        </>
      ),
    };
  };
  const columns = Object.entries(scope.fields ?? {}).map(([name, kind]): Tile => ({
    key: `.${name}`,
    name: `.${name}`,
    shape: `${task ? 'one run' : 'one submission'} → ${kind === 'text' ? 'text' : 'one number'}`,
    details: (
      <p>
        {task
          ? `Reads ${name} off a picked run`
          : `Reads ${name} off a picked submission`}
      </p>
    ),
    kind: kind === 'text' ? 'text-value' : 'value',
    insert: { text: `.${name}` },
  }));
  const inColumn = (column: ReturnType<typeof columnOf>) =>
    blocks.filter((block) => columnOf(block) === column).map(tileOf);
  const otherColumns = Object.entries(scope.boardColumns ?? {}).flatMap(
    ([board, columns]) => columns.map((column) => `${board}.${column}`),
  );
  const programs = inColumn('program');
  return (
    <div className={classes.trays}>
      <BodyText size="sm" tone="secondary">
        {target === null
          ? 'Click in a formula, then click a tile to put it at the cursor. Or just type: what fits pops up as you go.'
          : `Click a tile to put it in ${target}, at the cursor.`}
      </BodyText>
      <div className={classes.trayRow}>
        <Group title="Start from">
          <Tiles tiles={named(scope.sets, 'set')} onInsert={onInsert} />
          <Tiles
            tiles={named([...scope.names, ...otherColumns], 'value')}
            onInsert={onInsert}
          />
        </Group>
        <Group title={task ? 'For each run' : 'For each submission'}>
          <Tiles tiles={named(scope.each, 'each')} onInsert={onInsert} />
        </Group>
        <Group title="Many into one">
          <Tiles tiles={inColumn('many')} onInsert={onInsert} />
        </Group>
        <Group
          title={
            task
              ? 'Pick one run, then read from it'
              : 'Pick one submission then read from it'
          }
        >
          <Tiles tiles={inColumn('pick')} onInsert={onInsert} />
          <Tiles tiles={columns} onInsert={onInsert} />
        </Group>
        <Group title="Maths, tests and text">
          <Tiles
            tiles={[
              ...inColumn('maths'),
              {
                key: 'text',
                name: '"…"',
                shape: 'text',
                details: <p>Some text, such as "none"</p>,
                kind: 'text',
                insert: { text: '""', caret: 1 },
              },
            ]}
            onInsert={onInsert}
          />
          {programs.length > 0 && (
            <>
              <h3 className={classes.trayHeading}>Run a program</h3>
              <Tiles tiles={programs} onInsert={onInsert} />
            </>
          )}
        </Group>
      </div>
    </div>
  );
}
