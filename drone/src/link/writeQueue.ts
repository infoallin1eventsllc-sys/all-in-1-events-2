/**
 * Writes for a link that takes a frame in small pieces (BLE: 20 bytes a write, each awaited).
 * Two frames sent at once (the 1 Hz heartbeat and a command) would otherwise interleave their
 * pieces and the bridge would pass garbage to the autopilot. One chain for every write keeps
 * each frame whole; a failed write fails its own caller and does not stall the ones after it.
 */
export function chunkedWriter(write: (part: Uint8Array) => Promise<void>, mtu: number): (bytes: Uint8Array) => Promise<void> {
  let chain: Promise<void> = Promise.resolve();
  return bytes => {
    const run = chain.then(async () => { for (let i = 0; i < bytes.length; i += mtu) await write(bytes.subarray(i, i + mtu)); });
    chain = run.catch(() => {});
    return run;
  };
}
