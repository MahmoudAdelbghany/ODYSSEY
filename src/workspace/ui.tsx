import type { ReactNode } from 'react';
import type { Tone } from './labels';
import { scoreColor } from './labels';

export function Badge({ tone = 'muted', children, plain }: { tone?: Tone; children: ReactNode; plain?: boolean }) {
  return <span className={`badge badge-${tone}${plain ? ' badge-plain' : ''}`}>{children}</span>;
}

export function SectionHeader({ title, lead, actions }: { title: string; lead?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="ws-section-head">
      <div>
        <h1>{title}</h1>
        {lead ? <p>{lead}</p> : null}
      </div>
      {actions ? <div className="row">{actions}</div> : null}
    </header>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children ? <p>{children}</p> : null}
      {action}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Meter({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="meter">
      <span>{label}</span>
      {value == null ? (
        <span className="no-data">No data</span>
      ) : (
        <span className="meter-track">
          <span style={{ width: `${Math.max(2, value)}%`, background: `linear-gradient(90deg, color-mix(in srgb, ${scoreColor(value)} 35%, transparent), ${scoreColor(value)})` }} />
        </span>
      )}
      <b style={value == null ? undefined : { color: scoreColor(value) }}>{value ?? '–'}</b>
    </div>
  );
}

export function Disclosure({ summary, meta, open, children }: { summary: ReactNode; meta?: ReactNode; open?: boolean; children: ReactNode }) {
  return (
    <details className="disclosure" open={open}>
      <summary>
        {summary}
        {meta ? <span className="summary-meta">{meta}</span> : null}
      </summary>
      <div className="disclosure-body">{children}</div>
    </details>
  );
}
