import { useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import type { DeclaredField } from '@/api/types';
import { ratioOf, type Ratio } from '@/lib/exact';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { InlineField } from '@/ui/InlineField';
import { RadioGroup } from '@/ui/RadioGroup';
import { Select } from '@/ui/Select';
import { TextInput } from '@/ui/TextInput';
import { FieldBox } from '../contest/ContestFile';
import { FIELD_PARAM, ITEM_PARAM } from '../contest/places';
import { fractionOf, percentOf } from '../contest/percent';
import { NumberField } from '../forms/fields';
import { numberProblem } from '../forms/yaml-doc';
import type { GroupValues, TaskValues } from '../forms/task-values';
import type { ReportEntry } from '../workflows/model';
import { BuildCard, CardPart } from './BuildCard';
import type { GroupFolder, TaskPlace } from './build-data';
import {
  groupSentence,
  groupWeight,
  mixWords,
  pointsOf,
  pointsWords,
  readsWeights,
  ruleOf,
  ruleRefusal,
  RULES,
  scaled,
  shareProblem,
  showRefusal,
  SHOWS,
  taskWeight,
  totalSentence,
  withPoints,
  withRule,
  type CreditKind,
  type Rule,
} from './scoring';
import type { Staged } from './staged';
import { TestRows } from './TestRows';
import shared from '../organise.module.css';
import classes from './task.module.css';

/** A test's field in words: "an input file", "a number, episodes". */
function fieldWords(field: DeclaredField): string {
  if (field.type === 'file') return `${field.name} (a file)`;
  if (field.type === 'folder') return `${field.name} (a folder)`;
  if (field.type === 'enum')
    return `${field.name} (one of ${(field.options ?? []).join(', ')})`;
  if (field.type === 'boolean') return `${field.name} (yes or no)`;
  return `${field.name} (${field.type === 'number' ? 'a number' : 'text'})`;
}

const at = (text: string | null | undefined) =>
  text === null || text === undefined ? null : ratioOf(text);

/**
 * Whether a reported value can be what a test earns, and why not, short
 * enough to follow the value's name in the list of values.
 */
function creditRefusal(entry: ReportEntry, kind: 'value' | 'relative'): string | null {
  if (entry.fold === null) return 'not reported for each test';
  const least = entry.atLeast === null ? null : at(entry.atLeast.text);
  if (least === null || least.num < 0n) return 'not promised to be 0 or more';
  if (kind === 'value') {
    const most = entry.atMost === null ? null : at(entry.atMost.text);
    if (most === null || most.num > most.den) return 'not promised to be 1 or less';
    if (entry.better === 'lower') return 'lower is better, so it cannot be a score';
    return null;
  }
  return entry.better === null ? 'says neither higher nor lower is better' : null;
}

/**
 * A reported value as a page names it: its title, "Run time", or its key
 * until the workflow's report gives it one (M58).
 */
function valueName(entry: ReportEntry): string {
  return entry.title ?? entry.name;
}

/** How a test can earn, each with an example of what choosing it means. */
const CREDITS = [
  {
    value: 'none',
    label: 'All when it passes, nothing when it fails',
    description:
      'Every test is worth the same; it passes when its answer is accepted, or it does not.',
  },
  {
    value: 'value',
    label: 'A score the workflow gives it, from 0 to 1',
    description:
      'For a checker that gives part marks: a test scored 0.5 earns half of what it is worth.',
  },
  {
    value: 'relative',
    label: 'Its result against the best anyone reached',
    description:
      'For optimisation. Where higher is better, reaching 80 on a test where the best anyone reached is 100 earns 80% of it; where lower is better, as with run time, the fastest earns all of it and one twice as slow earns half. Its points move as others do better.',
  },
];

/**
 * Why the workflow offers nothing a test can earn by, said in its own line
 * rather than as a list of values all greyed out (M58), or null when it
 * offers one.
 */
function nothingToEarnBy(
  report: ReportEntry[] | null,
  kind: 'value' | 'relative',
): string | null {
  if (report === null || report.some((entry) => creditRefusal(entry, kind) === null)) {
    return null;
  }
  return kind === 'value'
    ? 'This workflow’s checker only says right or wrong, so it gives no score from 0 to 1.'
    : 'This workflow reports no number for each test that is better higher or lower, so there is no best to measure against.';
}

/**
 * How a test earns, in words: 1 when it passes; or a score the workflow
 * reports, from 0 to 1, such as a checker's; or its value against the best
 * any entrant reached on it. A way the workflow offers nothing for is
 * greyed out with why under it; a reported value that cannot be one is
 * listed greyed out, with why in its own name, and one against the best
 * says which way is better.
 */
function CreditPart({
  credit,
  report,
  onChange,
  disabled,
}: {
  credit: TaskValues['credit'];
  report: ReportEntry[] | null;
  onChange: (credit: TaskValues['credit']) => void;
  disabled: boolean;
}) {
  const kind = credit.kind;
  const options =
    report === null || kind === 'none'
      ? []
      : report.map((entry) => ({
          value: entry.name,
          label:
            kind === 'relative' &&
            (entry.better === 'lower' || entry.better === 'higher')
              ? `${valueName(entry)} (${entry.better} is better)`
              : valueName(entry),
          reason: creditRefusal(entry, kind),
        }));
  const chosenRefusal =
    options.find((option) => option.value === credit.name)?.reason ?? null;
  const nothing = kind === 'none' ? null : nothingToEarnBy(report, kind);
  return (
    <CardPart
      title="How a test earns"
      line="What a test gives towards its group’s points."
    >
      <FieldBox name="credit">
        <div className={shared.stack}>
          <RadioGroup
            label="A test earns"
            value={kind}
            options={CREDITS.map((option) => {
              const why =
                option.value === 'value' || option.value === 'relative'
                  ? nothingToEarnBy(report, option.value)
                  : null;
              return {
                ...option,
                disabled: why !== null && option.value !== kind,
                reason: why,
              };
            })}
            error={nothing === null ? undefined : `${nothing} Choose another way.`}
            onChange={(next) =>
              onChange({
                ...credit,
                kind: next === 'value' || next === 'relative' ? next : 'none',
              })
            }
            disabled={disabled}
          />
          {kind !== 'none' &&
            nothing === null &&
            (report === null ? (
              <div className={classes.single}>
                <TextInput
                  label="Which value"
                  value={credit.name}
                  onChange={(name) => onChange({ ...credit, name })}
                  description="The name the workflow reports it under."
                  disabled={disabled}
                />
              </div>
            ) : (
              <Select
                label="Which value"
                value={credit.name}
                options={options.map((option) => ({
                  value: option.value,
                  label:
                    option.reason === null
                      ? option.label
                      : `${option.label} (${option.reason})`,
                  disabled: option.reason !== null && option.value !== credit.name,
                }))}
                placeholder="Choose one"
                error={
                  chosenRefusal === null
                    ? undefined
                    : `It cannot be what a test earns: ${chosenRefusal}.`
                }
                onChange={(name) => onChange({ ...credit, name })}
                disabled={disabled}
              />
            ))}
        </div>
      </FieldBox>
    </CardPart>
  );
}

/**
 * A share typed as a percentage, and back as the fraction the settings hold:
 * the percentage as typed, so a point or a trailing zero holds while the next
 * digit is typed, or the settings' fraction when they hold another.
 */
function usePercent(
  value: string,
  onChange: (fraction: string) => void,
): [string, (percent: string) => void] {
  const [typed, setTyped] = useState(() => percentOf(value));
  const shown = fractionOf(typed) === value ? typed : percentOf(value);
  return [
    shown,
    (percent) => {
      setTyped(percent);
      onChange(fractionOf(percent));
    },
  ];
}

/** A share as a percentage typed in, and back as the fraction the settings hold. */
function ShareField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (fraction: string) => void;
  disabled: boolean;
}) {
  const [shown, setShown] = usePercent(value, onChange);
  return (
    <NumberField
      label={label}
      value={shown}
      onChange={setShown}
      placeholder="100"
      hint="A percentage, such as 80."
      error={shareProblem(value)}
      disabled={disabled}
    />
  );
}

/** One part of a mix: its line with its boxes in it, and what is wrong with them under it. */
function MixLine({
  problems,
  children,
}: {
  problems: (string | null | undefined)[];
  children: ReactNode;
}) {
  const found = problems.filter(
    (problem): problem is string => typeof problem === 'string',
  );
  return (
    <li className={classes.mixPart}>
      <div className={classes.mixLine}>{children}</div>
      {found.map((problem) => (
        <span key={problem} className={classes.mixProblem}>
          {problem}
        </span>
      ))}
    </li>
  );
}

/**
 * A group's hand-set mix (M59): one line per part, in the simple rules' words,
 * each with its points box inside it and the pass bar inside the third; the
 * lowest test score only where a test can earn part of its points, as the
 * simple rule offers it, or while it is set, saying why it cannot stay; then
 * what the parts add up to.
 */
function MixFields({
  group,
  credit,
  onChange,
  disabled,
}: {
  group: GroupValues;
  credit: CreditKind;
  onChange: (change: Partial<GroupValues>) => void;
  disabled: boolean;
}) {
  const words = mixWords(credit, group.weights.length > 0);
  const [share, setShare] = usePercent(group.passAt, (passAt) => onChange({ passAt }));
  const worst = credit !== 'none' || group.worst.trim() !== '';
  const box = (
    label: string,
    value: string,
    change: (value: string) => void,
    problem: string | undefined,
    placeholder?: string,
  ) => (
    <InlineField
      label={label}
      value={value}
      onChange={change}
      placeholder={placeholder}
      invalid={problem !== undefined}
      inputMode="decimal"
      disabled={disabled}
    />
  );
  return (
    <div className={classes.mix}>
      <ul className={classes.mixParts} aria-label="The parts of the mix">
        <MixLine problems={[numberProblem(group.each)]}>
          {box(
            'Points shared among the tests',
            group.each,
            (each) => onChange({ each }),
            numberProblem(group.each),
          )}
          <span>points {words.each}</span>
        </MixLine>
        {worst && (
          <MixLine
            problems={[numberProblem(group.worst), ruleRefusal('worst', credit)]}
          >
            {box(
              'Points times the lowest test score',
              group.worst,
              (value) => onChange({ worst: value }),
              numberProblem(group.worst) ?? ruleRefusal('worst', credit) ?? undefined,
            )}
            <span>points {words.worst}</span>
          </MixLine>
        )}
        <MixLine
          problems={[
            numberProblem(group.pass),
            numberProblem(share),
            shareProblem(group.passAt),
          ]}
        >
          {box(
            'Points when enough tests pass',
            group.pass,
            (pass) => onChange({ pass }),
            numberProblem(group.pass),
          )}
          <span>points {words.passBefore}</span>
          {box(
            'Share of tests that must pass (%)',
            share,
            setShare,
            numberProblem(share) ?? shareProblem(group.passAt),
            '100',
          )}
          <span>%{words.passAfter}</span>
        </MixLine>
      </ul>
      <BodyText tone="secondary">
        The parts add up: up to {pointsWords(groupWeight(group))}.
      </BodyText>
    </div>
  );
}

/** One test group: how it earns, when entrants see it, what it says, and its tests. */
function GroupItem({
  place,
  group,
  fields,
  folder,
  staged,
  credit,
  total,
  worth,
  graded,
  advanced,
  onAdvanced,
  onChange,
  onAdd,
  onReplace,
  onRemoveTest,
  onUndoTest,
  onRemoveGroup,
  disabled,
}: {
  place: TaskPlace;
  group: GroupValues;
  fields: DeclaredField[] | null;
  folder: GroupFolder | undefined;
  staged: Staged;
  credit: TaskValues['credit'];
  total: Ratio;
  worth: Ratio | null;
  graded: boolean;
  advanced: boolean;
  onAdvanced: (on: boolean) => void;
  onChange: (change: Partial<GroupValues>) => void;
  onAdd: () => void;
  onReplace: (test: string) => void;
  onRemoveTest: (test: string) => void;
  onUndoTest: (test: string) => void;
  onRemoveGroup: () => void;
  disabled: boolean;
}) {
  const [search] = useSearchParams();
  const linked = search.get(ITEM_PARAM) === group.name;
  const saved = folder?.tests ?? [];
  const added = staged.tests.filter((test) => test.group === group.name);
  const removed = staged.removals
    .filter((test) => test.group === group.name)
    .map((test) => test.test);
  const count =
    new Set([...saved, ...added.map((test) => test.test)]).size - removed.length;
  const [open, setOpen] = useState(
    count <= 12 || (linked && (search.get(FIELD_PARAM) ?? '').startsWith('test:')),
  );
  // The rule chosen holds while its points box is emptied to be typed again,
  // and a bonus while its bonus box is still empty, which reads as points for
  // each test alone.
  // A share while its share box is emptied or typed as 100, which reads as
  // every test, counts too. The rule the group was read with counts as chosen.
  const [picked, setPicked] = useState<Rule | null>(() => ruleOf(group));
  const read = ruleOf(group);
  const held =
    picked !== null &&
    (read === 'none' ||
      (picked === 'bonus' && read === 'each' && group.pass.trim() === '') ||
      (picked === 'share' && read === 'all'));
  // Weights for tests the group does not have, which the save refuses (T2).
  const strays = group.weights.filter(
    (row) => !saved.includes(row.test) && !added.some((test) => test.test === row.test),
  );
  const rule: Rule = advanced ? 'advanced' : held ? picked : read;
  const refusal = ruleRefusal('worst', credit.kind);
  const showProblem = showRefusal(group.show, group, credit.kind);
  const verdictRefusal = showRefusal('verdict', group, credit.kind);
  const required = graded && !group.read;
  const most = scaled(groupWeight(group), total, worth);
  const points = most.num === 0n ? 'no points' : `up to ${pointsWords(most)}`;
  const pick = (next: string) => {
    if (next === 'advanced') {
      onAdvanced(true);
      return;
    }
    onAdvanced(false);
    setPicked(next as Rule);
    onChange(withRule(group, next as Rule));
  };

  return (
    <div
      className={classes.item}
      role="group"
      aria-label={group.name}
      data-item={group.name}
      id={`group-${group.name}`}
    >
      <div className={classes.itemHead}>
        <h4 className={classes.itemTitle}>{group.name}</h4>
        <BodyText tone="secondary">
          {count === 1 ? '1 test' : `${String(count)} tests`} · {points}
          {!group.read && ' · new'}
        </BodyText>
      </div>
      <FieldBox name="rule">
        <div className={shared.stack}>
          <Select
            label="How does this group earn points?"
            value={rule}
            options={[
              ...RULES.map((option) => {
                const greyed =
                  option.value === 'worst' && refusal !== null && rule !== 'worst';
                return {
                  value: option.value,
                  label: greyed
                    ? `${option.label} (needs tests that earn part of their points)`
                    : option.label,
                  disabled: greyed,
                };
              }),
              {
                value: 'advanced',
                label: 'A mix of these, each part with its own points',
              },
            ]}
            error={rule === 'worst' && refusal !== null ? refusal : undefined}
            onChange={pick}
            disabled={disabled}
          />
          {rule !== 'none' && rule !== 'advanced' && (
            <div className={classes.grid}>
              <NumberField
                label="Points"
                value={pointsOf(group, rule)}
                onChange={(value) => onChange(withPoints(group, value, rule))}
                disabled={disabled}
              />
              {rule === 'bonus' && (
                <NumberField
                  label="Bonus for passing every test"
                  value={group.pass}
                  onChange={(pass) => onChange({ pass })}
                  disabled={disabled}
                />
              )}
              {rule === 'share' && (
                <ShareField
                  label="Share of tests that must pass (%)"
                  value={group.passAt}
                  onChange={(passAt) => onChange({ passAt })}
                  disabled={disabled}
                />
              )}
            </div>
          )}
          {rule === 'advanced' && (
            <MixFields
              group={group}
              credit={credit.kind}
              onChange={onChange}
              disabled={disabled}
            />
          )}
        </div>
      </FieldBox>
      <p className={classes.sentence}>
        {groupSentence(group, { total, worth, credit: credit.kind, tests: count })}
      </p>
      <FieldBox name="show">
        <RadioGroup
          label="When entrants see results"
          value={group.show === '' && !required ? 'always' : group.show}
          options={SHOWS.map((option) => ({
            ...option,
            disabled:
              option.value === 'verdict' &&
              verdictRefusal !== null &&
              group.show !== 'verdict',
            reason: option.value === 'verdict' ? verdictRefusal : null,
          }))}
          description={
            required && group.show === ''
              ? 'The task has graded submissions, so a test group added now must say when its results are shown.'
              : undefined
          }
          error={showProblem ?? undefined}
          required={required}
          onChange={(show) =>
            onChange({ show: show === 'always' && group.show === '' ? '' : show })
          }
          disabled={disabled}
        />
      </FieldBox>
      {open ? (
        <TestRows
          place={place}
          group={group}
          fields={fields}
          saved={saved}
          staged={added}
          removed={removed}
          weights={readsWeights(group)}
          onWeight={(test, weight) => {
            const rows = group.weights.filter((row) => row.test !== test);
            onChange({
              weights: weight.trim() === '' ? rows : [...rows, { test, weight }],
            });
          }}
          onReplace={onReplace}
          onRemove={onRemoveTest}
          onUndo={onUndoTest}
          disabled={disabled}
        />
      ) : null}
      <div className={shared.actions}>
        {count > 0 && (
          <Button size="xs" variant="secondary" onClick={() => setOpen(!open)}>
            {open ? 'Hide its tests' : `Show its ${String(count)} tests`}
          </Button>
        )}
        {!disabled && (
          <Button
            size="xs"
            variant="secondary"
            onClick={onAdd}
            label={`Add tests to ${group.name}`}
          >
            Add tests
          </Button>
        )}
        {!disabled && (
          <Button
            size="xs"
            variant="danger"
            onClick={onRemoveGroup}
            label={`Remove the group ${group.name}`}
          >
            Remove the group
          </Button>
        )}
      </div>
      {strays.length > 0 && (
        <div className={shared.actions}>
          <BodyText tone="secondary">
            Weights are set for tests the group does not have:{' '}
            {strays.map((row) => `${row.test} (${row.weight})`).join(', ')}. The task
            cannot be saved until they are removed or the tests are added.
          </BodyText>
          {!disabled && (
            <Button
              size="xs"
              variant="secondary"
              label={`Remove the weights of tests ${group.name} does not have`}
              onClick={() =>
                onChange({
                  weights: group.weights.filter((row) => !strays.includes(row)),
                })
              }
            >
              Remove them
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The Tests and scoring card: what a test holds and how it earns, then each
 * test group with how it earns points, when entrants see its results, the
 * sentence an entrant is told of it and its tests, with Add, Replace and
 * Remove; the task's total and what its contest's worth makes of it; and the
 * submission rules. Tests and groups added or taken out wait for the one save.
 */
export function TestsCard({
  place,
  values,
  fields,
  report,
  folders,
  staged,
  worth,
  graded,
  advanced,
  admin,
  disabled,
  onValues,
  onGroup,
  onAdvanced,
  onAddTests,
  onReplaceTest,
  onRemoveTest,
  onUndoTest,
  onRemoveGroup,
}: {
  place: TaskPlace;
  values: TaskValues;
  /** The fields each test has, from the workflow, or null when it cannot be read. */
  fields: DeclaredField[] | null;
  report: ReportEntry[] | null;
  folders: GroupFolder[];
  staged: Staged;
  /** What the task's contest makes it worth, or null when its groups' total. */
  worth: Ratio | null;
  graded: boolean;
  advanced: ReadonlySet<string>;
  admin: boolean;
  disabled: boolean;
  onValues: (change: Partial<TaskValues>) => void;
  onGroup: (name: string, change: Partial<GroupValues>) => void;
  onAdvanced: (name: string, on: boolean) => void;
  onAddTests: (group: string | null) => void;
  onReplaceTest: (group: string, test: string) => void;
  onRemoveTest: (group: string, test: string) => void;
  onUndoTest: (group: string, test: string) => void;
  onRemoveGroup: (group: string) => void;
}) {
  const total = taskWeight(values.groups);
  const max = values.max;
  const rate =
    values.rateCount === '' && values.ratePer === ''
      ? 'at most 1 in any 30 seconds'
      : `at most ${values.rateCount === '' ? '1' : values.rateCount} in any ${values.ratePer === '' ? '30' : values.ratePer} seconds`;
  return (
    <BuildCard
      id="tests"
      title="Tests and scoring"
      line="The tests every submission runs on, in groups, and how each group earns points."
    >
      <CardPart
        title="Tests"
        line={
          fields === null
            ? 'What a test holds is known once the workflow can be read.'
            : fields.length === 0
              ? 'The workflow’s tests hold nothing.'
              : `Each test has ${fields.map(fieldWords).join(', ')}.`
        }
      >
        {!disabled && fields !== null && (
          <div className={shared.actions}>
            <Button variant="secondary" onClick={() => onAddTests(null)}>
              Add tests
            </Button>
          </div>
        )}
      </CardPart>
      <CreditPart
        credit={values.credit}
        report={report}
        onChange={(credit) => onValues({ credit })}
        disabled={disabled}
      />
      <CardPart
        title="Test groups"
        line="Each test group earns its points by one rule. A test group with no points is for entrants to practise on."
      >
        {values.groups.length === 0 ? (
          <BodyText>No tests yet. Add tests to grade submissions.</BodyText>
        ) : (
          values.groups.map((group) => (
            <GroupItem
              key={group.name}
              place={place}
              group={group}
              fields={fields}
              folder={folders.find((folder) => folder.name === group.name)}
              staged={staged}
              credit={values.credit}
              total={total}
              worth={worth}
              graded={graded}
              advanced={advanced.has(group.name)}
              onAdvanced={(on) => onAdvanced(group.name, on)}
              onChange={(change) => onGroup(group.name, change)}
              onAdd={() => onAddTests(group.name)}
              onReplace={(test) => onReplaceTest(group.name, test)}
              onRemoveTest={(test) => onRemoveTest(group.name, test)}
              onUndoTest={(test) => onUndoTest(group.name, test)}
              onRemoveGroup={() => onRemoveGroup(group.name)}
              disabled={disabled || fields === null}
            />
          ))
        )}
        <p className={classes.sentence} aria-label="The task’s points">
          {totalSentence(total, worth)}
        </p>
      </CardPart>
      <CardPart
        title="Submission rules"
        line={`Per entrant: at most ${max === '' ? '50' : max} submissions, and ${rate}.${admin ? '' : ' Only an admin of the task can change these.'}`}
      >
        <div className={classes.grid}>
          <FieldBox name="max">
            <NumberField
              label="Most submissions"
              value={values.max}
              onChange={(value) => onValues({ max: value })}
              placeholder="50"
              whole
              disabled={disabled || !admin}
            />
          </FieldBox>
          <FieldBox name="count">
            <NumberField
              label="Submissions in a window"
              value={values.rateCount}
              onChange={(value) => onValues({ rateCount: value })}
              placeholder="1"
              whole
              disabled={disabled || !admin}
            />
          </FieldBox>
          <FieldBox name="per">
            <NumberField
              label="Length of the window (seconds)"
              value={values.ratePer}
              onChange={(value) => onValues({ ratePer: value })}
              placeholder="30"
              whole
              disabled={disabled || !admin}
            />
          </FieldBox>
        </div>
      </CardPart>
    </BuildCard>
  );
}
