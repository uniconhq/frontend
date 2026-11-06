import { useMantineTheme } from '@mantine/core';
import { UniconMark } from './UniconMark';

/**
 * Below a 16px wordmark the mark becomes a sliver, so use <UniconMark> alone.
 * Inline styles because the sizes come from the one `size` prop.
 */
export function UniconLockup({
  size = 40,
  color = 'currentColor',
}: {
  size?: number;
  color?: string;
}) {
  const { markScale, gapScale } = useMantineTheme().other.lockup;

  return (
    <span style={{ display: 'flex', alignItems: 'baseline', gap: size * gapScale }}>
      <UniconMark size={size * markScale} style={{ flex: 'none', display: 'block' }} />
      <span
        style={{
          fontFamily: 'var(--mantine-font-family)',
          fontWeight: 700,
          fontSize: size,
          letterSpacing: '-0.025em',
          lineHeight: 1,
          color,
        }}
      >
        unicon
      </span>
    </span>
  );
}
