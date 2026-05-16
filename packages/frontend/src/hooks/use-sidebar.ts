import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'sidebar:pinned';

function loadPinned(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function savePinned(v: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, String(v));
  } catch {
    // Ignore
  }
}

export function useSidebar() {
  const [pinned, setPinnedState] = useState(loadPinned);
  const [hovered, setHovered] = useState(false);

  const expanded = pinned || hovered;

  const togglePin = useCallback(() => {
    setPinnedState(prev => {
      const next = !prev;
      savePinned(next);
      return next;
    });
  }, []);

  useEffect(() => {
    savePinned(pinned);
  }, [pinned]);

  return { pinned, hovered, expanded, togglePin, setHovered };
}
