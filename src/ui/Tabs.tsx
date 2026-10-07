import { Tabs as MantineTabs } from '@mantine/core';
import { useState, type ReactNode } from 'react';

/**
 * Two or more views of one thing, one shown at a time, such as a file as a
 * form and as text. Only the open view is mounted, so a view that reads
 * something reads it again each time it is opened.
 */
export function Tabs({
  label,
  tabs,
}: {
  /** What the views are views of, for a screen reader. */
  label: string;
  tabs: { value: string; label: string; panel: ReactNode }[];
}) {
  const [open, setOpen] = useState(tabs[0]?.value ?? '');
  return (
    <MantineTabs
      value={open}
      onChange={(value) => {
        if (value !== null) setOpen(value);
      }}
      keepMounted={false}
    >
      <MantineTabs.List aria-label={label} mb="sm">
        {tabs.map((tab) => (
          <MantineTabs.Tab key={tab.value} value={tab.value}>
            {tab.label}
          </MantineTabs.Tab>
        ))}
      </MantineTabs.List>
      {tabs.map((tab) => (
        <MantineTabs.Panel key={tab.value} value={tab.value}>
          {tab.panel}
        </MantineTabs.Panel>
      ))}
    </MantineTabs>
  );
}
