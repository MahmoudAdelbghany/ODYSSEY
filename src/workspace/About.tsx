import { useEffect } from 'react';

const STEPS = [
  ['Read the brief', 'A language model maps your mission to a catalogue of experiment types, quoting the words in your brief that justify each one.'],
  ['Set requirements', 'Each experiment gets measurable limits, such as maximum slope or temperature range, from a documented recipe library.'],
  ['Rank sites', 'Every curated Earth site is checked against the hard limits first. Survivors are ranked on terrain, temperature, geology, access and evidence, each shown separately.'],
  ['Find where Earth falls short', 'Each site is compared with the Moon south pole or Mars (Jezero) measurement by measurement. Conditions no site can reproduce, such as gravity and vacuum, are named explicitly.'],
  ['Design interventions', 'For those conditions ODYSSEY proposes controlled tests, such as vacuum chambers or gravity offload, with first-order physics you can adjust.'],
  ['Plan the campaign', 'An optimiser assigns experiments to sites and climate windows three ways: best science, least travel, fewest facilities.'],
];

const DATA = [
  ['NASA POWER (MERRA-2)', 'Climate normals 2001 to 2020 for every site'],
  ['MODIS Aqua land surface temperature', 'Measured day and night ground temperature'],
  ['Copernicus DEM GLO-30 and Sentinel-2', 'Terrain at 40 m and imagery at 10 m'],
  ['LRO LOLA and MGS MOLA', 'Moon and Mars terrain at the same scale as Earth'],
  ['LRO Diviner and Mars 2020 MEDA', 'Published Moon and Mars temperatures'],
  ['NASA NSSDC fact sheets', 'Gravity, pressure and atmosphere, checked word for word'],
  ['ESA WorldCover 2021', 'Bare ground at 10 m, an upper bound on rock exposure'],
  ['Macrostrat, WorldClim, OurAirports', 'Geology, global screening and access'],
];

export function About({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="about ui" role="dialog" aria-modal="true" aria-labelledby="about-title">
      <header className="ws-topbar">
        <span className="ws-brand">
          <span className="orb-mark" aria-hidden="true" />
          ODYSSEY
        </span>
        <div className="ws-top-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
      </header>
      <div className="about-body">
        <h1 id="about-title">About ODYSSEY</h1>
        <p className="about-lead">
          Before people work on the Moon or Mars, teams rehearse on Earth: in deserts, polar regions, volcanic fields and craters. No place on Earth matches another world everywhere. ODYSSEY finds which Earth site suits each experiment of a mission, measures where that site differs from the target, and plans how to test what Earth cannot provide.
        </p>

        <h2>How it works</h2>
        <ol className="about-steps">
          {STEPS.map(([title, text]) => (
            <li key={title}>
              <b>{title}</b>
              <span>{text}</span>
            </li>
          ))}
        </ol>

        <h2>Data</h2>
        <table className="table">
          <tbody>
            {DATA.map(([name, use]) => (
              <tr key={name}>
                <td className="strong">{name}</td>
                <td>{use}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2>Rules ODYSSEY follows</h2>
        <ul className="list">
          <li>A missing measurement is shown as missing, never as zero or as a match.</li>
          <li>A gap says why: a dataset not yet connected, a quantity that needs a field measurement, or a condition Earth cannot reproduce.</li>
          <li>Air temperature, ground temperature and thermal inertia are never compared with each other.</li>
          <li>Search results count as evidence only after the full source is read and the quoted value is found in it.</li>
          <li>Intervention results are setpoints or simple physical models, labelled as such, never measurements.</li>
          <li>No Earth site is called equivalent to the Moon or Mars.</li>
        </ul>

        <h2>Limits</h2>
        <p className="muted">
          Climate values are monthly normals, not forecasts. Terrain is analysed at 40 m, not at the scale of a rover wheel. Bearing strength, thermal inertia and grain size at Earth sites need field measurements; ODYSSEY says which test to run. Rock exposure has only an upper bound from 10 m land cover. Facility performance and costs are not verified.
        </p>

        <h2>Built for</h2>
        <p className="muted">
          NASA Space Apps Challenge 2026, “Identify Earth Locations that Analog the Permanent Moon Base Locations and Mars”. Evidence search uses the Earth-Location-Nasa validator; candidate reranking uses the WA-on-test2 Reranker.
        </p>
        <div className="row about-actions">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Plan a mission
          </button>
        </div>
      </div>
    </div>
  );
}
