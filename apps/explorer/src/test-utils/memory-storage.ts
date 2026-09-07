/** In-memory stand-in for `window.localStorage` in node-environment tests. */
export function createMemoryStorage() {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    removeItem: (key: string) => void items.delete(key),
    setItem: (key: string, value: string) => void items.set(key, value),
    items,
  };
}
