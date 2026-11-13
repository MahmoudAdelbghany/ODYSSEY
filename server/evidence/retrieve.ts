/**
 * Full-source retrieval (completes the capability Earth-Location-Nasa lists as
 * not implemented). HTTPS only, allow-listed hosts only (including every
 * redirect hop), bounded size and time, HTML and PDF text extraction, and
 * bibliographic metadata from citation_* / Dublin Core tags.
 */
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SourceRow, Store } from '../store.ts';

export const ALLOWED_DOMAINS = [
  'nasa.gov',
  'esa.int',
  'usgs.gov',
  'jaxa.jp',
  'asc-csa.gc.ca',
  'nature.com',
  'science.org',
  'agupubs.onlinelibrary.wiley.com',
  'springer.com',
  'copernicus.org',
];

/** Extra hosts allowed for full-text retrieval only (open-access mirrors and DOI resolution). */
const RETRIEVAL_ONLY = ['doi.org', 'ncbi.nlm.nih.gov', 'europepmc.org', 'ebi.ac.uk', 'arxiv.org', 'iopscience.iop.org', 'sciencedirect.com', 'mdpi.com', 'frontiersin.org', 'hou.usra.edu', 'lpi.usra.edu'];

const MAX_BYTES = 15_000_000;
const MAX_TEXT = 400_000;

export function hostAllowed(url: string, extra: string[] = []): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return false;
    const host = u.hostname.toLowerCase().replace(/\.$/, '');
    return [...ALLOWED_DOMAINS, ...RETRIEVAL_ONLY, ...extra].some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

export class RetrievalError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
  }
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '\u2014', deg: '°', plusmn: '±', micro: 'µ', times: '×', minus: '−', sup2: '²', sup3: '³', thinsp: ' ', ensp: ' ', emsp: ' ' };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, (match, code: string) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|nav|footer|header|form)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr|\/section|\/table)[^>]*>/gi, '\n')
      .replace(/<sup>([^<]{1,4})<\/sup>/gi, '^$1')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

function meta(html: string, names: string[]): string | null {
  for (const name of names) {
    const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name.replace('.', '\\.')}["'][^>]*content=["']([^"']+)["']`, 'i');
    const alt = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:name|property)=["']${name.replace('.', '\\.')}["']`, 'i');
    const found = html.match(re)?.[1] ?? html.match(alt)?.[1];
    if (found) return decodeEntities(found).trim();
  }
  return null;
}

async function pdfToText(bytes: Uint8Array): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'odyssey-pdf-'));
  try {
    const file = join(dir, 'source.pdf');
    await writeFile(file, bytes);
    return await new Promise((resolve, reject) => {
      execFile('pdftotext', ['-layout', '-l', '60', file, '-'], { timeout: 30_000, maxBuffer: 20_000_000 }, (error, stdout) => {
        if (error) reject(new RetrievalError('PDF text extraction failed', 'pdf_extract'));
        else resolve(stdout);
      });
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function retrieveSource(url: string, store: Store, signal?: AbortSignal, maxAgeDays = 30): Promise<SourceRow & { cached: boolean }> {
  if (!hostAllowed(url)) throw new RetrievalError(`Host not allowed for retrieval: ${new URL(url).hostname}`, 'host_not_allowed');
  const cached = store.getSource(url);
  if (cached && Date.now() - Date.parse(cached.retrievedAt) < maxAgeDays * 86_400_000) return { ...cached, cached: true };

  let current = url;
  let response: Response | null = null;
  for (let hop = 0; hop < 4; hop += 1) {
    const timeout = AbortSignal.timeout(25_000);
    response = await fetch(current, {
      redirect: 'manual',
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      headers: { 'user-agent': 'odyssey-evidence-verifier/1.0 (+source verification; respects robots via allow-list)', accept: 'text/html,application/pdf,text/plain;q=0.9,*/*;q=0.5' },
    });
    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
      const next = new URL(response.headers.get('location')!, current).toString();
      if (!hostAllowed(next)) throw new RetrievalError(`Redirect to a non-allowed host: ${new URL(next).hostname}`, 'redirect_blocked');
      current = next;
      continue;
    }
    break;
  }
  if (!response) throw new RetrievalError('No response', 'no_response');
  if (!response.ok) throw new RetrievalError(`HTTP ${response.status}`, response.status === 403 ? 'blocked' : 'http_error');
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > MAX_BYTES) throw new RetrievalError('Source exceeds the size limit', 'too_large');
  const buffer = new Uint8Array(await response.arrayBuffer());
  if (buffer.byteLength > MAX_BYTES) throw new RetrievalError('Source exceeds the size limit', 'too_large');
  const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
  let text: string;
  let title: string | null = null;
  let published: string | null = null;
  let doi: string | null = null;
  if (contentType.includes('pdf') || current.toLowerCase().endsWith('.pdf')) {
    text = await pdfToText(buffer);
  } else if (contentType.includes('html') || contentType.includes('xml') || contentType.startsWith('text/')) {
    const html = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
    if (contentType.includes('html')) {
      title = meta(html, ['citation_title', 'dc.title', 'og:title']) ?? decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? '') ?? null;
      published = meta(html, ['citation_publication_date', 'citation_date', 'citation_online_date', 'dc.date', 'article:published_time', 'dcterms.date']);
      doi = meta(html, ['citation_doi', 'dc.identifier', 'prism.doi']);
      text = htmlToText(html);
    } else {
      text = html;
    }
  } else {
    throw new RetrievalError(`Unsupported content type: ${contentType || 'unknown'}`, 'unsupported_type');
  }
  if (text.length < 200) throw new RetrievalError('Retrieved source has too little text (paywall, script-rendered page, or abstract-only)', 'too_little_text');
  const row: SourceRow = {
    url,
    sha256: createHash('sha256').update(buffer).digest('hex'),
    retrievedAt: new Date().toISOString(),
    status: response.status,
    contentType: contentType || 'unknown',
    title: title || null,
    publishedDate: published,
    doi: doi?.replace(/^doi:\s*/i, '') ?? null,
    text: text.toWellFormed().slice(0, MAX_TEXT),
    bytes: buffer.byteLength,
  };
  store.putSource(row);
  return { ...row, cached: false };
}
