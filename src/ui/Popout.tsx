import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Popover, type PopoverProps } from '@mantine/core';
import classes from './Popout.module.css';

/** How long a pointer may take to cross from the button to what it opened. */
const CROSSING_MS = 150;

/**
 * A button that pops out what is behind it. It opens on hover for a mouse,
 * staying open while the pointer moves onto what it opened, and on a click or
 * a tap, which keeps it open until the next click, a click elsewhere or
 * Escape, so it works on a touch screen and from the keyboard. `label` names
 * the button for a screen reader; `children` may take a function that closes
 * it, for a choice made inside, and the side it opened on, which is not
 * `position` where the page has no room there. `bare` pops it out with no
 * card around it, right against the button, for what draws its own.
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
