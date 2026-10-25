import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  autocompletion,
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
}) {
  const scope = useMemo(
    () => ({ ...given, names: given.names.filter((name) => name !== label) }),
    [given, label],
  );
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const [caret, setCaret] = useState<number | null>(null);
  const reading = useMemo(
    () => readLine(value, scope, catalogue),
    [value, scope, catalogue],
  );

  const latest = useRef({ scope, catalogue, onChange, onFocusLine, onPoint, marks });
  useEffect(() => {
    latest.current = { scope, catalogue, onChange, onFocusLine, onPoint, marks };
  });
  const start = useRef({ value, placeholder, label, autoFocus });

  useEffect(() => {
    if (host.current === null) return;
    const scopeNow = () => latest.current.scope;
    const catalogueNow = () => latest.current.catalogue;
    const insert: Inserter = (piece) => {
      const current = view.current;
      if (current === null) return;
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
          EditorView.contentAttributes.of({ 'aria-label': initial.label }),
          EditorView.updateListener.of((update) => {
            const focused = update.view.hasFocus;
            if (
              update.docChanged &&
              !update.transactions.some((tr) => tr.annotation(fromValue) === true)
            )
              latest.current.onChange(update.state.doc.toString());
            if (update.focusChanged) {
              if (focused) latest.current.onFocusLine?.(insert);
              else forceLinting(update.view);
            }
            if (update.focusChanged || update.selectionSet || update.docChanged)
              setCaret(focused ? update.state.selection.main.head : null);
          }),
        ],
      }),
    });
    view.current = created;
    if (initial.autoFocus) created.focus();
    return () => {
      created.destroy();
      view.current = null;
    };
  }, []);

  useEffect(() => {
    view.current?.contentDOM.setAttribute('aria-label', label);
  }, [label]);

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
      {context?.call !== undefined && call !== undefined ? (
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
      {caret === null && first !== undefined && (
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
  line: string;
  kind: PieceKind;
  insert: Insert;
};

function Tiles({ tiles, onInsert }: { tiles: Tile[]; onInsert: Inserter }) {
  return (
    <div className={classes.tiles}>
      {tiles.map((tile) => (
        <button
          key={tile.key}
          type="button"
          className={classes.paletteItem}
          title={tile.line}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onInsert(tile.insert)}
        >
          <span className={`${classes.tileName} ${CHIP[tile.kind] ?? ''}`}>
            {tile.name}
          </span>
          <span className={classes.paletteLine}>{tile.line}</span>
        </button>
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
  scope,
  catalogue,
  onInsert,
  target,
}: {
  scope: FormulaScope;
  catalogue: Catalogue;
  onInsert: Inserter;
  target: string | null;
}) {
  const task = scope.where === 'task';
  const texts = new Set(scope.texts ?? []);
  const named = (names: readonly string[], kind: PieceKind, fallback: string) =>
    names.map((name): Tile => ({
      key: name,
      name,
      line: scope.about?.[name] ?? fallback,
      kind: texts.has(name) ? 'text-value' : kind,
      insert: { text: name },
    }));
  const blocks = blocksIn(catalogue, scope.where);
  const tileOf = (name: string, words: string): Tile => {
    const symbol = SYMBOL[name];
    return {
      key: name,
      name: symbol ?? `${name}(…)`,
      line: words,
      kind: 'block',
      insert: insertFor(name),
    };
  };
  const over = blocks.filter((block) =>
    block.forms.some(
      (form) => form.inputs.over !== undefined || form.inputs.from !== undefined,
    ),
  );
  const maths = blocks.filter((block) => !over.includes(block));
  const columns = Object.entries(scope.fields ?? {}).map(([name, kind]): Tile => ({
    key: `.${name}`,
    name: `.${name}`,
    line: task
      ? `Reads ${name} off a picked run`
      : `Reads ${name} off a picked submission`,
    kind: kind === 'text' ? 'text-value' : 'value',
    insert: { text: `.${name}` },
  }));
  return (
    <div className={classes.trays}>
      <BodyText size="sm" tone="secondary">
        {target === null
          ? 'Click in a formula, then click a tile to put it at the cursor. Or just type: what fits pops up as you go.'
          : `Click a tile to put it in ${target}, at the cursor.`}
      </BodyText>
      <div className={classes.trayRow}>
        <Group title={task ? 'Groups' : 'Tasks'}>
          <Tiles
            tiles={named(scope.sets, 'set', task ? 'A group of runs' : 'A task')}
            onInsert={onInsert}
          />
          <h3 className={classes.trayHeading}>
            {task ? 'For each run of a group' : 'For each submission'}
          </h3>
          <Tiles
            tiles={named(
              scope.each,
              'each',
              task ? 'One for each run' : 'One per submission',
            )}
            onInsert={onInsert}
          />
        </Group>
        <Group title={task ? 'Values and facts' : 'Columns'}>
          <Tiles
            tiles={named(scope.names, 'value', task ? 'A value' : 'A column')}
            onInsert={onInsert}
          />
        </Group>
        <Group title={task ? 'Over a group' : 'Over a task'}>
          <Tiles
            tiles={over.map((block) => tileOf(block.name, block.words))}
            onInsert={onInsert}
          />
          <h3 className={classes.trayHeading}>Read off a pick</h3>
          <Tiles tiles={columns} onInsert={onInsert} />
        </Group>
        <Group title="Maths, tests and text">
          <Tiles
            tiles={[
              ...maths.map((block) => tileOf(block.name, block.words)),
              {
                key: 'text',
                name: '"…"',
                line: 'Some text, such as "none"',
                kind: 'text',
                insert: { text: '""', caret: 1 },
              },
            ]}
            onInsert={onInsert}
          />
        </Group>
      </div>
    </div>
  );
}
