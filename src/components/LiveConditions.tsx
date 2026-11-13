import { useEffect, useState } from 'react';
import { Activity, CloudSun, Radio } from 'lucide-react';
import type { Site } from '../types';

type Forecast = {
  current: { temp: number; wind: number; humidity: number; time: string };
  daily: { time: string[]; max: number[]; min: number[]; precip: number[] };
  timezone: string;
};

type Seismic = {
  count: number;
  maxMag: number;
  latestPlace: string;
  latestTime: number;
};

const forecastCache = new Map<string, Forecast>();
const seismicCache = new Map<string, Seismic>();

function hazard(count: number, maxMag: number) {
  if (maxMag >= 5.5 || count >= 8) return { label: 'HIGH', color: 'var(--red)' };
  if (maxMag >= 4.5 || count >= 3) return { label: 'MODERATE', color: 'var(--amber)' };
  return { label: 'LOW', color: 'var(--green)' };
}

export function LiveConditions({ site }: { site: Site }) {
  const [forecast, setForecast] = useState<Forecast | null>(forecastCache.get(site.id) ?? null);
  const [seismic, setSeismic] = useState<Seismic | null>(seismicCache.get(site.id) ?? null);
  const [loading, setLoading] = useState(!forecast || !seismic);

  useEffect(() => {
    let alive = true;
    const cachedF = forecastCache.get(site.id);
    const cachedS = seismicCache.get(site.id);
    if (cachedF && cachedS) {
      setForecast(cachedF);
      setSeismic(cachedS);
      setLoading(false);
      return;
    }
    setLoading(true);
    const start = new Date();
    start.setFullYear(start.getFullYear() - 1);
    const startStr = start.toISOString().slice(0, 10);
    const fUrl = `https://api.open-meteo.com/v1/forecast?latitude=${site.lat}&longitude=${site.lon}` +
      `&current=temperature_2m,wind_speed_10m,relative_humidity_2m` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto&forecast_days=7`;
    const sUrl = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson` +
      `&latitude=${site.lat}&longitude=${site.lon}&maxradiuskm=300` +
      `&starttime=${startStr}&minmagnitude=4&limit=50`;

    Promise.all([
      fetch(fUrl).then((r) => (r.ok ? r.json() : Promise.reject(new Error('forecast')))),
      fetch(sUrl).then((r) => (r.ok ? r.json() : Promise.reject(new Error('seismic')))),
    ])
      .then(([f, s]) => {
        if (!alive) return;
        const fc: Forecast = {
          current: {
            temp: f.current?.temperature_2m ?? 0,
            wind: f.current?.wind_speed_10m ?? 0,
            humidity: f.current?.relative_humidity_2m ?? 0,
            time: f.current?.time ?? '',
          },
          daily: {
            time: f.daily?.time ?? [],
            max: f.daily?.temperature_2m_max ?? [],
            min: f.daily?.temperature_2m_min ?? [],
            precip: f.daily?.precipitation_sum ?? [],
          },
          timezone: f.timezone ?? '',
        };
        const feats = s.features ?? [];
        const mags = feats.map((x: any) => Number(x.properties?.mag ?? 0));
        const latest = feats[0];
        const sc: Seismic = {
          count: feats.length,
          maxMag: mags.length ? Math.max(...mags) : 0,
          latestPlace: latest?.properties?.place ?? 'No M4+ event within 300 km',
          latestTime: latest?.properties?.time ?? 0,
        };
        forecastCache.set(site.id, fc);
        seismicCache.set(site.id, sc);
        setForecast(fc);
        setSeismic(sc);
      })
      .catch(() => {
        if (alive) {
          setForecast(null);
          setSeismic(null);
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => { alive = false; };
  }, [site.id, site.lat, site.lon]);

  const h = seismic ? hazard(seismic.count, seismic.maxMag) : { label: ', ', color: 'var(--paper-faint)' };
  const maxTemps = forecast?.daily.max ?? [];
  const lo = Math.min(...maxTemps, 0);
  const hi = Math.max(...maxTemps, 1);

  return (
    <div className="live-grid">
      <div className="live-card">
        <div className="live-head">
          <div className="mono" style={{ color: 'var(--paper-faint)', display: 'flex', alignItems: 'center', gap: 7 }}>
            <CloudSun size={12} /> LIVE / NEXT 7 DAYS
          </div>
          <div className="mono" style={{ color: loading ? 'var(--amber)' : 'var(--green)' }}>
            {loading ? 'SYNCING' : '● LIVE'}
          </div>
        </div>
        {forecast ? (
          <>
            <div className="live-current">
              <div><span className="v">{forecast.current.temp.toFixed(1)}</span><span className="u">°C</span></div>
              <div><span className="v">{forecast.current.wind.toFixed(0)}</span><span className="u">km/h</span></div>
              <div><span className="v">{forecast.current.humidity.toFixed(0)}</span><span className="u">% RH</span></div>
            </div>
            <div className="forecast-bars">
              {forecast.daily.time.map((d, i) => {
                const val = forecast.daily.max[i] ?? 0;
                const height = 8 + ((val - lo) / Math.max(1, hi - lo)) * 42;
                return (
                  <div className="forecast-col" key={d}>
                    <div className="forecast-bar" style={{ height }} title={`${val.toFixed(1)}°C / ${forecast.daily.min[i]?.toFixed(1)}°C`} />
                    <div className="forecast-day">{new Date(d).toLocaleDateString('en', { weekday: 'short' }).slice(0, 2)}</div>
                  </div>
                );
              })}
            </div>
            <div className="mono" style={{ color: 'var(--paper-faint)', marginTop: 8, fontSize: 7 }}>
              {forecast.timezone} / OPEN-METEO FORECAST
            </div>
          </>
        ) : (
          <div className="live-empty">{loading ? 'Reading current conditions…' : 'Live forecast unavailable.'}</div>
        )}
      </div>

      <div className="live-card">
        <div className="live-head">
          <div className="mono" style={{ color: 'var(--paper-faint)', display: 'flex', alignItems: 'center', gap: 7 }}>
            <Activity size={12} /> SEISMIC / 300 KM / 1 YR
          </div>
          <div className="mono" style={{ color: h.color }}>● {h.label}</div>
        </div>
        {seismic ? (
          <>
            <div className="live-current">
              <div><span className="v">{seismic.count}{seismic.count >= 50 ? '+' : ''}</span><span className="u">M4+ events</span></div>
              <div><span className="v">{seismic.maxMag ? seismic.maxMag.toFixed(1) : ', '}</span><span className="u">max mag</span></div>
            </div>
            <div className="seismic-note">
              <Radio size={11} color="var(--amber)" />
              <span>{seismic.latestPlace}</span>
            </div>
            <div className="mono" style={{ color: 'var(--paper-faint)', marginTop: 8, fontSize: 7 }}>
              USGS EARTHQUAKE CATALOG / FIELD SAFETY LIMITATION
            </div>
          </>
        ) : (
          <div className="live-empty">{loading ? 'Querying USGS catalog…' : 'Seismic feed unavailable.'}</div>
        )}
      </div>
    </div>
  );
}
