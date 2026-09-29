import { liveQuery } from 'dexie';
import { createContext } from 'preact';
import { useContext, useEffect, useState } from 'preact/hooks';

export const AppContext = createContext(null);

export function useApp() {
  return useContext(AppContext);
}

// Subscribes to a Dexie query and re-renders on every change.
export function useLive(query, deps = [], initial = undefined) {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    const sub = liveQuery(query).subscribe({ next: setValue, error: (e) => console.error(e) });
    return () => sub.unsubscribe();
  }, deps);
  return value;
}

export function useHashRoute() {
  const read = () => (location.hash.replace(/^#\/?/, '') || 'oggi').split('?')[0];
  const [route, setRoute] = useState(read());
  useEffect(() => {
    const on = () => setRoute(read());
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return route;
}

export function hashParam(name) {
  const q = location.hash.split('?')[1];
  return q ? new URLSearchParams(q).get(name) : null;
}
