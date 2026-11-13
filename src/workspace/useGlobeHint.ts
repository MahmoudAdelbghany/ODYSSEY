import { useState } from 'react';

const KEY = 'odyssey.globeHint.dismissed';

function seen() {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/** Shows how to move the globe until the first interaction, then never again in this browser. */
export function useGlobeHint() {
  const [visible, setVisible] = useState(() => !seen());
  const dismiss = () => {
    if (!visible) return;
    setVisible(false);
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      /* storage unavailable: the hint simply returns next visit */
    }
  };
  return { visible, dismiss };
}
