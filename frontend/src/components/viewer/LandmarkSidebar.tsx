/**
 * LandmarkSidebar.tsx — Left panel: tool layers + landmark list
 */
import React, { useState } from 'react';
import {
  Search, Filter, ArrowUpDown, Lock, Unlock,
  Eye, EyeOff, ChevronDown, ChevronRight,
} from 'lucide-react';
import { Landmark } from '@/types';

const T = {
  bg2: '#0e1219', bg3: '#121720', bg4: '#171e2a', bg5: '#1c2333',
  b1: 'rgba(255,255,255,0.06)', b2: 'rgba(255,255,255,0.11)',
  t0: '#f0f4ff', t1: 'rgba(200,215,240,0.85)',
  t2: 'rgba(150,170,210,0.60)', t3: 'rgba(100,120,165,0.45)',
  accent: '#0ea5e9', green: '#10b981', amber: '#f59e0b', red: '#ef4444',
} as const;

function confColor(s?: number) {
  return s == null ? T.t3 : s >= 0.8 ? T.green : s >= 0.6 ? T.amber : T.red;
}
function confLabel(s?: number) {
  return s == null ? '—' : s >= 0.8 ? 'HIGH' : s >= 0.6 ? 'MID' : 'LOW';
}

interface Props {
  landmarks: Landmark[];
  selected: string | null;
  onSelect: (code: string | null) => void;
}

type Filter = 'all' | 'high' | 'mid' | 'low';
type Sort = 'code' | 'conf';

export default function LandmarkSidebar({ landmarks, selected, onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('code');
  const [statsOpen, setStatsOpen] = useState(true);

  const high = landmarks.filter(l => (l.confidenceScore ?? 0) >= 0.8).length;
  const mid  = landmarks.filter(l => { const s = l.confidenceScore ?? 1; return s >= 0.6 && s < 0.8; }).length;
  const low  = landmarks.filter(l => (l.confidenceScore ?? 1) < 0.6).length;

  const filtered = landmarks
    .filter(l => {
      const s = l.confidenceScore ?? -1;
      if (filter === 'high') return s >= 0.8;
      if (filter === 'mid')  return s >= 0.6 && s < 0.8;
      if (filter === 'low')  return s < 0.6;
      return true;
    })
    .filter(l => {
      if (!query) return true;
      const q = query.toLowerCase();
      return l.landmarkCode.toLowerCase().includes(q) || (l.landmarkName ?? '').toLowerCase().includes(q);
    })
    .sort((a, b) => sort === 'conf'
      ? (b.confidenceScore ?? 0) - (a.confidenceScore ?? 0)
      : a.landmarkCode.localeCompare(b.landmarkCode)
    );

  const avgConf = landmarks.length
    ? landmarks.reduce((acc, l) => acc + (l.confidenceScore ?? 0), 0) / landmarks.length
    : 0;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: T.bg2, borderRight: `1px solid ${T.b1}`, overflow: 'hidden',
      minWidth: 220,
    }}>
      {/* Stats */}
      <div style={{ padding: '10px 12px', borderBottom: `1px solid ${T.b1}`, background: T.bg3 }}>
        <button
          onClick={() => setStatsOpen(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            width: '100%', background: 'none', border: 'none',
            color: T.t2, cursor: 'pointer', fontSize: 9.5,
            fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
            padding: 0, marginBottom: statsOpen ? 8 : 0,
          }}
        >
          {statsOpen ? <ChevronDown size={11}/> : <ChevronRight size={11}/>}
          LANDMARKS · {landmarks.length}
        </button>

        {statsOpen && (
          <>
            <div style={{ height: 4, background: T.bg5, borderRadius: 2, overflow: 'hidden', marginBottom: 6 }}>
              <div style={{
                height: '100%', borderRadius: 2, background: T.accent,
                width: `${avgConf * 100}%`, transition: 'width 0.5s',
              }}/>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {[
                { label: 'HIGH', count: high, color: T.green },
                { label: 'MID',  count: mid,  color: T.amber },
                { label: 'LOW',  count: low,  color: T.red },
              ].map(s => (
                <button
                  key={s.label}
                  onClick={() => setFilter(f => f === s.label.toLowerCase() as Filter ? 'all' : s.label.toLowerCase() as Filter)}
                  style={{
                    flex: 1, padding: '4px 0', borderRadius: 5,
                    background: `${s.color}12`, border: `1px solid ${s.color}30`,
                    color: s.color, fontSize: 9, fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  {s.count} {s.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Search + sort */}
      <div style={{ padding: '8px 10px', borderBottom: `1px solid ${T.b1}`, display: 'flex', gap: 6 }}>
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', gap: 6,
          background: T.bg4, border: `1px solid ${T.b2}`, borderRadius: 6,
          padding: '4px 8px',
        }}>
          <Search size={11} color={T.t3} />
          <input
            value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search…"
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              color: T.t0, fontSize: 11,
            }}
          />
        </div>
        <button
          onClick={() => setSort(s => s === 'code' ? 'conf' : 'code')}
          title={sort === 'code' ? 'Sort by confidence' : 'Sort by code'}
          style={{
            width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: T.bg4, border: `1px solid ${T.b2}`, borderRadius: 6,
            color: T.t2, cursor: 'pointer',
          }}
        >
          <ArrowUpDown size={12}/>
        </button>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filtered.map(lm => {
          const isSel = selected === lm.landmarkCode;
          const color = confColor(lm.confidenceScore ?? undefined);
          return (
            <div
              key={lm.id}
              onClick={() => onSelect(isSel ? null : lm.landmarkCode)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '7px 12px',
                background: isSel ? `${T.accent}0d` : 'transparent',
                borderBottom: `1px solid ${T.b1}`,
                borderLeft: isSel ? `2px solid ${T.accent}` : '2px solid transparent',
                cursor: 'pointer', transition: 'all 0.1s',
              }}
            >
              {/* Confidence dot */}
              <div style={{
                width: 7, height: 7, borderRadius: '50%',
                background: color, flexShrink: 0,
                boxShadow: `0 0 6px ${color}60`,
              }}/>

              {/* Code + name */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 11, fontWeight: 700, color: isSel ? T.t0 : T.t1,
                  fontFamily: 'monospace',
                }}>
                  {lm.landmarkCode}
                </div>
                {lm.landmarkName && (
                  <div style={{
                    fontSize: 9.5, color: T.t3, marginTop: 1,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {lm.landmarkName}
                  </div>
                )}
              </div>

              {/* Confidence */}
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color, fontFamily: 'monospace' }}>
                  {lm.confidenceScore != null ? `${(lm.confidenceScore * 100).toFixed(0)}%` : '—'}
                </div>
                <div style={{ fontSize: 8.5, color, fontWeight: 700, textTransform: 'uppercase' }}>
                  {confLabel(lm.confidenceScore ?? undefined)}
                </div>
              </div>

              {/* Adjust indicator */}
              {lm.isManuallyAdjusted && (
                <div title="Manually adjusted" style={{ color: T.amber, flexShrink: 0 }}>
                  <Lock size={10}/>
                </div>
              )}
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: T.t3, fontSize: 11 }}>
            {landmarks.length === 0
              ? 'Run AI Detection to detect landmarks'
              : 'No landmarks match filter'}
          </div>
        )}
      </div>

      {/* Footer: coords */}
      <div style={{
        padding: '8px 12px', borderTop: `1px solid ${T.b1}`,
        background: T.bg3, flexShrink: 0,
      }}>
        {selected ? (() => {
          const lm = landmarks.find(l => l.landmarkCode === selected);
          if (!lm) return null;
          return (
            <div>
              <div style={{ fontSize: 9, color: T.t3, textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>
                Selected: {lm.landmarkCode}
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 9, color: T.t3 }}>X</div>
                  <div style={{ fontSize: 11, color: T.accent, fontFamily: 'monospace', fontWeight: 700 }}>
                    {lm.xPx.toFixed(1)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 9, color: T.t3 }}>Y</div>
                  <div style={{ fontSize: 11, color: T.accent, fontFamily: 'monospace', fontWeight: 700 }}>
                    {lm.yPx.toFixed(1)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 9, color: T.t3 }}>CONF</div>
                  <div style={{ fontSize: 11, color: confColor(lm.confidenceScore ?? undefined), fontFamily: 'monospace', fontWeight: 700 }}>
                    {lm.confidenceScore != null ? `${(lm.confidenceScore * 100).toFixed(0)}%` : '—'}
                  </div>
                </div>
              </div>
            </div>
          );
        })() : (
          <div style={{ fontSize: 10, color: T.t3 }}>Click a landmark to inspect</div>
        )}
      </div>
    </div>
  );
}
