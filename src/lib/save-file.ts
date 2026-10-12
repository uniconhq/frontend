/**
 * Hands a file the page holds to the browser to save, under `name`: the
 * bytes go to a link of their own, which is clicked and let go of at once.
 */
export function saveFile(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  // The browser reads the address as the click is handled; letting it go a
  // moment later leaves it time on a slow one.
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
