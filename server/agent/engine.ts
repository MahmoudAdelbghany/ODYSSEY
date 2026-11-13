/** Deterministic engine cache. Matrices are recomputed from state, never trusted from the LLM. */
import { evaluateMission, type MissionMatrix } from '../../src/mission/index.ts';
import { evaluateTemporal, type TemporalMatrix } from '../../src/temporal/index.ts';
import { SITES, siteMonthly, siteTerrain } from '../science/data.ts';
import { planetaryProfile, type EnvironmentalProfile } from '../science/profile.ts';
import type { AgentState } from './state.ts';

const cache = new Map<string, { key: string; matrix: MissionMatrix; temporal: TemporalMatrix }>();

export function matrices(state: AgentState) {
  if (!state.mission) throw new ToolPrecondition('Mission has not been decomposed yet. Call decompose_experiments first.');
  const key = JSON.stringify([state.mission.experiments.map((e) => [e.id, e.requirements.length]), state.temporalConfig]);
  const hit = cache.get(state.runId);
  if (hit && hit.key === key) return hit;
  const matrix = evaluateMission(state.mission, SITES, siteTerrain.sites);
  const temporal = evaluateTemporal(state.mission, SITES, siteMonthly.sites, siteTerrain.sites, state.temporalConfig);
  const entry = { key, matrix, temporal };
  cache.set(state.runId, entry);
  return entry;
}

export function dropCache(runId: string) {
  cache.delete(runId);
}

export function targetProfile(state: AgentState): EnvironmentalProfile {
  if (!state.parsed) throw new ToolPrecondition('Mission has not been parsed yet. Call parse_mission first.');
  if (!state.parsed.target) throw new ToolPrecondition('The planetary target is unresolved; ODYSSEY holds verified references only for the lunar south pole and Mars/Jezero.');
  return planetaryProfile(state.parsed.target);
}

export class ToolPrecondition extends Error {}
