/** Bytes deflated as a zip tool deflates a file, by the runtime's own compressor. */
async function deflated(
  bytes: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const body = new Response(bytes).body;
  if (body === null) return bytes;
  const stream = body.pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * A zip archive made in the test, as a person's zip tool writes one: each
 * file's local header and bytes, deflated or stored, then the central
 * directory and its end. Checksums are left at zero, which the reader under
 * test does not check. `declared` is the size the archive says a file
 * unpacks to, when it is to say another than the file's own.
 */
export async function makeZip(
  files: { name: string; text: string; stored?: boolean; declared?: number }[],
): Promise<File> {
  const encoder = new TextEncoder();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  const central: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;
  for (const { name, text, stored = false, declared } of files) {
    const nameBytes = encoder.encode(name);
    const raw = encoder.encode(text);
    const data = stored ? raw : await deflated(raw);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(8, stored ? 0 : 8, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, declared ?? raw.length, true);
    local.setUint16(26, nameBytes.length, true);
    chunks.push(new Uint8Array(local.buffer), nameBytes, data);

    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 20, true);
    entry.setUint16(10, stored ? 0 : 8, true);
    entry.setUint32(20, data.length, true);
    entry.setUint32(24, declared ?? raw.length, true);
    entry.setUint16(28, nameBytes.length, true);
    entry.setUint32(42, offset, true);
    central.push(new Uint8Array(entry.buffer), nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const size = central.reduce((total, part) => total + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, size, true);
  end.setUint32(16, offset, true);
  return new File([...chunks, ...central, new Uint8Array(end.buffer)], 'tests.zip', {
    type: 'application/zip',
  });
}
