import { ArrowUpRight } from 'lucide-react';
import { Reveal } from './Reveal';
import { SectionHead } from './SectionHead';

type Props = {
  campaign: import('../types').Campaign;
  onSelect: (id: string) => void;
};

export function Sites({ campaign, onSelect }: Props) {

  return (
    <section className="section" id="sites" style={{ paddingTop: 40 }}>
      <div className="container">
        <SectionHead
          index="06"
          label="SHORTLIST"
          title={<>THREE SITES.<br />THREE JOBS.<br />ONE CAMPAIGN.</>}
          lead="The optimizer does not pick the three most Mars-like places. It assigns each experiment to the site that can actually test it, then sequences the campaign."
          right={<div className="mono" style={{ color: 'var(--cyan)' }}>SCENARIO / {campaign.scenarioLabel ?? 'BALANCED'}</div>}
        />

        <div className="site-cards">
          {campaign.assignments.map((a, i) => {
            const site = campaign.sites.find((s) => s.id === a.siteId);
            const leg = i > 0 ? campaign.legs[i - 1] : null;
            if (!site) return null;
            return (
              <Reveal key={a.siteId} delay={i * 0.08}>
                <article
                  className="site-card"
                  onClick={() => {
                    onSelect(a.siteId);
                    document.getElementById('dossier')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                >
                  <div className="site-card-img">
                    <img src={site.image} alt={`${site.name} satellite view`} />
                    <div className="site-card-badge">SITE 0{i + 1} / {a.experiment}</div>
                  </div>
                  <div className="site-card-body">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                      <div>
                        <div className="site-card-title">{site.name}</div>
                        <div className="site-card-meta">{site.country} / {site.type}</div>
                      </div>
                      <ArrowUpRight size={16} color="var(--cyan)" />
                    </div>
                    <div className="site-card-exp">
                      <div>
                        <div className="mono" style={{ color: 'var(--paper-faint)' }}>EXPERIMENT</div>
                        <div className="e" style={{ marginTop: 6 }}>{a.experiment}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div className="mono" style={{ color: 'var(--paper-faint)' }}>ML MATCH</div>
                        <div className="s">{a.score.toFixed(1)}</div>
                        <div className="mono" style={{ color: 'var(--paper-faint)', fontSize: 7, marginTop: 2 }}>RULE {a.ruleScore?.toFixed(1) ?? ', '}</div>
                      </div>
                    </div>
                    <div className="site-card-window">WINDOW / {a.window.join('–')} · FIT {a.fit.toFixed(0)}</div>
                    <div className="mono" style={{ color: leg ? 'var(--amber)' : 'var(--green)', marginTop: 6, fontSize: 7 }}>
                      {leg ? `TRAVEL / ${leg.hours.toFixed(1)} H · $${leg.cost.toLocaleString()}` : 'CAMPAIGN START / FIRST SITE'}
                    </div>
                  </div>
                </article>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
