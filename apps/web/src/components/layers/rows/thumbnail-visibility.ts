interface Subscription {
  notify: (visible: boolean) => void;
  since: number;
}
const subscriptions = new Map<Element, Subscription>();
let observer: IntersectionObserver | undefined;
let generation = 0;

/** One browser observer serves the bounded row window and closes with its last row. */
export function observeLayerThumbnail(
  element: Element,
  notify: (visible: boolean) => void,
): () => void {
  if (!observer) {
    const current = ++generation;
    observer = new IntersectionObserver(
      (entries) => {
        if (current !== generation) return;
        for (const entry of entries) {
          const subscription = subscriptions.get(entry.target);
          if (subscription && entry.time >= subscription.since)
            subscription.notify(entry.isIntersecting);
        }
      },
      { rootMargin: "32px" },
    );
  }
  // Re-observing a reused node must request a fresh initial entry rather than
  // donating a queued visibility sample from its previous owner.
  if (subscriptions.has(element)) observer.unobserve(element);
  const subscription = { notify, since: performance.now() };
  subscriptions.set(element, subscription);
  observer.observe(element);
  return () => {
    if (subscriptions.get(element) !== subscription) return;
    subscriptions.delete(element);
    observer?.unobserve(element);
    if (!subscriptions.size) {
      observer?.disconnect();
      observer = undefined;
      generation++;
    }
  };
}
