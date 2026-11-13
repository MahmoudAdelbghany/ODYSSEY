import { motion } from 'framer-motion';
import { AlertTriangle, ArrowUpRight, Crosshair, Lightbulb } from 'lucide-react';
import {
  DIMENSION_LABELS,
  mlScore,
  mlUncertainty,
  type Dimensions,
  type OdysseyData,
  type ProfileKey,
  type Score,
  type Site,
} from '../types';
import { Reveal } from './Reveal';
import { LiveConditions } from './LiveConditions';

type Props = {
  data: OdysseyData;
  campaign: import('../types').Campaign;
  profile: ProfileKey;
  site: Site;
};

function suggestionsFor(site: Site, score: Score) {
  const out: string[] = [];
  if (score.dimensions.thermal < 70) out.push('Extend the ambient thermal cycle with a thermal vacuum chamber.');
  if (score.dimensions.dust < 70) out.push('Add a dust chamber or aerosol injection to match the target dust load.');
  if (score.dimensions.geology < 70) out.push('Pair this site with a second site for the missing mineralogy; do not force a single-site match.');
  if (score.dimensions.access < 60) out.push('Add 2–3 buffer days and a helicopter/ship transfer; confirm evacuation routes.');
  if (score.dimensions.aridity < 70) out.push('Add a controlled humidity/volatile test before field deployment.');
  if (site.macrostrat?.lith) out.push(`Ground-truth the Macrostrat unit (${site.macrostrat.lith.split(';')[0]}) with a field assay.`);
  return out.slice(0, 4);
}

export function Dossier({ data, campaign, profile, site }: Props) {
  const score = site.scores[profile];
  const total = mlScore(site, profile);
  const uncertainty = mlUncertainty(site, profile);
  const assignment = campaign.assignments.find((a) => a.siteId === site.id);
  const assignmentIndex = campaign.assignments.findIndex((a) => a.siteId === site.id);
  const leg = assignmentIndex > 0 ? campaign.legs[assignmentIndex - 1] : null;
  const missing = Array.from(new Set([...score.missing, ...data.profiles[profile].missing]));
  const sortedDims = (Object.keys(score.dimensions) as (keyof Dimensions)[]).sort(
    (a, b) => score.dimensions[b] - score.dimensions[a],
  );
  const bestDim = sortedDims[0];
  const limitDim = sortedDims[sortedDims.length - 1];
  const suggestions = suggestionsFor(site, score);

  return (
    <div id="dossier">
      <Reveal>
        <div className="dossier">
          <div className="dossier-visual">
            <img src={site.image} alt={`${site.name} satellite view`} />
            <div className="dossier-overlay">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div className="dossier-tag"><span className="dot" /> SITE DOSSIER / {site.benchmark ? 'BENCHMARK' : 'CANDIDATE'}</div>
                <div className="dossier-coords">{Math.abs(site.lat).toFixed(2)}°{site.lat >= 0 ? 'N' : 'S'} / {Math.abs(site.lon).toFixed(2)}°{site.lon >= 0 ? 'E' : 'W'}</div>
              </div>
              <div>
                <div className="dossier-tag" style={{ color: 'var(--paper-dim)' }}>
                  <Crosshair size={11} /> NASA GIBS / MODIS TERRA / TRUE COLOR
                </div>
                <div className="mono" style={{ color: 'var(--paper-faint)', marginTop: 8 }}>
                  MODIS TERRA / 250 M COMPOSITE
                </div>
              </div>
            </div>
          </div>

          <div className="dossier-body">
            <div className="mono" style={{ color: 'var(--cyan)' }}>{site.type}</div>
            <h3 className="dossier-title" style={{ marginTop: 10 }}>{site.name}</h3>
            <div className="dossier-sub">
              <span>{site.country}</span>
              <span style={{ color: 'var(--line-strong)' }}>/</span>
              <span>{(site.tags || []).join(' · ')}</span>
            </div>

            {site.macrostrat ? (
              <div className="mono" style={{ color: 'var(--paper-faint)', marginTop: 12, lineHeight: 1.7 }}>
                MACROSTRAT / {site.macrostrat.lith || 'mapped unit'} · {site.macrostrat.age || 'age unknown'}
              </div>
            ) : null}

            <div className="dossier-score">
              <div className="big">{total.toFixed(1)}</div>
              <div className="lbl">ML MATCH<br />/ 100</div>
              <div style={{ flex: 1 }} />
              <div style={{ textAlign: 'right' }}>
                <div className="mono" style={{ color: 'var(--paper-faint)' }}>RULE / UNCERTAINTY</div>
                <div className="mono" style={{ color: 'var(--paper)', fontSize: 11, marginTop: 5 }}>
                  {score.total.toFixed(1)} / ±{uncertainty.toFixed(1)}
                </div>
              </div>
            </div>

            <div className="dims">
              {(Object.keys(score.dimensions) as (keyof Dimensions)[]).map((k, i) => (
                <div className="dim" key={k}>
                  <div className="dim-top">
                    <span>{DIMENSION_LABELS[k]}</span>
                    <b>{score.dimensions[k].toFixed(0)}</b>
                  </div>
                  <div className="dim-bar">
                    <motion.i
                      initial={{ width: 0 }}
                      whileInView={{ width: `${score.dimensions[k]}%` }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.9, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="climate-strip">
              <div className="climate-cell"><div className="k">Mean temp</div><div className="v">{site.climate.tempMean.toFixed(1)}°C</div></div>
              <div className="climate-cell"><div className="k">Precip / yr</div><div className="v">{site.climate.precipYear.toFixed(0)} mm</div></div>
              <div className="climate-cell"><div className="k">Aerosol</div><div className="v">{(site.climate.aerosol ?? 0).toFixed(2)}</div></div>
              <div className="climate-cell"><div className="k">Soil wetness</div><div className="v">{((site.climate.soilWetnessTop ?? 0) * 100).toFixed(0)}%</div></div>
              <div className="climate-cell"><div className="k">Local relief</div><div className="v">{site.climate.relief.toFixed(0)} m</div></div>
              <div className="climate-cell"><div className="k">Elevation</div><div className="v">{site.climate.elevation.toFixed(0)} m</div></div>
            </div>

            <LiveConditions site={site} />

            <p className="dossier-note">{site.summary}</p>
            <p className="dossier-note" style={{ color: 'var(--paper-faint)' }}>
              Best fit: {DIMENSION_LABELS[bestDim]} ({score.dimensions[bestDim].toFixed(0)}).
              Limiting dimension: {DIMENSION_LABELS[limitDim]} ({score.dimensions[limitDim].toFixed(0)}).
            </p>

            <div style={{ marginTop: 22, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <div className="mono" style={{ color: 'var(--paper-faint)' }}>WHAT BREAKS / FACILITY-ONLY</div>
                <div className="mono" style={{ color: 'var(--amber)' }}>{missing.length} ITEMS</div>
              </div>
              <div className="breaks">
                {missing.map((m) => (
                  <div className="chip amber" key={m}><span className="dot" />{m}</div>
                ))}
              </div>
            </div>

            <div className="suggestions-box">
              <div className="mono" style={{ color: 'var(--cyan)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Lightbulb size={12} /> FIELD SUGGESTIONS
              </div>
              {suggestions.map((s) => (
                <div className="suggestion" key={s}>
                  <span className="s-dot" />
                  <span>{s}</span>
                </div>
              ))}
            </div>

            {assignment ? (
              <div className="campaign-role-box">
                <div className="mono" style={{ color: 'var(--cyan)' }}>CAMPAIGN ROLE / {campaign.scenarioLabel ?? 'BALANCED'}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 14, marginTop: 10 }}>
                  <div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>{assignment.experiment}</div>
                    <div className="mono" style={{ color: 'var(--paper-faint)', marginTop: 6 }}>
                      WINDOW {assignment.window.join('–')} / {assignment.country}
                    </div>
                    {leg ? (
                      <div className="mono" style={{ color: 'var(--amber)', marginTop: 6 }}>
                        TRAVEL IN / {leg.hours.toFixed(1)} H from {leg.fromAirport} · ${leg.cost.toLocaleString()}
                      </div>
                    ) : (
                      <div className="mono" style={{ color: 'var(--green)', marginTop: 6 }}>CAMPAIGN START / FIRST SITE</div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="mono" style={{ color: 'var(--paper-faint)' }}>FIT</div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 28 }}>{assignment.fit.toFixed(0)}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ marginTop: 22, padding: 16, border: '1px solid var(--line)' }}>
                <div className="mono" style={{ color: 'var(--paper-faint)' }}>CAMPAIGN ROLE</div>
                <div style={{ fontSize: 13, color: 'var(--paper-dim)', marginTop: 8 }}>
                  Not selected for the current campaign. Switch profiles to see other assignments.
                </div>
              </div>
            )}

            <div className="limitations-box">
              <div className="mono" style={{ color: 'var(--amber)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertTriangle size={12} /> LIMITATIONS / DATA
              </div>
              <ul>
                <li>Climate is a NASA POWER reanalysis grid, not a local weather station.</li>
                <li>Geology is a Macrostrat map unit, not an in-situ assay.</li>
                <li>Gravity, pressure and radiation are facility-only; they are not reproduced here.</li>
              </ul>
            </div>

            <a
              href={site.image}
              target="_blank"
              rel="noreferrer"
              className="mono"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--cyan)', marginTop: 20 }}
            >
              OPEN SATELLITE FRAME <ArrowUpRight size={11} />
            </a>
          </div>
        </div>
      </Reveal>
    </div>
  );
}
