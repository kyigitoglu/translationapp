// In-memory token store for development.
// Replace with a database (e.g. Redis, Postgres) in production.
const store = new Map<string, string>();

export function setToken(siteId: string, token: string) {
  store.set(siteId, token);
}

export function getToken(siteId: string): string | undefined {
  return store.get(siteId);
}
