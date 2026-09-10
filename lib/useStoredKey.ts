'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * A string value (typically an API key) persisted to this browser's
 * localStorage. First render is always '' so server and client markup match;
 * the stored value is loaded in an effect after mount.
 *
 * Returns [value, set, clear]. `set('')` and `clear()` both remove the entry.
 * All localStorage access is guarded — private-mode browsers and disabled
 * site data throw on access, in which case the value simply stays in memory.
 */
export function useStoredKey(storageKey: string): [string, (v: string) => void, () => void] {
  const [value, setValue] = useState('');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) setValue(saved);
    } catch {
      /* localStorage unavailable — keep the in-memory default */
    }
  }, [storageKey]);

  const set = useCallback(
    (v: string) => {
      setValue(v);
      try {
        if (v) localStorage.setItem(storageKey, v);
        else localStorage.removeItem(storageKey);
      } catch {
        /* ignore — value is still held in memory for this session */
      }
    },
    [storageKey],
  );

  const clear = useCallback(() => set(''), [set]);

  return [value, set, clear];
}
