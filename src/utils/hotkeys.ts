import { useEffect } from 'react';

type HotkeyHandler = (event: KeyboardEvent) => void;

interface Hotkeys {
  [key: string]: HotkeyHandler;
}

export function useHotkeys(hotkeys: Hotkeys) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key;
      // Handle F1-F12 and other keys
      if (hotkeys[key]) {
        event.preventDefault();
        hotkeys[key](event);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [hotkeys]);
}
