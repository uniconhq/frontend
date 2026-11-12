import { useState } from 'react';
import { BodyText } from '@/ui/BodyText';
import { UnsavedNote } from '@/ui/UnsavedNote';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Checkbox } from '@/ui/Checkbox';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { PageLink } from '@/ui/PageLink';
import { RadioGroup } from '@/ui/RadioGroup';
import { TextInput } from '@/ui/TextInput';
import { Group } from '@/ui/layout';
import { useContestParams } from '@/lib/route-params';
import { CONTEST_SECTIONS, contestSectionPath, sectionOf } from '@/lib/sections';
import { readContest, writeContest, type ContestValues } from '../forms/contest-values';
import { Fieldset, NumberField, TimeField } from '../forms/fields';
import { approvesAtOnce, DEFAULT_WAYS, newSignup, type WayValues } from '../forms/ways';
import { numberProblem } from '../forms/values';
import type { ValuesFormProps } from '../forms/ValuesForm';
import { InvitesSection } from '../invites/InvitesSection';
import { usePlaceMay } from '../may';
import { SectionPage } from '../SectionPage';
import { ContestFile, FieldBox } from './ContestFile';
import { useOpenedField } from './opened';
import { viewFilePath } from './places';
import shared from '../organise.module.css';
import forms from '../forms/forms.module.css';
import classes from './contest.module.css';

type Signup = Extract<WayValues, { kind: 'signup' }>;

/** The conditions ticked on a sign-up, which an empty field does not untick. */
type Ticks = { code: boolean; domains: boolean };

function ticksOf(way: WayValues): Ticks {
  return way.kind === 'signup'
    ? { code: way.code !== '', domains: way.domains !== '' || way.emailPattern !== '' }
    : { code: false, domains: false };
}

/** The first way a new contest starts from, by what its organiser picks. */
const STARTERS: { label: string; ways: WayValues[]; ticks: Ticks }[] = [
  {
    label: 'Anyone can sign up',
    ways: [newSignup()],
    ticks: { code: false, domains: false },
  },
  {
    label: 'Organiser invite',
    ways: [{ kind: 'invite', approval: '' }],
    ticks: { code: false, domains: false },
  },
  {
    label: 'Invitation code',
    ways: [newSignup({ code: '' })],
    ticks: { code: true, domains: false },
  },
  {
    label: 'Email domain',
    ways: [newSignup()],
    ticks: { code: false, domains: true },
  },
];

const APPROVAL = [
  { value: 'auto', label: 'Approved straight away' },
  { value: 'manual', label: 'An organiser approves each one' },
];

/** A ticked condition left empty, which the settings have no place for. */
function problemsOf(ways: WayValues[], ticks: Ticks[]): string[] {
  return ways.flatMap((way, at) => {
    if (way.kind !== 'signup') return [];
    const tick = ticks[at] ?? ticksOf(way);
    return [
      ...(tick.code && way.code.trim() === ''
        ? [`Way in ${String(at + 1)}: enter its code, or untick “Needs a code”.`]
        : []),
      ...(tick.domains && way.domains.trim() === '' && way.emailPattern.trim() === ''
        ? [
            `Way in ${String(at + 1)}: enter at least one domain, or untick “Only email addresses at these domains”.`,
          ]
        : []),
    ];
  });
}

/**
 * One way in, as a card of its own: who it lets in and whether an organiser
 * approves them. Invites list and make the contest's invites right in the
 * card, once the way is saved; a sign-up ticks what it asks for, any of a
 * code and email domains, a regular expression under Advanced.
 */
function WayCard({
  way,
  index,
  ticks,
  saved,
  disabled,
  org,
  contest,
  manages,
  onChange,
  onTicks,
  onRemove,
}: {
  way: WayValues;
  index: number;
  ticks: Ticks;
  saved: boolean;
  disabled: boolean;
  org: string;
  contest: string;
  manages: boolean;
  onChange: (way: WayValues) => void;
  onTicks: (ticks: Ticks) => void;
  onRemove: () => void;
}) {
  const [asking, setAsking] = useState(false);
  const title =
    way.kind === 'invite'
      ? 'People you invite'
      : way.name.trim() === ''
        ? 'Sign-up'
        : `Sign-up: ${way.name.trim()}`;
  const signup = (change: Partial<Signup>) => {
    if (way.kind === 'signup') onChange({ ...way, ...change });
  };

  return (
    <li data-item={index}>
      <FieldBox name="way">
        <Fieldset legend={title}>
          <FieldBox name="approval">
            <RadioGroup
              label="Approval"
              value={approvesAtOnce(way) ? 'auto' : 'manual'}
              options={APPROVAL}
              onChange={(approval) => onChange({ ...way, approval })}
              disabled={disabled}
            />
          </FieldBox>
          {way.kind === 'invite' ? (
            saved ? (
              <InvitesSection
                place={{ kind: 'contest', org, contest }}
                audience="contestants"
                manages={manages}
                giveAdmin={false}
              />
            ) : (
              <BodyText tone="secondary">
                Save first, then invite people by username or email address here.
              </BodyText>
            )
          ) : (
            <>
              <BodyText tone="secondary">
                People register themselves. With nothing ticked below, anyone with an
                account can.
              </BodyText>
              <FieldBox name="name">
                <TextInput
                  label="Name of this sign-up"
                  description="Optional. Shown beside each person who came in this way: to you on the Entrants page, and to their teammates."
                  placeholder="Such as NUS students"
                  value={way.name}
                  onChange={(name) => signup({ name })}
                  disabled={disabled}
                />
              </FieldBox>
              <FieldBox name="code">
                <Checkbox
                  label="Needs a code"
                  checked={ticks.code}
                  onChange={(code) => {
                    onTicks({ ...ticks, code });
                    if (!code) signup({ code: '' });
                  }}
                  disabled={disabled}
                />
                {ticks.code && (
                  <TextInput
                    label="Code"
                    description="People type it to register. Give it to those it is for."
                    value={way.kind === 'signup' ? way.code : ''}
                    onChange={(code) => signup({ code })}
                    disabled={disabled}
                  />
                )}
              </FieldBox>
              <FieldBox name="domains">
                <Checkbox
                  label="Only email addresses at these domains"
                  checked={ticks.domains}
                  onChange={(domains) => {
                    onTicks({ ...ticks, domains });
                    if (!domains) signup({ domains: '', emailPattern: '' });
                  }}
                  disabled={disabled}
                />
                {ticks.domains && way.kind === 'signup' && (
                  <>
                    <TextInput
                      label="Email domains"
                      description="Separate them with commas. Only confirmed addresses count. u.nus.edu lets in addresses at u.nus.edu alone; *.nus.edu.sg lets in nus.edu.sg and every domain under it, such as comp.nus.edu.sg."
                      placeholder="u.nus.edu"
                      value={way.domains}
                      onChange={(domains) => signup({ domains })}
                      disabled={disabled}
                    />
                    <details className={classes.advanced}>
                      <summary>Advanced</summary>
                      <FieldBox name="email_pattern">
                        <TextInput
                          label="Email pattern"
                          description="A regular expression a confirmed address must match, ignoring case, as well as the domains."
                          value={way.emailPattern}
                          onChange={(emailPattern) => signup({ emailPattern })}
                          disabled={disabled}
                        />
                      </FieldBox>
                    </details>
                  </>
                )}
              </FieldBox>
            </>
          )}
          {!disabled && (
            <Group gap="xs">
              <Button
                size="xs"
                variant="danger"
                label={`Remove ${title}`}
                onClick={() => setAsking(true)}
              >
                Remove this way
              </Button>
            </Group>
          )}
          <ConfirmDialog
            opened={asking}
            onClose={() => setAsking(false)}
            title={`Remove ${title}?`}
            confirm="Remove"
            variant="danger"
            onConfirm={() => {
              setAsking(false);
              onRemove();
            }}
          >
            <BodyText>
              Nobody new comes in this way once it is saved. Those already in stay.
            </BodyText>
          </ConfirmDialog>
        </Fieldset>
      </FieldBox>
    </li>
  );
}

/**
 * How people enter, as a form: the ways in, each a card, any one enough;
 * when registration opens and closes; how many may register; and the
 * sentence it all adds up to, live. A contest that has no ways written
 * starts from a choice of four. A sign-up on a contest only its entrants
 * see is warned of, since nobody can find it to sign up.
 */
function EntryForm({
  values: settings,
  busy,
  onSave,
  admin,
  org,
  contest,
  manages,
}: ValuesFormProps & {
  admin: boolean;
  org: string;
  contest: string;
  manages: boolean;
}) {
  const [read] = useState(() => readContest(settings));
  const [values, setValues] = useState<ContestValues>(read.values);
  const [ticks, setTicks] = useState<Ticks[]>(() =>
    (read.values.ways ?? []).map(ticksOf),
  );
  const [opensAt, setOpensAt] = useState(read.values.opens !== '');
  const [closesAt, setClosesAt] = useState(read.values.closes !== '');
  useOpenedField(true);
  const set = <K extends keyof ContestValues>(key: K, value: ContestValues[K]) =>
    setValues((before) => ({ ...before, [key]: value }));
  const locked = !admin;
  const unreadable =
    read.unreadable.includes('registration') || read.unreadable.includes('ways');
  const ways = values.ways;
  const changed = JSON.stringify(values) !== JSON.stringify(read.values);
  const problems = [
    numberProblem(values.capacity),
    ...(ways === null ? [] : problemsOf(ways, ticks)),
  ].filter((problem) => problem !== undefined);
  const savedInvite = (read.values.ways ?? []).some((way) => way.kind === 'invite');
  const signups = (ways ?? DEFAULT_WAYS).some((way) => way.kind === 'signup');

  const setWays = (next: WayValues[], nextTicks: Ticks[]) => {
    set('ways', next);
    setTicks(nextTicks);
  };
  const raw = (path: string) => read.rawTimes[path];

  if (unreadable) {
    return (
      <BodyText>
        How people enter cannot be read here. Check the contest’s stored settings.
      </BodyText>
    );
  }

  return (
    <div className={forms.form} role="group" aria-label="How people enter">
      {signups && values.visibility === 'hidden' && (
        <div className={shared.panel} role="note">
          <BodyText>
            Only entrants and organisers can see this contest, so nobody can find it to
            sign up. Change who sees it in Settings, or invite people instead.
          </BodyText>
        </div>
      )}

      <Fieldset legend="Ways in">
        {ways === null ? (
          // Nothing chosen is the forge's default, anyone signing up.
          <div className={classes.starters} role="group" aria-label="Start from">
            {STARTERS.map((starter, at) => (
              <Button
                key={starter.label}
                variant={at === 0 ? 'primary' : 'secondary'}
                disabled={locked}
                onClick={() => setWays(starter.ways, [starter.ticks])}
              >
                {starter.label}
              </Button>
            ))}
          </div>
        ) : ways.length === 0 ? (
          <div className={shared.panel} role="alert">
            <BodyText>
              Nobody can register: the contest has no way in. Add one.
            </BodyText>
          </div>
        ) : (
          <ol className={forms.entries} aria-label="Ways in">
            {ways.map((way, index) => (
              <WayCard
                key={index}
                way={way}
                index={index}
                ticks={ticks[index] ?? ticksOf(way)}
                saved={savedInvite}
                disabled={locked}
                org={org}
                contest={contest}
                manages={manages}
                onChange={(next) =>
                  set(
                    'ways',
                    ways.map((old, at) => (at === index ? next : old)),
                  )
                }
                onTicks={(next) =>
                  setTicks(
                    ways.map((old, at) =>
                      at === index ? next : (ticks[at] ?? ticksOf(old)),
                    ),
                  )
                }
                onRemove={() =>
                  setWays(
                    ways.filter((_, at) => at !== index),
                    ways
                      .map((old, at) => ticks[at] ?? ticksOf(old))
                      .filter((_, at) => at !== index),
                  )
                }
              />
            ))}
          </ol>
        )}
        {ways !== null && !locked && (
          <Group gap="xs">
            <Button
              size="xs"
              variant="secondary"
              onClick={() =>
                setWays(
                  [...ways, newSignup()],
                  [
                    ...ways.map((old, at) => ticks[at] ?? ticksOf(old)),
                    { code: false, domains: false },
                  ],
                )
              }
            >
              Add a sign-up
            </Button>
            {!ways.some((way) => way.kind === 'invite') && (
              <Button
                size="xs"
                variant="secondary"
                onClick={() =>
                  setWays(
                    [...ways, { kind: 'invite', approval: '' }],
                    [
                      ...ways.map((old, at) => ticks[at] ?? ticksOf(old)),
                      { code: false, domains: false },
                    ],
                  )
                }
              >
                Add invites
              </Button>
            )}
          </Group>
        )}
      </Fieldset>

      <Fieldset
        legend="When"
        note="Registration is only ever open while the contest is open and before it ends."
      >
        <FieldBox name="opens">
          <RadioGroup
            label="Registration opens"
            value={opensAt ? 'at' : 'open'}
            options={[
              { value: 'open', label: 'When the contest is opened' },
              { value: 'at', label: 'At a time' },
            ]}
            onChange={(choice) => {
              setOpensAt(choice === 'at');
              if (choice !== 'at') set('opens', '');
            }}
            disabled={locked}
          />
          {opensAt && (
            <TimeField
              label="Opens at"
              value={values.opens}
              raw={raw('registration.opens')}
              onChange={(opens) => set('opens', opens)}
              disabled={locked}
            />
          )}
        </FieldBox>
        <FieldBox name="closes">
          <RadioGroup
            label="Registration closes"
            value={closesAt ? 'at' : 'end'}
            options={[
              { value: 'end', label: 'When the contest ends' },
              { value: 'at', label: 'At a time' },
            ]}
            onChange={(choice) => {
              setClosesAt(choice === 'at');
              if (choice === 'at' && values.closes === '') set('closes', values.start);
              if (choice !== 'at') set('closes', '');
            }}
            disabled={locked}
          />
          {closesAt && (
            <TimeField
              label="Closes at"
              value={values.closes}
              raw={raw('registration.closes')}
              onChange={(closes) => set('closes', closes)}
              hint="Starts at the contest’s start. Closing registration then keeps late entrants out."
              disabled={locked}
            />
          )}
        </FieldBox>
      </Fieldset>

      <Fieldset legend="Limit">
        <FieldBox name="capacity">
          <NumberField
            label="Max number of entrants"
            value={values.capacity}
            onChange={(capacity) => set('capacity', capacity)}
            placeholder="No limit"
            disabled={locked}
          />
        </FieldBox>
      </Fieldset>

      {problems.length > 0 && (
        <ul className={shared.named} aria-label="To fix before saving">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}
      {!locked && (
        <Group gap="xs">
          <Button
            loading={busy}
            disabled={locked || !changed || problems.length > 0}
            onClick={() =>
              onSave((fresh) => writeContest(fresh, read.values, values, { admin }))
            }
          >
            Save how people enter
          </Button>
          {changed && <UnsavedNote />}
        </Group>
      )}
    </div>
  );
}

/** How people enter the contest, with the link to who has. */
export function ContestEntryPage() {
  const { org, contest } = useContestParams();
  const may = usePlaceMay({ kind: 'contest', org, contest });
  const manages = may.manage;
  return (
    <SectionPage
      place={{ kind: 'contest', org, contest }}
      allowed={may.edit_admin_settings}
      section={sectionOf(CONTEST_SECTIONS, 'entry')}
      links={
        <>
          <PageLink to={contestSectionPath(org, contest, 'entrants')}>
            Entrants
          </PageLink>
          <PageLink to={viewFilePath(org, contest)}>View file</PageLink>
        </>
      }
    >
      <Card>
        <ContestFile org={org} contest={contest}>
          {(props) => (
            <EntryForm {...props} org={org} contest={contest} manages={manages} />
          )}
        </ContestFile>
      </Card>
    </SectionPage>
  );
}
