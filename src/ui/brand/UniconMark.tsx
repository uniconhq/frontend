import { useId } from 'react';
import { useMantineTheme } from '@mantine/core';

/**
 * Unicon mark: the JetBrains Mono ">" glyph rotated 45deg, outline extracted
 * from the font file. Square, with no font dependency.
 *
 *   <UniconMark />                             sunset gradient (default)
 *   <UniconMark fill="currentColor" />         inherits text colour
 *   <UniconMark gradient={['#0af', '#0fa']} /> custom stops
 */

const GLYPH =
  'M708.22 1000L583.55 875.33L793.1 275.86Q806.37 238.73 820.29 207.56Q834.22 176.39 843.5 161.8Q828.91 171.09 796.42 186.34Q763.93 201.59 729.44 212.2L128.65 420.42L0 291.78L859.42 0L1000 140.58L708.22 1000Z';

type Props = {
  size?: number;
  fill?: string;
  gradient?: string[];
} & Omit<React.SVGProps<SVGSVGElement>, 'fill'>;

export function UniconMark({ size = 24, fill, gradient, ...rest }: Props) {
  const id = useId();
  const theme = useMantineTheme();
  const stops = gradient ?? theme.other.sunsetStops;
  const useGradient = !fill;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 1000 1000"
      role="img"
      aria-label="Unicon"
      {...rest}
    >
      {useGradient && (
        <defs>
          <linearGradient id={id} x1="0" y1="1" x2="1" y2="0">
            {stops.map((c, i) => (
              <stop key={c + String(i)} offset={i / (stops.length - 1)} stopColor={c} />
            ))}
          </linearGradient>
        </defs>
      )}
      <path d={GLYPH} fill={useGradient ? `url(#${id})` : fill} />
    </svg>
  );
}
