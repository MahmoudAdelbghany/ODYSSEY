import type { ReactNode } from 'react';
import { Reveal } from './Reveal';

type Props = {
  index: string;
  label: string;
  title: ReactNode;
  lead?: ReactNode;
  right?: ReactNode;
  className?: string;
};

export function SectionHead({ index, label, title, lead, right, className = '' }: Props) {
  return (
    <div className={`section-head ${className}`} style={{ marginBottom: 48 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 40, flexWrap: 'wrap' }}>
        <div style={{ maxWidth: 900 }}>
          <Reveal>
            <div className="eyebrow">
              <span className="idx">{index}</span>
              <span>{label}</span>
            </div>
          </Reveal>
          <Reveal delay={0.08}>
            <h2 className="display h2" style={{ marginTop: 24 }}>{title}</h2>
          </Reveal>
          {lead ? (
            <Reveal delay={0.16}>
              <p className="lead" style={{ marginTop: 26 }}>{lead}</p>
            </Reveal>
          ) : null}
        </div>
        {right ? <Reveal delay={0.2}>{right}</Reveal> : null}
      </div>
    </div>
  );
}
