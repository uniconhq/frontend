import { ActionMenu, type MenuEntry } from '@/ui/ActionMenu';
import type { PaletteWorkflow } from './boxes';
import type { PrimitiveInfo } from './primitives';
import { versionNumber } from './versions';
import { primitiveTitle } from './words';

/**
 * The newest usable version of each primitive, in the order the platform
 * lists them: an older version is chosen in the step's drawer.
 */
function newest(primitives: PrimitiveInfo[]): PrimitiveInfo[] {
  const found = new Map<string, PrimitiveInfo>();
  for (const primitive of primitives) {
    if (primitive.problem !== null) continue;
    const held = found.get(primitive.name);
    if (
      held === undefined ||
      (versionNumber(primitive.version) ?? 0) > (versionNumber(held.version) ?? 0)
    )
      found.set(primitive.name, primitive);
  }
  return [...found.values()];
}

/**
 * "Add step" on the editor's toolbar (M37, M31): the platform's primitives
 * as a menu, each with its title, what it does and its reference small, and
 * one way to add each. How often the new step runs is asked in its drawer,
 * which opens as it is added.
 */
export function AddStep({
  primitives,
  workflows,
  disabled,
  onAdd,
  onAddWorkflow,
}: {
  primitives: PrimitiveInfo[];
  workflows: PaletteWorkflow[];
  disabled: boolean;
  onAdd: (primitive: PrimitiveInfo) => void;
  onAddWorkflow: (workflow: PaletteWorkflow) => void;
}) {
  const entries: MenuEntry[] = [
    ...newest(primitives).map(
      (primitive): MenuEntry => ({
        kind: 'item',
        text: primitiveTitle(primitive),
        detail: primitive.description,
        note: primitive.ref,
        onSelect: () => onAdd(primitive),
      }),
    ),
  ];
  if (workflows.length > 0) {
    entries.push({ kind: 'divider' });
    for (const workflow of workflows)
      entries.push({
        kind: 'item',
        text: `${workflow.owner}/${workflow.name}`,
        note: workflow.version,
        onSelect: () => onAddWorkflow(workflow),
      });
  }
  return (
    <ActionMenu
      button
      text="Add step"
      label="Add step"
      disabled={disabled}
      empty="Unicon has no primitive this page can use."
      entries={entries}
    />
  );
}
