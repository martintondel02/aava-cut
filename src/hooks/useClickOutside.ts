import { useEffect, type RefObject } from 'react';

export function useClickOutside(ref: RefObject<HTMLElement | null>, onOutside: () => void, active = true) {
  useEffect(() => {
    if (!active) return;
    const handler = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onOutside();
    };
    window.addEventListener('pointerdown', handler, true);
    return () => window.removeEventListener('pointerdown', handler, true);
  }, [active, onOutside, ref]);
}

export function useKeyboardHelpModal() {
  // Kept as a tiny helper so the header and rail can both open the shortcuts sheet.
  return () => window.dispatchEvent(new CustomEvent('lumacut:shortcuts'));
}
