/** MessageChannel avoids the nested-timer clamp in browsers without scheduler.yield(). */
export function yieldPreparation(): Promise<void> {
  const scheduler = (
    globalThis as typeof globalThis & { scheduler?: { yield?: () => Promise<void> } }
  ).scheduler;
  if (scheduler?.yield) return scheduler.yield();
  if (typeof MessageChannel === "undefined")
    return new Promise((resolve) => setTimeout(resolve, 0));
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.onmessage = null;
      channel.port1.close();
      channel.port2.close();
      resolve();
    };
    channel.port2.postMessage(null);
  });
}
