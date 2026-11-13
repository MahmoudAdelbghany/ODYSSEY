const TOUCH = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;

export function GlobeHint({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="globe-hint" aria-hidden="true">
      <span className="globe-hint-icon" />
      {TOUCH ? 'Drag to rotate · Pinch to zoom' : 'Drag to rotate · Scroll to zoom'}
    </div>
  );
}
