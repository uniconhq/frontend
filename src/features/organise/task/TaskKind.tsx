import { queryView } from '@/api/query';
import { BodyText } from '@/ui/BodyText';
import { RadioGroup } from '@/ui/RadioGroup';
import { Loaded } from '@/ui/feedback/Loaded';
import { useWorkflowList } from './build-data';
import { KINDS, readable, type Kind } from './new-task';
import { WorkflowPicker } from './WorkflowPicker';

/**
 * What kind of task to make, so a first task never starts from a blank
 * page: comparing output with an answer, a program of several files, or
 * another workflow chosen from those the organiser may read. A kind whose
 * workflow they may not read is greyed out, saying so.
 */
export function TaskKind({
  value,
  onChange,
}: {
  value: Kind;
  onChange: (kind: Kind) => void;
}) {
  const list = queryView(useWorkflowList());
  return (
    <Loaded view={list} rows={3}>
      {(items) => {
        const missing = KINDS.filter(
          (kind) => kind.workflow !== null && !readable(items, kind.workflow),
        );
        return (
          <>
            <RadioGroup
              label="What kind of task"
              value={value.kind}
              options={KINDS.map((kind) => ({
                value: kind.value,
                label: kind.label,
                disabled: missing.some((each) => each.value === kind.value),
              }))}
              onChange={(chosen) => {
                const kind = KINDS.find((each) => each.value === chosen);
                if (kind === undefined) return;
                onChange({
                  kind: kind.value,
                  workflow:
                    kind.workflow ?? (value.kind === 'other' ? value.workflow : ''),
                });
              }}
            />
            <BodyText tone="secondary">
              {KINDS.find((kind) => kind.value === value.kind)?.line}
              {missing.length > 0 &&
                ` ${missing.map((kind) => kind.label).join(' and ')}: not on this platform, so greyed out.`}
            </BodyText>
            {value.kind === 'other' && (
              <WorkflowPicker
                value={value.workflow}
                items={items}
                onChange={(workflow) => onChange({ kind: 'other', workflow })}
              />
            )}
          </>
        );
      }}
    </Loaded>
  );
}
