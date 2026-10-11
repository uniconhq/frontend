import { useState } from 'react';
import { useSearchParams } from 'react-router';
import type { DeclaredField } from '@/api/types';
import { ratioOf, type Ratio } from '@/lib/exact';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Select } from '@/ui/Select';
import { TextInput } from '@/ui/TextInput';
import { FieldBox } from '../contest/ContestFile';
import { FIELD_PARAM, ITEM_PARAM } from '../contest/places';
import { fractionOf, percentOf } from '../contest/percent';
import { NumberField } from '../forms/fields';
import type { GroupValues, TaskValues } from '../forms/task-values';
import type { ReportEntry } from '../workflows/model';
import { BuildCard, CardPart } from './BuildCard';
import type { GroupFolder, TaskPlace } from './build-data';
import {
  groupSentence,
  groupWeight,
  pointsOf,
  pointsText,
  readsWeights,
  ruleOf,
  ruleRefusal,
  RULES,
  scaled,
  showRefusal,
  showSentence,
  SHOWS,
  taskWeight,
  totalSentence,
  withPoints,
  withRule,
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

/** Whether a reported value can be what a test earns, and why not. */
function creditRefusal(entry: ReportEntry, kind: 'value' | 'relative'): string | null {
  if (entry.fold === null) return 'It is not a number reported for each test.';
  const least = entry.atLeast === null ? null : at(entry.atLeast.text);
  if (least === null || least.num < 0n) return 'It is not known to be at least 0.';
  if (kind === 'value') {
    const most = entry.atMost === null ? null : at(entry.atMost.text);
    if (most === null || most.num > most.den) return 'It is not known to be at most 1.';
    if (entry.better === 'lower') return 'Lower is better for it.';
    return null;
  }
  return entry.better === null
    ? 'It does not say whether higher or lower is better.'
    : null;
}

/**
 * How a test earns, in words: 1 when it passes; or a score the workflow
 * reports, from 0 to 1, such as a checker's; or its value against the best
 * any entrant reached on it. A reported value that cannot be one is listed
 * greyed out, with why.
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
          label: entry.name,
          reason: creditRefusal(entry, kind),
        }));
  const refused = options.filter((option) => option.reason !== null);
  return (
    <CardPart
      title="How a test earns"
      line="What a test gives towards its group’s points."
    >
      <FieldBox name="credit">
        <div className={classes.grid}>
          <Select
            label="A test earns"
            value={kind}
            options={[
              { value: 'none', label: 'All when it passes, nothing when it fails' },
              { value: 'value', label: 'A score the workflow gives it, from 0 to 1' },
              {
                value: 'relative',
                label: 'Its result against the best anyone reached',
              },
            ]}
            onChange={(next) =>
              onChange({
                ...credit,
                kind: next === 'value' || next === 'relative' ? next : 'none',
              })
            }
            info="A test fails unless it is accepted. Passing or failing suits a plain comparison of answers; a score suits a checker that gives part marks; the best anyone reached suits optimisation, where a test's points move as others do better."
            disabled={disabled}
          />
          {kind !== 'none' &&
            (report === null ? (
              <TextInput
                label="Which value"
                value={credit.name}
                onChange={(name) => onChange({ ...credit, name })}
                description="What the workflow reports it as."
                disabled={disabled}
              />
            ) : (
              <Select
                label="Which value"
                value={credit.name}
                options={options.map((option) => ({
                  value: option.value,
                  label: option.label,
                  disabled: option.reason !== null,
                }))}
                placeholder="Choose one"
                description={
                  options.length === 0
                    ? 'The workflow reports no value.'
                    : refused.length === 0
                      ? undefined
                      : refused
                          .map((option) => `${option.label}: ${option.reason ?? ''}`)
                          .join(' ')
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
  return (
    <NumberField
      label={label}
      value={percentOf(value)}
      onChange={(percent) => onChange(fractionOf(percent))}
      placeholder="100"
      hint="A percentage, such as 80."
      disabled={disabled}
    />
  );
}

/** The three rule weights and the threshold as they are, for a group of another mix. */
function AdvancedFields({
  group,
  onChange,
  disabled,
}: {
  group: GroupValues;
  onChange: (change: Partial<GroupValues>) => void;
  disabled: boolean;
}) {
  return (
    <div className={classes.grid}>
      <NumberField
        label="Points by the share of tests passed"
        value={group.each}
        onChange={(each) => onChange({ each })}
        disabled={disabled}
      />
      <NumberField
        label="Points by the worst test"
        value={group.worst}
        onChange={(worst) => onChange({ worst })}
        disabled={disabled}
      />
      <NumberField
        label="Points when enough tests pass"
        value={group.pass}
        onChange={(pass) => onChange({ pass })}
        disabled={disabled}
      />
      <ShareField
        label="Share of tests that must pass (%)"
        value={group.passAt}
        onChange={(passAt) => onChange({ passAt })}
        disabled={disabled}
      />
    </div>
  );
}

/** One test group: how it earns, when entrants see it, what it says, and its tests. */
function GroupItem({
  place,
  group,
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
  // The rule chosen holds while its points box is emptied to be typed again.
  const [picked, setPicked] = useState<Rule | null>(null);
  const read = ruleOf(group);
  const rule: Rule = advanced
    ? 'advanced'
    : read === 'none' && picked !== null
      ? picked
      : read;
  const refusal = ruleRefusal('worst', credit.kind);
  const showProblem = showRefusal(group.show, group, credit.kind);
  const verdictRefusal = showRefusal('verdict', group, credit.kind);
  const required = graded && !group.read;
  const points = pointsText(scaled(groupWeight(group), total, worth));
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
          {count === 1 ? '1 test' : `${String(count)} tests`} · up to {points}{' '}
          {points === '1' ? 'point' : 'points'}
          {!group.read && ' · new'}
        </BodyText>
      </div>
      <FieldBox name="rule">
        <div className={classes.grid}>
          <Select
            label="How does this group earn points?"
            value={rule}
            options={[
              ...RULES.map((option) => ({
                value: option.value,
                label: option.label,
                disabled:
                  option.value === 'worst' && refusal !== null && rule !== 'worst',
              })),
              { value: 'advanced', label: 'Another mix of these, set by hand' },
            ]}
            description={
              refusal !== null && rule !== 'worst'
                ? `The lowest test score counts: ${refusal}`
                : rule === 'worst' && refusal !== null
                  ? refusal
                  : undefined
            }
            onChange={pick}
            disabled={disabled}
          />
          {rule !== 'none' && rule !== 'advanced' && (
            <NumberField
              label="Points"
              value={pointsOf(group, rule)}
              onChange={(value) => onChange(withPoints(group, value, rule))}
              disabled={disabled}
            />
          )}
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
      </FieldBox>
      {rule === 'advanced' && (
        <AdvancedFields group={group} onChange={onChange} disabled={disabled} />
      )}
      <p className={classes.sentence}>
        {groupSentence(group, { total, worth, credit: credit.kind, tests: count })}
      </p>
      <FieldBox name="show">
        <Select
          label="When entrants see results"
          value={group.show === '' && !required ? 'always' : group.show}
          options={SHOWS.map((option) => ({
            ...option,
            disabled:
              option.value === 'verdict' &&
              verdictRefusal !== null &&
              group.show !== 'verdict',
          }))}
          placeholder={required ? 'Choose when' : undefined}
          description={
            required && group.show === ''
              ? 'Needed: the task has graded submissions, so a group added now must say when its results are shown.'
              : (showProblem ??
                (verdictRefusal === null
                  ? undefined
                  : `Pass or fail alone: ${verdictRefusal}`))
          }
          error={showProblem ?? undefined}
          required={required}
          onChange={(show) =>
            onChange({ show: show === 'always' && group.show === '' ? '' : show })
          }
          disabled={disabled}
        />
      </FieldBox>
      <BodyText tone="secondary">{showSentence(group.show)}</BodyText>
      {open ? (
        <TestRows
          place={place}
          group={group}
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
      {group.weights.some(
        (row) =>
          !saved.includes(row.test) && !added.some((test) => test.test === row.test),
      ) && (
        <BodyText tone="secondary">
          Test weights are set for tests the group does not have:{' '}
          {group.weights
            .filter(
              (row) =>
                !saved.includes(row.test) &&
                !added.some((test) => test.test === row.test),
            )
            .map((row) => `${row.test} (${row.weight})`)
            .join(', ')}
          . A save is refused until they are removed or the tests added.
        </BodyText>
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
      ? 'one every 30 seconds'
      : `${values.rateCount === '' ? '1' : values.rateCount} in any ${values.ratePer === '' ? '30' : values.ratePer} seconds`;
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
        line="Each group earns its points by one rule. A group with no points is for entrants to try."
      >
        {values.groups.length === 0 ? (
          <BodyText>No tests yet. Add tests to grade submissions.</BodyText>
        ) : (
          values.groups.map((group) => (
            <GroupItem
              key={group.name}
              place={place}
              group={group}
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
        line={`Per entrant: at most ${max === '' ? '50' : max} submissions, ${rate}.${admin ? '' : ' Only an admin of the task changes these.'}`}
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
