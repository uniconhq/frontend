import * as webStreams from 'node:stream/web';

/**
 * `pool: 'vmThreads'` runs each test file in a VM context built from jsdom's
 * window, which lacks the stream classes Node has as globals. MSW's fetch
 * interceptor builds a TransformStream as it loads, so they are filled in here,
 * before any test file imports it.
 */
for (const [name, value] of Object.entries(webStreams)) {
  if (!(name in globalThis)) {
    Object.defineProperty(globalThis, name, {
      value,
      writable: true,
      configurable: true,
    });
  }
}
