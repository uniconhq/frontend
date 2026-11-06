import { Avatar as MantineAvatar } from '@mantine/core';

/** Shows the initial when Forgejo has no image, never a broken-image icon. */
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
