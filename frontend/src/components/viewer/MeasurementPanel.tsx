/**
 * MeasurementPanel.tsx — Dolphin-style right panel
 * Shows colour-coded measurement table with live highlighting
 */
import React, { useState } from 'react';
import { ChevronDown, ChevronRight, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Measurement, Diagnosis } from '@/types';

const T = {
  bg2: '#0e1219', bg3: '#121720', bg4: '#171e2a', bg5: '#1c2333',
  b1: 'rgba(255,255,255,0.06)', b2: 'rgba(255,255,255,0.11)',
  t0: '#f0f4ff', t1: 'rgba(200,215,240,0.85)',
  t2: 'rgba(150,170,210,0.60)', t3: 'rgba(100,120,165,0.45)',
  accent: '#0ea5e9', green: '#10b981', amber: '#f59e0b', red: '#ef4444',
} as const;

interface Props {
  measurements: Measurement[];
  diagnosis: Diagnosis | null;
  highlightCode: string | null;
  onHighlight: (code: string | null) => void;
}

function statusColor(s: string) {
  if (s === 'Normal') return T.green;
  if (s === 'Increased' || s === 'Decreased') return T.amber;
  return T.red;
}

function statusIcon(s: string) {
  if (s === 'Increased') return <TrendingUp size={11} />;
  if (s === 'Decreased') return <TrendingDown size={11} />;
  return <Minus size={11} />;
}

function GroupSection({ title, items, highlight, onHighlight }: {
  title: string;
  items: Measurement[];
  highlight: string | null;
  onHighlight: (c: string | null) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          width: '100%', padding: '7px 14px',
          background: T.bg4, border: 'none', borderBottom: `1px solid ${T.b1}`,
          color: T.t2, cursor: 'pointer', fontSize: 10,
          fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
        }}
      >
        {open ? <ChevronDown size={12}/> : <ChevronRight size={12}/>}
        {title}
        <span style={{
          marginLeft: 'auto', fontSize: 9, background: T.bg5,
          border: `1px solid ${T.b2}`, borderRadius: 4,
          padding: '1px 6px', color: T.t3,
        }}>
          {items.filter(m => m.status !== 'Normal').length > 0
            ? `${items.filter(m => m.status !== 'Normal').length} abnormal`
            : 'all normal'}
        </span>
      </button>
      {open && items.map(m => {
        const isHL = highlight === m.measurementCode;
        const sc = statusColor(m.status);
        return (
          <div
            key={m.id}
            onClick={() => onHighlight(isHL ? null : m.measurementCode)}
            style={{
              display: 'grid', gridTemplateColumns: '1fr auto auto',
              alignItems: 'center', gap: 8,
              padding: '6px 14px',
              background: isHL ? `${T.accent}0d` : 'transparent',
              borderBottom: `1px solid ${T.b1}`,
              borderLeft: isHL ? `2px solid ${T.accent}` : '2px solid transparent',
              cursor: 'pointer',
              transition: 'all 0.1s',
            }}
          >
            {/* Name */}
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: isHL ? T.t0 : T.t1 }}>
                {m.measurementName}
              </div>
              <div style={{ fontSize: 9, color: T.t3, fontFamily: 'monospace', marginTop: 1 }}>
                {m.measurementCode}
              </div>
            </div>

            {/* Normal range */}
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 9, color: T.t3 }}>norm</div>
              <div style={{ fontSize: 10, color: T.t2, fontFamily: 'monospace' }}>
                {m.normalMin}–{m.normalMax}{m.unit}
              </div>
            </div>

            {/* Value + status */}
            <div style={{ textAlign: 'right', minWidth: 52 }}>
              <div style={{
                fontSize: 13, fontWeight: 700, color: sc,
                fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums',
              }}>
                {Number(m.value).toFixed(1)}{m.unit}
              </div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 3,
                justifyContent: 'flex-end', marginTop: 1,
                fontSize: 9, color: sc, fontWeight: 700, textTransform: 'uppercase',
              }}>
                {statusIcon(m.status)}
                {m.status}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function MeasurementPanel({ measurements, diagnosis, highlightCode, onHighlight }: Props) {
  // Group by category
  const groups: Record<string, Measurement[]> = {};
  measurements.forEach(m => {
    const cat = m.category || 'General';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(m);
  });

  const abnormal = measurements.filter(m => m.status !== 'Normal').length;
  const total = measurements.length;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100%', background: T.bg2,
      borderLeft: `1px solid ${T.b1}`,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 14px', borderBottom: `1px solid ${T.b2}`,
        background: T.bg3, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: T.t0 }}>Measurements</span>
          <span style={{ fontSize: 10, color: T.t3 }}>{total} total</span>
          {abnormal > 0 && (
            <span style={{
              fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
              background: `${T.amber}18`, border: `1px solid ${T.amber}44`, color: T.amber,
            }}>
              {abnormal} abnormal
            </span>
          )}
        </div>

        {/* Overall bar */}
        <div style={{ marginTop: 8, height: 4, background: T.bg5, borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 2,
            background: abnormal === 0 ? T.green : abnormal > 3 ? T.red : T.amber,
            width: `${((total - abnormal) / Math.max(1, total)) * 100}%`,
            transition: 'width 0.5s',
          }} />
        </div>
        <div style={{ marginTop: 4, fontSize: 9, color: T.t3 }}>
          {total > 0 ? `${(((total - abnormal) / total) * 100).toFixed(0)}% within normal range` : 'No measurements'}
        </div>
      </div>

      {/* Scrollable table */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {Object.entries(groups).map(([cat, items]) => (
          <GroupSection
            key={cat} title={cat} items={items}
            highlight={highlightCode} onHighlight={onHighlight}
          />
        ))}
        {total === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: T.t3, fontSize: 12 }}>
            Run AI Detection to see measurements
          </div>
        )}
      </div>

      {/* Diagnosis summary */}
      {diagnosis && (
        <div style={{
          padding: '12px 14px', borderTop: `1px solid ${T.b2}`,
          background: T.bg3, flexShrink: 0,
        }}>
          <div style={{ fontSize: 9, color: T.t3, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 6 }}>
            AI Diagnosis
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[
              { label: diagnosis.skeletalClass.replace('Class','Cl.'), color: T.red },
              { label: diagnosis.verticalPattern, color: '#a78bfa' },
            ].map(tag => (
              <span key={tag.label} style={{
                fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 5,
                background: `${tag.color}14`, border: `1px solid ${tag.color}33`,
                color: tag.color,
              }}>
                {tag.label}
              </span>
            ))}
          </div>
          {diagnosis.summaryText && (
            <p style={{ marginTop: 8, fontSize: 10.5, color: T.t2, lineHeight: 1.5, margin: '8px 0 0' }}>
              {diagnosis.summaryText.length > 120
                ? diagnosis.summaryText.slice(0, 120) + '…'
                : diagnosis.summaryText}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
