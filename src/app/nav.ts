// In-memory navigation. The app is also served inside a framed viewer where
// URL changes don't reach the address bar, so screens are app state with a
// back stack instead of routes.
import { useSyncExternalStore } from 'react';

export type Screen =
  | { name: 'home' }
  | { name: 'about' }
  | { name: 'create' }
  | { name: 'sheet'; id: string; tab?: 'character' | 'equipment' }
  | { name: 'vault'; id: string }
  | { name: 'picker'; id: string; kind: 'weapon' | 'armor' | 'item'; slot?: 'primary' | 'secondary' | 'inventory' }
  | { name: 'rest'; id: string; kind: 'short' | 'long' }
  | { name: 'levelup'; id: string }
  | { name: 'beastform'; id: string; via: 'beastform' | 'evolution' }
  | { name: 'transformation'; id: string };

const LAST_KEY = 'daggersheet:v1:last';

let stack: Screen[] = [initial()];
const listeners = new Set<() => void>();

function initial(): Screen {
  try {
    const last = localStorage.getItem(LAST_KEY);
    if (last) return { name: 'sheet', id: last };
  } catch {
    // ignore
  }
  return { name: 'home' };
}

function emit() {
  const top = stack[stack.length - 1];
  try {
    if ('id' in top && top.name === 'sheet') localStorage.setItem(LAST_KEY, top.id);
    if (top.name === 'home') localStorage.removeItem(LAST_KEY);
  } catch {
    // ignore
  }
  window.scrollTo({ top: 0 });
  for (const l of listeners) l();
}

export function useScreen(): Screen {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => stack[stack.length - 1],
  );
}

export function go(s: Screen) {
  stack = [...stack, s];
  emit();
}

/** Replace the current screen (tab switches, finishing a flow). */
export function replace(s: Screen) {
  stack = [...stack.slice(0, -1), s];
  emit();
}

export function back() {
  stack = stack.length > 1 ? stack.slice(0, -1) : [{ name: 'home' }];
  emit();
}

export function home() {
  stack = [{ name: 'home' }];
  emit();
}
