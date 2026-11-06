export function saveFile(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  // Revoked a moment later, so a slow browser still has time to read it.
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
