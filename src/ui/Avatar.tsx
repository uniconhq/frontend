import { Avatar as MantineAvatar } from '@mantine/core';

/**
 * Forgejo serves the image; when it does not, the initial stands in. Never a
 * broken-image icon next to someone's name.
 */
export function Avatar({
  src,
  name,
  size = 24,
}: {
  src: string | null;
  name: string;
  size?: number;
}) {
  return (
    <MantineAvatar src={src} alt="" size={size} radius="xl" color="sunset">
      {name.slice(0, 1).toUpperCase()}
    </MantineAvatar>
  );
}
