const items = [
  'NASA POWER',
  'MODIS TERRA',
  'NASA GIBS',
  'LRO LOLA',
  'LRO DIVINER',
  'MRO MOLA',
  'MRO THEMIS',
  'OPEN-METEO',
  'PDS GEOSCIENCES',
  'USGS',
  'COPERNICUS',
  'ESA',
];

export function Marquee() {
  const track = [...items, ...items];
  return (
    <div className="marquee" aria-hidden>
      <div className="marquee-track">
        {track.map((item, i) => (
          <div className="marquee-item" key={`${item}-${i}`}>{item}</div>
        ))}
      </div>
    </div>
  );
}
