import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Download, Search } from 'lucide-react';
import { Filter } from 'lucide-react';
import { mlScore, type OdysseyData, type ProfileKey } from '../types';
import { Reveal } from './Reveal';
import { ScanMap } from './ScanMap';
import { SectionHead } from './SectionHead';

type Props = {
  data: OdysseyData;
  campaign: import('../types').Campaign;
  profile: ProfileKey;
  selectedId: string;
  setSelectedId: (id: string) => void;
};

type FilterKey = 'all' | 'benchmark' | 'surprise';

export function Scan({ data, campaign, profile, selectedId, setSelectedId }: Props) {
  const [filter, setFilter] = useState<FilterKey>('all');
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<'ml' | 'rule' | 'access' | 'ground'>('ml');

  const sites = useMemo(() => {
    let list = [...data.sites];
    if (filter === 'benchmark') list = list.filter((s) => s.benchmark);
    if (filter === 'surprise') list = list.filter((s) => !s.benchmark);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((s) =>
        [s.name, s.country, s.type, s.macrostrat?.lith, ...(s.tags || [])]
          .join(' ')
          .toLowerCase()
          .includes(q),
      );
    }
    return list.sort((a, b) => {
      if (sortKey === 'rule') return b.scores[profile].total - a.scores[profile].total;
      if (sortKey === 'access') return b.access - a.access;
      if (sortKey === 'ground') return (a.airport?.groundHours ?? 99) - (b.airport?.groundHours ?? 99);
      return mlScore(b, profile) - mlScore(a, profile);
    });
  }, [data.sites, filter, profile, query, sortKey]);

  const downloadCSV = () => {
    const header = ['name', 'country', 'lat', 'lon', 'type', 'ml_predicted', 'ml_uncertainty', 'rule_score', 'airport', 'ground_hours', 'macrostrat_lith'];
    const rows = sites.map((s) => [
      s.name, s.country, s.lat, s.lon, s.type,
      mlScore(s, profile).toFixed(1),
      (s.ml?.[profile]?.uncertainty ?? 0).toFixed(1),
      s.scores[profile].total.toFixed(1),
      s.airport?.iata ?? '',
      s.airport?.groundHours ?? '',
      (s.macrostrat?.lith ?? '').replaceAll(',', ';'),
    ]);
    const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `odyssey-${profile}-sites.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="section" id="scan" style={{ paddingTop: 40 }}>
      <div className="container">
        <SectionHead
          index="05"
          label="GLOBAL SCAN"
          title={<>THE WHOLE PLANET<br />IS THE SEARCH SPACE.</>}
          lead="Odyssey screens candidate regions against the requirements, then ranks them per dimension. The map is not a decoration: it is the search index."
          right={
            <div className="scan-filters">
              {([
                ['all', 'All sites'],
                ['benchmark', 'Benchmarks'],
                ['surprise', 'Surprise picks'],
              ] as [FilterKey, string][]).map(([key, label]) => (
                <button
                  key={key}
                  className={`profile-tab ${filter === key ? 'active' : ''}`}
                  onClick={() => setFilter(key)}
                >
                  {key === 'all' ? <Filter size={11} style={{ marginRight: 7, verticalAlign: -1 }} /> : null}
                  {label}
                </button>
              ))}
            </div>
          }
        />

        <div className="scan-toolbar">
          <div className="scan-search">
            <Search size={13} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${data.sites.length} sites, countries, lithologies…`}
              aria-label="Search sites"
            />
          </div>
          <select className="scan-select" value={sortKey} onChange={(e) => setSortKey(e.target.value as any)} aria-label="Sort sites">
            <option value="ml">Sort / ML score</option>
            <option value="rule">Sort / rule score</option>
            <option value="access">Sort / field access</option>
            <option value="ground">Sort / shortest ground transfer</option>
          </select>
          <button className="btn" onClick={downloadCSV} style={{ height: 42, padding: '0 14px' }}>
            <Download size={13} /> CSV / {sites.length}
          </button>
        </div>

        <Reveal>
          <div className="scan-grid">
            <ScanMap sites={sites} campaign={campaign} selectedId={selectedId} profile={profile} onSelect={setSelectedId} />
            <div className="site-list">
              <div className="site-list-head">
                <div className="mono" style={{ color: 'var(--paper-faint)' }}>ML RANK / {profile.replace('_', ' ')}</div>
                <div className="mono" style={{ color: 'var(--cyan)' }}>{sites.length} SITES</div>
              </div>
              {sites.map((s, i) => {
                const score = mlScore(s, profile);
                return (
                  <motion.div
                    key={s.id}
                    className={`site-row ${selectedId === s.id ? 'active' : ''}`}
                    onClick={() => setSelectedId(s.id)}
                    initial={{ opacity: 0, x: 12 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4, delay: Math.min(i * 0.025, 0.4) }}
                  >
                    <div className="idx">{String(i + 1).padStart(2, '0')}</div>
                    <div>
                      <div className="nm">{s.name} {s.benchmark ? <span style={{ color: 'var(--amber)', fontSize: 8, fontFamily: 'var(--font-mono)' }}>◆</span> : null}</div>
                      <div className="ct">{s.country} / {s.type}</div>
                    </div>
                    <div className="sc">{score.toFixed(1)}</div>
                    <div className="bar"><i style={{ width: `${score}%` }} /></div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </Reveal>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, marginTop: 28, background: 'var(--line)', border: '1px solid var(--line)' }}>
          <div className="stat-cell">
            <div className="v">{String(data.sites.length).padStart(2, '0')}</div>
            <div className="k">Regions screened</div>
          </div>
          <div className="stat-cell">
            <div className="v">{data.campaigns[profile].sites.length}</div>
            <div className="k">Sites selected</div>
          </div>
          <div className="stat-cell">
            <div className="v">{data.profiles[profile].experiments.length}</div>
            <div className="k">Experiments assigned</div>
          </div>
        </div>
      </div>
    </section>
  );
}
