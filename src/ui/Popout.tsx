import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Popover, type PopoverProps } from '@mantine/core';
import classes from './Popout.module.css';

/** How long a pointer may take to cross from the button to what it opened. */
const CROSSING_MS = 150;

/**
 * Opens on hover, and a click or tap keeps it open, so it works on touch and
 * from the keyboard. The side it opened on may differ from `position` when there is no room.
 */
export function Popout({
  label,
  className,
  style,
  button,
  position = 'top-start',
  width = 300,
  bare = false,
  children,
}: {
  label: string;
  className?: string;
  style?: CSSProperties;
  button: ReactNode;
  position?: PopoverProps['position'];
  width?: PopoverProps['width'];
  bare?: boolean;
  children:
    | ReactNode
    | ((close: () => void, placed: NonNullable<PopoverProps['position']>) => ReactNode);
}) {
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [placed, setPlaced] = useState(position);
  const leaving = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stay = () => {
    if (leaving.current !== null) clearTimeout(leaving.current);
    leaving.current = null;
  };
  const enter = () => {
    stay();
    setHovered(true);
  };
  const leave = () => {
    stay();
    leaving.current = setTimeout(() => setHovered(false), CROSSING_MS);
  };
  // Read while drawing, so it leaves the timer alone: a timer still running
  // only closes it again.
  const dismiss = () => {
    setPinned(false);
    setHovered(false);
  };
  const close = () => {
    stay();
    dismiss();
  };
  useEffect(() => stay, []);

  return (
    <Popover
      opened={hovered || pinned}
      onClose={close}
      position={position}
      onPositionChange={setPlaced}
      width={width}
      withArrow={!bare}
      offset={bare ? 0 : 8}
      shadow={bare ? undefined : 'md'}
      returnFocus
    >
      <Popover.Target>
        <button
          type="button"
          className={className}
          style={style}
          aria-label={label}
          onMouseEnter={enter}
          onMouseLeave={leave}
          onClick={() => {
            // A tap also counts as the pointer over it, which no tap elsewhere
            // ends; the click alone says whether it stays open.
            stay();
            setHovered(false);
            setPinned((open) => !open);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') close();
          }}
        >
          {button}
        </button>
      </Popover.Target>
      <Popover.Dropdown
        className={bare ? classes.bare : classes.dropdown}
        onMouseEnter={enter}
        onMouseLeave={leave}
      >
        {typeof children === 'function' ? children(dismiss, placed) : children}
      </Popover.Dropdown>
    </Popover>
  );
}
