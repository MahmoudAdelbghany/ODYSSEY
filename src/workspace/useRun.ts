import { useCallback, useEffect, useRef, useState } from 'react';
import { api, streamRun, type AgentEvent, type AgentStateView, type RunRow } from '../agent/api';

export interface RunData {
  run: RunRow | null;
  state: AgentStateView | null;
  events: AgentEvent[];
  error: string | null;
  refresh: () => void;
}

/** Live view of one agent run: snapshot plus the server-sent event stream. */
export function useRun(runId: string | null): RunData {
  const [run, setRun] = useState<RunRow | null>(null);
  const [state, setState] = useState<AgentStateView | null>(null);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  const load = useCallback((id: string) => {
    api
      .run(id)
      .then((r) => {
        setRun(r.run);
        if (r.state) setState(r.state);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const schedule = useCallback(
    (id: string) => {
      if (timer.current !== null) return;
      timer.current = window.setTimeout(() => {
        timer.current = null;
        load(id);
      }, 350);
    },
    [load],
  );

  useEffect(() => {
    if (!runId) return;
    let alive = true;
    queueMicrotask(() => {
      if (!alive) return;
      setRun(null);
      setState(null);
      setEvents([]);
    });
    load(runId);
    const stop = streamRun(
      runId,
      (event) => {
        setEvents((prev) => (prev.some((e) => e.seq === event.seq) ? prev : [...prev, event]));
        if (event.type === 'tool_result' || event.type === 'status') schedule(runId);
      },
      () => load(runId),
    );
    return () => {
      alive = false;
      stop();
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
    };
  }, [runId, load, schedule]);

  return { run, state, events, error, refresh: () => runId && load(runId) };
}
