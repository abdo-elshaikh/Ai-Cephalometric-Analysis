import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Move, HelpCircle, Save, Ruler, Target, Info, Activity } from 'lucide-react';
import api from '../api/api';
import toast from 'react-hot-toast';
import XrayViewer from '../components/XrayViewer';
import { toPublicUrl } from '../utils/publicUrl';

export default function CalibrationPage() {
  const { studyId, imageId } = useParams();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);

  const [points, setPoints] = useState<{x: number, y: number}[]>([]);
  const [knownDistance, setKnownDistance] = useState("10"); // mm
  const [imageUrl, setImageUrl] = useState<string>('');

  useEffect(() => {
    fetchImage();
  }, [studyId, imageId]);

  const fetchImage = async () => {
    try {
      const res = await api.get(`/images/study/${studyId}`);
      const img = res.data.find((i: any) => i.id === imageId);
      if (img) setImageUrl(toPublicUrl(img.storageUrl));
    } catch (e) {
      toast.error('Failed to load image');
    }
  };

  // Calculated Stats
  const stats = useMemo(() => {
    if (points.length < 2) return null;
    const dx = points[1].x - points[0].x;
    const dy = points[1].y - points[0].y;
    const pixels = Math.sqrt(dx * dx + dy * dy);
    const mm = parseFloat(knownDistance) || 0;
    const spacing = mm > 0 ? mm / pixels : 0;
    return { pixels, spacing };
  }, [points, knownDistance]);

  const handleCanvasClick = (x: number, y: number) => {
    setPoints((prev) => {
      if (prev.length === 0) return [{ x, y }];
      if (prev.length === 1) return [...prev, { x, y }];
      return [prev[0], { x, y }];
    });
  };

  const handlePointMove = (idx: number, newX: number, newY: number) => {
    setPoints((prev) => {
      const next = [...prev];
      next[idx] = { x: newX, y: newY };
      return next;
    });
  };

  const handleSave = async () => {
    if (points.length !== 2) {
      toast.error('Please place exactly 2 points');
      return;
    }
    setSaving(true);
    try {
      await api.post(`/images/${imageId}/calibrate`, {
        point1: points[0],
        point2: points[1],
        knownDistanceMm: parseFloat(knownDistance)
      });
      toast.success('Image calibrated successfully');
      navigate(-1);
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Calibration failed');
    }
    setSaving(false);
  };

  const presets = [10, 50, 100];

  return (
    <div className="page-container" style={{ display: 'flex', flexDirection: 'column', height: '100vh', padding: 0 }}>
      {/* Header */}
      <header className="page-header" style={{ padding: '20px 30px', margin: 0, borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg)', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
          <button className="btn btn-ghost" onClick={() => navigate(-1)} style={{ padding: '8px' }}>
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="page-title" style={{ fontSize: '1.2rem' }}>Scale Calibration</h1>
            <p className="page-subtitle" style={{ fontSize: '0.8rem' }}>Establish anatomical scale for measurements</p>
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Actual Distance (mm)</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input 
                type="number" 
                value={knownDistance} 
                onChange={e => setKnownDistance(e.target.value)}
                style={{ width: 80, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border)', color: 'white', padding: '6px 10px', borderRadius: 6 }}
              />
              <div style={{ display: 'flex', gap: 4 }}>
                {presets.map(p => (
                  <button 
                    key={p} 
                    onClick={() => setKnownDistance(p.toString())}
                    style={{ 
                      padding: '0 8px', borderRadius: 6, fontSize: '0.75rem', border: '1px solid var(--color-border)',
                      background: knownDistance === p.toString() ? 'var(--color-brand)' : 'transparent',
                      color: knownDistance === p.toString() ? 'white' : 'var(--color-text-muted)',
                      cursor: 'pointer'
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button className="btn btn-primary" onClick={handleSave} disabled={points.length !== 2 || saving} style={{ height: 42 }}>
            <Save size={16} /> {saving ? 'Saving...' : 'Confirm Calibration'}
          </button>
        </div>
      </header>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Sidebar Dashboard */}
        <div style={{ width: 300, borderRight: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface, #0f172a)', display: 'flex', flexDirection: 'column' }}>
          
          {/* Live Data Card */}
          <div style={{ padding: 20, borderBottom: '1px solid var(--color-border)' }}>
            <h3 style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Activity size={14} /> Live Precision Stats
            </h3>
            <div style={{ display: 'grid', gap: 15 }}>
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 10, border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginBottom: 4 }}>Pixel Distance</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 700, fontFamily: 'monospace' }}>
                   {stats ? stats.pixels.toFixed(2) : '--'} <span style={{ fontSize: '0.8rem', fontWeight: 400, opacity: 0.5 }}>px</span>
                </div>
              </div>
              <div style={{ background: 'rgba(99,120,255,0.05)', padding: 12, borderRadius: 10, border: '1px solid rgba(99,120,255,0.1)' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--color-brand)', marginBottom: 4 }}>Calculated Resolution</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--color-brand)' }}>
                   {stats ? stats.spacing.toFixed(4) : '--'} <span style={{ fontSize: '0.8rem', fontWeight: 400, opacity: 0.5 }}>mm/px</span>
                </div>
              </div>
            </div>
          </div>

          {/* Instructions */}
          <div style={{ padding: 20, flex: 1, overflowY: 'auto' }}>
            <h3 style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Info size={14} /> Procedure
            </h3>
            <div style={{ display: 'grid', gap: 20 }}>
              <Step num={1} text="Locate the physical ruler visible on the X-Ray image." />
              <Step num={2} text="Click the start point of the known distance." />
              <Step num={3} text="Click the end point or drag the markers for high precision." />
              <div style={{ padding: 12, background: 'rgba(245,158,11,0.05)', borderRadius: 8, border: '1px solid rgba(245,158,11,0.1)' }}>
                <div style={{ display: 'flex', gap: 10 }}>
                   <Target size={18} color="#f59e0b" style={{ flexShrink: 0 }} />
                   <p style={{ fontSize: '0.75rem', color: 'rgba(245,158,11,0.9)', lineHeight: 1.4 }}>
                     <strong>Pro-Tip:</strong> Use the Magnifier Loupe while dragging to align precisely with the ruler markings!
                   </p>
                </div>
              </div>
            </div>
            
            <div style={{ marginTop: 30 }}>
              <h3 style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Move size={14} /> Navigation
              </h3>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'grid', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Zoom</span> <span style={{ color: 'white' }}>Mouse Wheel</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Pan</span> <span style={{ color: 'white' }}>Shift + Drag</span></div>
              </div>
            </div>
          </div>

          {points.length > 0 && (
            <div style={{ padding: 20 }}>
              <button 
                className="btn btn-outline" 
                style={{ width: '100%', fontSize: '0.8rem', border: '1px dashed var(--color-border)' }} 
                onClick={() => setPoints([])}
              >
                 Reset All Points
              </button>
            </div>
          )}
        </div>

        {/* Canvas Area */}
        <div style={{ flex: 1, position: 'relative', background: '#000' }}>
          {imageUrl && (
            <XrayViewer 
              imageUrl={imageUrl} 
              points={points} 
              mode="calibrate" 
              onCanvasClick={handleCanvasClick} 
              onPointMove={handlePointMove}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function Step({ num, text }: { num: number, text: string }) {
  return (
    <div style={{ display: 'flex', gap: 12 }}>
      <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700, flexShrink: 0 }}>{num}</div>
      <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>{text}</p>
    </div>
  );
}
