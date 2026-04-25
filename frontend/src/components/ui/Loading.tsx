import { Loader2 } from 'lucide-react';

interface SpinnerProps { size?: number; className?: string; }
export function Spinner({ size = 20, className }: SpinnerProps) {
  return <Loader2 size={size} className={`animate-spin${className ? ' ' + className : ''}`} style={{ color: 'var(--accent)' }} />;
}

interface SkeletonProps { width?: string; height?: string; className?: string; style?: React.CSSProperties; }
export function Skeleton({ width = '100%', height = '20px', className, style }: SkeletonProps) {
  return <div className={`skeleton${className ? ' ' + className : ''}`} style={{ width, height, ...style }} />;
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="table-container">
      <table className="table">
        <thead>
          <tr>{Array.from({length: cols}).map((_,i) => <th key={i}><Skeleton height="14px" width="80px" /></th>)}</tr>
        </thead>
        <tbody>
          {Array.from({length: rows}).map((_,r) => (
            <tr key={r}>{Array.from({length:cols}).map((_,c) => <td key={c}><Skeleton height="16px" /></td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  desc?: string;
  action?: React.ReactNode;
}
import React from 'react';
export function EmptyState({ icon, title, desc, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">{icon}</div>
      <div>
        <div className="empty-state-title">{title}</div>
        {desc && <div className="empty-state-desc">{desc}</div>}
      </div>
      {action}
    </div>
  );
}
