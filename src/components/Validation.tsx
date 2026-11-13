import { mlScore, type OdysseyData, type ProfileKey } from '../types';
import { Reveal } from './Reveal';
import { SectionHead } from './SectionHead';

type Props = {
  data: OdysseyData;
  profile: ProfileKey;
};

function fitLabel(rank: number) {
  if (rank <= 5) return { label: 'Core', color: 'var(--green)' };
  if (rank <= 12) return { label: 'Strong', color: 'var(--cyan)' };
  if (rank <= 22) return { label: 'Partial', color: 'var(--amber)' };
  return { label: 'Off-profile', color: 'var(--paper-faint)' };
}

export function Validation({ data, profile }: Props) {
  const ranked = [...data.sites].sort((a, b) => mlScore(b, profile) - mlScore(a, profile));
  const benchmarks = data.sites.filter((s) => s.benchmark);
  const validation = data.validation[profile];

  return (
    <section className="section" id="validation" style={{ paddingTop: 40 }}>
      <div className="container">
        <SectionHead
          index="10"
          label="VALIDATION"
          title={<>THE MODEL RECOVERS<br />THE RIGHT BENCHMARKS.</>}
          lead="A model that ranks every famous analog highly is a popularity contest. Odyssey recovers the benchmarks that fit the profile, and demotes the ones that do not."
        />

        <div className="val-grid">
          <Reveal>
            <div className="mono" style={{ color: 'var(--paper-faint)', marginBottom: 14 }}>BENCHMARK RECOVERY / {data.profiles[profile].short}</div>
            <table className="val-table">
              <thead>
                <tr>
                  <th>Benchmark</th>
                  <th>Known for</th>
                  <th>Fit</th>
                  <th>Rank</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {benchmarks.map((s) => {
                  const rank = ranked.findIndex((x) => x.id === s.id) + 1;
                  const fit = fitLabel(rank);
                  return (
                    <tr key={s.id}>
                      <td className="site">{s.name}</td>
                      <td>{s.tags.slice(0, 2).join(' · ')}</td>
                      <td style={{ color: fit.color }}>{fit.label}</td>
                      <td className="rank" style={{ color: fit.color }}>#{rank}</td>
                      <td>{mlScore(s, profile).toFixed(1)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="val-note">
              <b>What this proves:</b> the scoring does not reward fame. Atacama is a core lunar-base analog;
              Svalbard and Devon are partial thermal analogs; Río Tinto is a world-class Mars aqueous analog
              but correctly ranks near the bottom for a lunar base. The new candidates fill the dimensions
              the benchmarks cannot cover.
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="mono" style={{ color: 'var(--paper-faint)', marginBottom: 14 }}>STABILITY UNDER WEIGHT PERTURBATION</div>
            <div className="stability">
              <div className="stability-cell">
                <div className="v" style={{ color: 'var(--green)' }}>{validation.top1Stability}%</div>
                <div className="k">Top pick retained</div>
              </div>
              <div className="stability-cell">
                <div className="v" style={{ color: 'var(--green)' }}>{validation.top3Stability}%</div>
                <div className="k">Top 3 retained</div>
              </div>
              <div className="stability-cell">
                <div className="v">{validation.runs}</div>
                <div className="k">Perturbation runs</div>
              </div>
            </div>

            <div className="val-note" style={{ marginTop: 28 }}>
              <b>Method:</b> every site is scored on six normalized dimensions. Climate comes from
              NASA POWER (2001–2020). Terrain relief comes from Open-Meteo elevation samples.
              Geology, dust and access are expert-coded from site descriptions; they are explicit
              assumptions, not hidden weights. The model is a transparent weighted similarity,
              not a black box.
            </div>

            <div className="val-note">
              <b>What breaks:</b> Earth cannot reproduce lunar gravity (0.166 g), lunar vacuum,
              Martian gravity (0.38 g), the Martian atmosphere (0.6 kPa), or the radiation
              environment. Those are marked facility-only, not pretended away.
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
