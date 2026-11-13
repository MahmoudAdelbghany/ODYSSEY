import { Reveal } from './Reveal';
import { SectionHead } from './SectionHead';

const sources = [
  ['01', 'NASA POWER', 'Climatology 2001–2020: temperature, precipitation, humidity, wind, solar.'],
  ['02', 'NASA GIBS / MODIS', 'True-color satellite imagery for every candidate region.'],
  ['03', 'OPEN-METEO', 'Elevation and local relief sampled around each site.'],
  ['04', 'MACROSTRAT', 'Mapped geologic units, lithology and age (CC-BY 4.0).'],
  ['05', 'NASA POWER AOD', 'Aerosol optical depth as a real dust/aeolian proxy.'],
  ['06', 'SOIL WETNESS', 'MERRA-2 surface and root-zone wetness for aridity.'],
  ['07', 'NASA PDS', 'Planetary data archives for Moon and Mars reference profiles.'],
  ['08', 'LRO / MRO', 'Lunar and Martian topography, temperature and surface context.'],
  ['09', 'USGS / COPERNICUS', 'DEMs, land cover and supporting Earth-observation products.'],
  ['10', 'ESA / JAXA', 'Partner agency datasets for cross-validation and future expansion.'],
  ['11', 'POLLINATIONS', 'Free LLM endpoint for the mission-architect agent. No key.'],
  ['12', 'OPENFLIGHTS / GREAT-CIRCLE', 'Airport hubs, distances and travel-time estimates.'],
];

export function DataStack() {
  return (
    <section className="section" id="data" style={{ paddingTop: 40 }}>
      <div className="container">
        <SectionHead
          index="11"
          label="DATA"
          title={<>BUILT ON<br />OPEN DATA.</>}
          lead="Every score starts with a named dataset. No decorative data, no invisible assumptions. The prototype is designed to plug into the official challenge resources when they publish."
        />

        <div className="data-grid">
          {sources.map(([n, t, d], i) => (
            <Reveal key={n} delay={i * 0.03}>
              <div className="data-card">
                <div className="n">{n} / SOURCE</div>
                <div>
                  <div className="t">{t}</div>
                  <div className="d">{d}</div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
        <div className="data-note">
          39 sites · 15 features · 3 profile-specific models · 12 open sources. Official challenge Resources tab opens Friday, November 13.
        </div>
      </div>
    </section>
  );
}
