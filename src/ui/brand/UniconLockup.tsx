import { UniconMark } from './UniconMark';

/**
 * Mark at the x-height of the wordmark, baseline-aligned. The ratios are the
 * handoff's: mark = 0.525 x wordmark size, gap = 0.1 x. Below a 16px wordmark
 * the mark becomes a sliver, so use <UniconMark> alone. Inline styles because
 * the sizes are computed from the one `size` prop.
 */
export function UniconLockup({
  size = 40,
  color = 'currentColor',
}: {
  size?: number;
  color?: string;
}) {
  return (
    <span style={{ display: 'flex', alignItems: 'baseline', gap: size * 0.1 }}>
      <UniconMark size={size * 0.525} style={{ flex: 'none', display: 'block' }} />
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
