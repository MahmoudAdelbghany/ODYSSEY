import { useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Bot, CornerDownLeft, SlidersHorizontal, Sparkles, TriangleAlert } from 'lucide-react';
import {
  PROFILE_ORDER,
  PROFILE_WEIGHTS,
  mlScore,
  type Dimensions,
  type OdysseyData,
  type ProfileKey,
} from '../types';
import { Reveal } from './Reveal';
import { SectionHead } from './SectionHead';

type AgentResult = {
  profile: ProfileKey;
  headline: string;
  summary: string;
  weights?: Partial<Record<keyof Dimensions, number>>;
  sites?: { name: string; why: string; window?: string }[];
  suggestions?: string[];
  risks?: string[];
  travel_note?: string;
};

const EXAMPLES = [
  'Plan a 10-day lunar south pole campaign focused on water ice, regolith construction and thermal survival.',
  'Find the best Mars analog for dusty rover operations and sample return. I have a $20k travel budget.',
  'I have 14 days. Build the tightest multi-site campaign for a lunar surface expedition.',
];

function parseJSON(text: string): any {
  const clean = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('No JSON object in response');
  return JSON.parse(clean.slice(start, end + 1));
}

function normalizeProfile(p: any): ProfileKey {
  return p === 'mars_landing' || p === 'expedition' || p === 'lunar_base' ? p : 'lunar_base';
}

export function Agent({ data, onApply, onApplyWeights }: { data: OdysseyData; onApply: (p: ProfileKey) => void; onApplyWeights: (w: Partial<Record<keyof Dimensions, number>>, p: ProfileKey) => void }) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AgentResult | null>(null);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'llm' | 'fallback'>('llm');
  const [thread, setThread] = useState<{ role: 'user' | 'assistant'; text: string }[]>([]);
  const [followUp, setFollowUp] = useState('');
  const [followLoading, setFollowLoading] = useState(false);
  const conversationRef = useRef<{ role: string; content: string }[]>([]);

  const context = useMemo(() => {
    const lines: string[] = [];
    for (const p of PROFILE_ORDER) {
      const top = [...data.sites].sort((a, b) => mlScore(b, p) - mlScore(a, p)).slice(0, 4);
      lines.push(`${data.profiles[p].short}:`);
      for (const s of top) {
        lines.push(`- ${s.name} (${s.country}) ${s.type}; ML ${mlScore(s, p).toFixed(1)}; windows ${s.windows[p].join('–')}`);
      }
    }
    return lines.join('\n');
  }, [data]);

  const fallback = (reason: string) => {
    const lower = prompt.toLowerCase();
    const profile: ProfileKey = lower.includes('mars')
      ? 'mars_landing'
      : lower.includes('expedition') || lower.includes('14 days')
        ? 'expedition'
        : 'lunar_base';
    const c = data.campaigns[profile];
    const res: AgentResult = {
      profile,
      headline: 'Deterministic campaign recommendation',
      summary: c.summary,
      weights: PROFILE_WEIGHTS[profile],
      sites: c.assignments.map((a) => ({
        name: a.site,
        why: `${a.experiment} · fit ${a.fit.toFixed(0)} · ML ${a.score.toFixed(1)} · ${a.window.join('–')}`,
        window: a.window.join('–'),
      })),
      suggestions: [
        'Use the campaign order as the baseline; re-rank only if a site fails the field review.',
        'Add a facility-only block for gravity, pressure and radiation before deployment.',
        'Keep 2 contingency days for weather and transport slips.',
      ],
      risks: [
        'Climate is a reanalysis grid, not a local weather station.',
        'Geology is a Macrostrat map unit, not an in-situ assay.',
      ],
      travel_note: `Estimated ${c.travelHours.toFixed(1)} h travel and $${c.travelCost.toLocaleString()} for the current route.`,
    };
    setResult(res);
    setMode('fallback');
    setError(reason);
    setThread([]);
    conversationRef.current = [
      { role: 'system', content: 'Odyssey deterministic fallback' },
      { role: 'assistant', content: res.summary },
    ];
  };

  const run = async () => {
    const brief = prompt.trim() || EXAMPLES[0];
    setLoading(true);
    setResult(null);
    setError('');
    setMode('llm');
    setThread([]);
    conversationRef.current = [];
    const system = `You are Odyssey, a planetary analog mission architect for NASA Space Apps 2026.
Return STRICT JSON only, no markdown, with this shape:
{"profile":"lunar_base|mars_landing|expedition","headline":"...","summary":"...","weights":{"thermal":0,"aridity":0,"terrain":0,"geology":0,"dust":0,"access":0},"sites":[{"name":"...","why":"...","window":"..."}],"suggestions":["..."],"risks":["..."],"travel_note":"..."}
Use only site names from the context. Weights must sum to about 100. Give 2-3 sites max, 3 suggestions, 2 risks. Be specific, scientific and concise.`;
    const user = `Mission brief: ${brief}

Available sites and ML scores:
${context}

Return the JSON now.`;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 60000);
    try {
      const r = await fetch('https://text.pollinations.ai/openai', {
        signal: controller.signal,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'openai',
          temperature: 0.35,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      });
      if (!r.ok) throw new Error(`Agent HTTP ${r.status}`);
      const j = await r.json();
      const text = j?.choices?.[0]?.message?.content ?? '';
      const parsed = parseJSON(text);
      const res: AgentResult = {
        profile: normalizeProfile(parsed.profile),
        headline: String(parsed.headline || 'Mission recommendation'),
        summary: String(parsed.summary || ''),
        weights: parsed.weights,
        sites: Array.isArray(parsed.sites)
          ? parsed.sites
              .filter((s: any) => data.sites.some((d) => d.name.toLowerCase() === String(s?.name || '').toLowerCase()))
              .slice(0, 3)
          : [],
        suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 5) : [],
        risks: Array.isArray(parsed.risks) ? parsed.risks.slice(0, 3) : [],
        travel_note: parsed.travel_note ? String(parsed.travel_note) : '',
      };
      if (!res.summary) throw new Error('Empty agent response');
      setResult(res);
      conversationRef.current = [
        { role: 'system', content: system },
        { role: 'user', content: user },
        { role: 'assistant', content: text },
      ];
    } catch (e: any) {
      fallback(e?.message || 'Agent unavailable, deterministic fallback used.');
    } finally {
      window.clearTimeout(timer);
      setLoading(false);
    }
  };

  const askFollowUp = async () => {
    const q = followUp.trim();
    if (!q || !result || followLoading) return;
    setFollowUp('');
    setThread((t) => [...t, { role: 'user', text: q }]);
    setFollowLoading(true);
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 45000);
    try {
      const messages = [
        ...conversationRef.current,
        {
          role: 'user',
          content: `Context:\n${context}\n\nFollow-up question: ${q}\nAnswer in 2-4 sentences, specific to the sites, weights, risks and campaign above.`,
        },
      ];
      const r = await fetch('https://text.pollinations.ai/openai', {
        signal: controller.signal,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'openai', temperature: 0.4, messages }),
      });
      if (!r.ok) throw new Error(`Agent HTTP ${r.status}`);
      const j = await r.json();
      const answer = j?.choices?.[0]?.message?.content?.trim();
      if (!answer) throw new Error('Empty follow-up');
      setThread((t) => [...t, { role: 'assistant', text: answer }]);
      conversationRef.current.push({ role: 'user', content: `Follow-up: ${q}` });
      conversationRef.current.push({ role: 'assistant', content: answer });
    } catch {
      setThread((t) => [...t, { role: 'assistant', text: 'The agent is offline. The deterministic campaign above still applies; use the Travel and Model sections to check the trade-offs.' }]);
    } finally {
      window.clearTimeout(timer);
      setFollowLoading(false);
    }
  };

  const weights = result?.weights
    ? (Object.keys(result.weights) as (keyof Dimensions)[]).filter((k) => typeof result.weights![k] === 'number')
    : [];

  return (
    <section className="section" id="agent" style={{ paddingTop: 40 }}>
      <div className="container">
        <SectionHead
          index="03"
          label="AGENT"
          title={<>MEET THE<br />MISSION ARCHITECT.</>}
          lead="Ask in plain language. The agent decomposes the brief, weighs the environmental requirements, and recommends a campaign. Free LLM, no key, with a deterministic fallback if the network fails."
          right={
            <div className="agent-status">
              <span className="dot" /> AGENT ONLINE
              <span className="mono" style={{ color: 'var(--paper-faint)', marginLeft: 10 }}>POLLINATIONS / GPT-OSS-20B</span>
            </div>
          }
        />

        <div className="agent-grid">
          <Reveal>
            <div className="agent-console">
              <div className="agent-console-head">
                <div className="terminal-dots"><i /><i /><i /></div>
                <div className="mono" style={{ color: 'var(--paper-faint)' }}>ODYSSEY / MISSION ARCHITECT</div>
                <div className="mono" style={{ color: 'var(--green)' }}>● FREE LLM</div>
              </div>
              <div className="agent-prompt-label mono">DESCRIBE THE MISSION</div>
              <textarea
                className="agent-textarea"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Plan a lunar south pole campaign focused on water ice, regolith construction and thermal survival..."
                rows={5}
              />
              <div className="agent-examples">
                {EXAMPLES.map((e) => (
                  <button key={e} className="agent-example" onClick={() => setPrompt(e)}>
                    <CornerDownLeft size={10} /> {e}
                  </button>
                ))}
              </div>
              <div className="agent-actions">
                <button className="btn btn-primary" onClick={run} disabled={loading}>
                  {loading ? 'Decomposing…' : 'Deploy agent'} <ArrowRight size={14} className="arrow" />
                </button>
                <div className="mono" style={{ color: 'var(--paper-faint)' }}>
                  NO KEY / PUBLIC ENDPOINT / 30–60S
                </div>
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="agent-response">
              <div className="agent-response-head">
                <div className="mono" style={{ color: 'var(--paper-faint)' }}>AGENT OUTPUT / STRUCTURED</div>
                <div className="mono" style={{ color: mode === 'llm' ? 'var(--green)' : 'var(--amber)' }}>
                  {mode === 'llm' ? '● LLM' : '● FALLBACK'}
                </div>
              </div>

              {loading ? (
                <div className="agent-thinking">
                  <div className="agent-orb" />
                  <div>
                    <div className="mono" style={{ color: 'var(--cyan)' }}>DECOMPOSING MISSION</div>
                    <div className="agent-think-line">Reading the brief…</div>
                    <div className="agent-think-line">Weighting six environmental dimensions…</div>
                    <div className="agent-think-line">Ranking 34 candidate regions…</div>
                  </div>
                </div>
              ) : result ? (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
                  <div className="agent-headline">{result.headline}</div>
                  <div className="agent-summary">{result.summary}</div>

                  <div className="agent-profile-row">
                    <div className="chip green"><span className="dot" /> {data.profiles[result.profile].name}</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {result.weights ? (
                        <button className="agent-apply" onClick={() => onApplyWeights(result.weights!, result.profile)}>
                          <SlidersHorizontal size={11} /> APPLY WEIGHTS
                        </button>
                      ) : null}
                      <button className="agent-apply" onClick={() => onApply(result.profile)}>
                        APPLY PROFILE <ArrowRight size={11} />
                      </button>
                    </div>
                  </div>

                  {weights.length ? (
                    <div className="agent-weights">
                      {weights.map((k) => {
                        const v = result.weights?.[k] ?? 0;
                        return (
                          <div className="agent-weight" key={k}>
                            <div className="agent-weight-top"><span>{k}</span><b>{v}%</b></div>
                            <div className="agent-weight-bar"><i style={{ width: `${Math.min(100, v)}%` }} /></div>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}

                  {result.sites?.length ? (
                    <div className="agent-sites">
                      <div className="mono" style={{ color: 'var(--paper-faint)' }}>RECOMMENDED SITES</div>
                      {result.sites.map((s, i) => (
                        <div className="agent-site" key={`${s.name}-${i}`}>
                          <div className="agent-site-num">0{i + 1}</div>
                          <div>
                            <div className="agent-site-name">{s.name}</div>
                            <div className="agent-site-why">{s.why}</div>
                          </div>
                          {s.window ? <div className="agent-site-window">{s.window}</div> : null}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {result.suggestions?.length ? (
                    <div className="agent-list">
                      <div className="mono" style={{ color: 'var(--cyan)' }}>SUGGESTIONS</div>
                      {result.suggestions.map((s) => <div className="agent-list-item" key={s}><span>→</span>{s}</div>)}
                    </div>
                  ) : null}

                  {result.risks?.length ? (
                    <div className="agent-list">
                      <div className="mono" style={{ color: 'var(--amber)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <TriangleAlert size={11} /> RISKS
                      </div>
                      {result.risks.map((s) => <div className="agent-list-item" key={s}><span>!</span>{s}</div>)}
                    </div>
                  ) : null}

                  {result.travel_note ? (
                    <div className="agent-travel-note">{result.travel_note}</div>
                  ) : null}

                  <div className="agent-thread">
                    {thread.map((m, i) => (
                      <div className={`agent-msg ${m.role}`} key={`${m.role}-${i}`}>
                        <span>{m.role === 'user' ? 'YOU' : 'ODYSSEY'}</span>
                        <p>{m.text}</p>
                      </div>
                    ))}
                    <div className="agent-followup">
                      <input
                        value={followUp}
                        onChange={(e) => setFollowUp(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') askFollowUp(); }}
                        placeholder="Ask a follow-up, why this route, what breaks, what next?"
                        aria-label="Follow-up question"
                      />
                      <button onClick={askFollowUp} disabled={followLoading}>
                        {followLoading ? '…' : 'ASK'}
                      </button>
                    </div>
                  </div>

                  {error ? <div className="agent-error">{error}</div> : null}
                </motion.div>
              ) : (
                <div className="agent-standby">
                  <div className="agent-orb" />
                  <div className="agent-standby-title">AWAITING MISSION BRIEF</div>
                  <div className="agent-standby-text">
                    The agent will return a profile, a weighted requirement set, a site shortlist,
                    field suggestions and the risks it cannot solve on Earth.
                  </div>
                  <div className="agent-standby-grid">
                    <div><Sparkles size={14} /><span>decompose</span></div>
                    <div><Bot size={14} /><span>reason</span></div>
                    <div><ArrowRight size={14} /><span>recommend</span></div>
                  </div>
                </div>
              )}
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
