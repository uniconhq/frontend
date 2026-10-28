import { Popover } from '@mantine/core';
import { useViewportSize } from '@mantine/hooks';
import type { ReactElement, ReactNode } from 'react';

/** An explanation beside or below its target, kept below the formula it explains. */
export function HelpCard({
  opened,
  ceiling,
  onClose,
  target,
  id,
  className,
  children,
  onMouseEnter,
  onMouseLeave,
}: {
  opened: boolean;
  ceiling: number;
  onClose: () => void;
  target: ReactElement;
  id: string;
  className?: string;
  children: ReactNode;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const { width, height } = useViewportSize();
  const top = Math.max(12, Math.min(ceiling, height - 12));
  const rootBoundary = {
    x: 12,
    y: top,
    width: Math.max(0, width - 24),
    height: Math.max(0, height - top - 12),
  };
  return (
    <Popover
      opened={opened}
      onClose={onClose}
      position="right-start"
      middlewares={{
        flip: {
          rootBoundary,
          padding: 0,
          fallbackPlacements: ['left-start', 'bottom-start'],
        },
        shift: { rootBoundary, padding: 0 },
        size: { rootBoundary, padding: 0 },
      }}
      width={340}
      shadow="md"
      trapFocus={false}
      returnFocus={false}
      withRoles={false}
    >
      <Popover.Target>{target}</Popover.Target>
      <Popover.Dropdown
        id={id}
        role="tooltip"
        className={className}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        {children}
      </Popover.Dropdown>
    </Popover>
  );
}
