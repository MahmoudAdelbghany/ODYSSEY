import { lazy, Suspense, useState } from 'react';
import OrbitalExperience from './OrbitalExperience';

const MissionControl = lazy(() => import('./MissionControl'));
const Briefing = lazy(() => import('./Briefing'));

const START_FULL =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('full');
const BASE: 'orbital' | 'full' = START_FULL ? 'full' : 'orbital';

function Loading() {
  return (
    <div className="orb-loading">
      <span>ODYSSEY</span>
    </div>
  );
}

export default function App() {
  const [mode, setMode] = useState<'orbital' | 'full' | 'briefing'>(BASE);
  const [hash, setHash] = useState<string | undefined>();

  const openBriefing = (target?: string) => {
    setHash(target);
    setMode('briefing');
  };

  const closeBriefing = () => {
    setHash(undefined);
    setMode(BASE);
  };

  const showBase = mode !== 'briefing';

  return (
    <>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: showBase ? 10 : -1,
          visibility: showBase ? 'visible' : 'hidden',
          pointerEvents: showBase ? 'auto' : 'none',
        }}
      >
        {BASE === 'full' ? (
          <Suspense fallback={<Loading />}>
            <MissionControl onOpenBriefing={openBriefing} />
          </Suspense>
        ) : (
          <OrbitalExperience onOpenBriefing={openBriefing} />
        )}
      </div>

      {mode === 'briefing' ? (
        <Suspense fallback={<Loading />}>
          <Briefing initialHash={hash} onOpenControl={closeBriefing} />
        </Suspense>
      ) : null}
    </>
  );
}
