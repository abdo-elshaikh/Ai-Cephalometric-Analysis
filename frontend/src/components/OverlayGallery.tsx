import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Images, RefreshCw, ZoomIn, ZoomOut, X, ChevronLeft, ChevronRight,
  Maximize2, Download, Eye, Layers, Activity, BarChart2, Grid3x3,
  Wand2
} from 'lucide-react';

import api, { IMAGE_BASE_URL } from '../api/api';
import toast from 'react-hot-toast';

// ── Types ──────────────────────────────────────────────────────────────────────

interface OverlayImage {
  key: string;
  label: string;
  storageUrl: string;
  width: number;
  height: number;
}

interface OverlayGalleryProps {
  sessionId: string;
  /** If true, show a "Generate Overlays" button when the list is empty */
  allowGenerate?: boolean;
}

// ── Overlay key metadata ───────────────────────────────────────────────────────

const OVERLAY_META: Record<string, { icon: React.ReactNode; description: string; color: string; gradient: string }> = {
  xray_tracing: {
    icon: <Layers size={16} />,
    description: 'Anatomical tracing with Steiner planes, soft-tissue profile and dental axes',
    color: '#7c3aed',
    gradient: 'linear-gradient(135deg,#7c3aed,#4f46e5)',
  },
  xray_measurements: {
    icon: <BarChart2 size={16} />,
    description: 'Color-coded measurement callouts (Normal/Mild/Severe) on the X-ray',
    color: '#0891b2',
    gradient: 'linear-gradient(135deg,#0891b2,#0e7490)',
  },
  wiggle_chart: {
    icon: <Activity size={16} />,
    description: 'Björk–Skieller deviation polygon showing distance from clinical norms',
    color: '#059669',
    gradient: 'linear-gradient(135deg,#059669,#047857)',
  },
  tracing_only: {
    icon: <Eye size={16} />,
    description: 'Clean anatomical tracing on white background for documentation',
    color: '#d97706',
    gradient: 'linear-gradient(135deg,#d97706,#b45309)',
  },
  measurement_table: {
    icon: <Grid3x3 size={16} />,
    description: 'Tabular summary with deviation bars and clinical norm ranges',
    color: '#db2777',
    gradient: 'linear-gradient(135deg,#db2777,#be185d)',
  },
};

// ── Full-screen Lightbox ───────────────────────────────────────────────────────

interface LightboxProps {
  images: OverlayImage[];
  index: number;
  onClose: () => void;
  onNavigate: (i: number) => void;
}

function Lightbox({ images, index, onClose, onNavigate }: LightboxProps) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ dragging: boolean; startX: number; startY: number; panX: number; panY: number }>({
    dragging: false, startX: 0, startY: 0, panX: 0, panY: 0
  });
  const img = images[index];
  const meta = OVERLAY_META[img?.key] ?? { color: '#6366f1', gradient: 'linear-gradient(135deg,#6366f1,#a855f7)', description: '', icon: null };

  // Reset zoom/pan when image changes
  useEffect(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, [index]);

  // Keyboard nav
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onNavigate(Math.max(0, index - 1));
      if (e.key === 'ArrowRight') onNavigate(Math.min(images.length - 1, index + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, images.length, onClose, onNavigate]);

  const resolveUrl = (url: string) => url.startsWith('http') ? url : `${IMAGE_BASE_URL}/${url}`;

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom(z => Math.min(8, Math.max(0.5, z - e.deltaY * 0.001)));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    dragRef.current = { dragging: true, startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragRef.current.dragging) return;
    setPan({
      x: dragRef.current.panX + (e.clientX - dragRef.current.startX),
      y: dragRef.current.panY + (e.clientY - dragRef.current.startY),
    });
  }, []);

  const handleMouseUp = useCallback(() => { dragRef.current.dragging = false; }, []);

  const handleDownload = async () => {
    const resolved = resolveUrl(img.storageUrl);
    const res = await fetch(resolved);
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${img.key}.jpg`;
    a.click();
  };

  if (!img) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.96)',
        backdropFilter: 'blur(20px)',
        display: 'flex', flexDirection: 'column',
        animation: 'fadeIn .15s ease',
      }}
    >
      {/* Header */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 20px',
          background: 'rgba(255,255,255,0.03)',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          flexShrink: 0,
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '4px 12px', borderRadius: 8,
          background: `${meta.color}20`, border: `1px solid ${meta.color}40`,
          color: meta.color, fontSize: '0.78rem', fontWeight: 700,
        }}>
          {meta.icon} {img.label}
        </div>
        <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>{meta.description}</span>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)', alignSelf: 'center' }}>
            {index + 1} / {images.length}
          </span>
          <button onClick={() => setZoom(z => Math.min(8, z * 1.3))} style={lbBtn}>
            <ZoomIn size={16} />
          </button>
          <button onClick={() => setZoom(z => Math.max(0.5, z / 1.3))} style={lbBtn}>
            <ZoomOut size={16} />
          </button>
          <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} style={lbBtn}>
            <Maximize2 size={16} />
          </button>
          <button onClick={handleDownload} style={lbBtn} title="Download">
            <Download size={16} />
          </button>
          <button onClick={onClose} style={{ ...lbBtn, color: '#ef4444' }} title="Close (Esc)">
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Image + nav */}
      <div
        style={{ flex: 1, position: 'relative', overflow: 'hidden', cursor: zoom > 1 ? 'grab' : 'default' }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onClick={e => e.stopPropagation()}
      >
        <img
          src={resolveUrl(img.storageUrl)}
          alt={img.label}
          draggable={false}
          style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${zoom})`,
            transformOrigin: 'center',
            maxWidth: '100%', maxHeight: '100%',
            objectFit: 'contain',
            transition: dragRef.current.dragging ? 'none' : 'transform 0.1s ease',
            userSelect: 'none',
          }}
        />

        {/* Nav arrows */}
        {index > 0 && (
          <button
            onClick={e => { e.stopPropagation(); onNavigate(index - 1); }}
            style={{ ...navBtn, left: 16 }}
          >
            <ChevronLeft size={24} />
          </button>
        )}
        {index < images.length - 1 && (
          <button
            onClick={e => { e.stopPropagation(); onNavigate(index + 1); }}
            style={{ ...navBtn, right: 16 }}
          >
            <ChevronRight size={24} />
          </button>
        )}

        {/* Zoom indicator */}
        {zoom !== 1 && (
          <div style={{
            position: 'absolute', bottom: 16, right: 16,
            background: 'rgba(0,0,0,0.7)', padding: '4px 10px', borderRadius: 6,
            fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)',
            fontFamily: 'monospace',
          }}>
            {(zoom * 100).toFixed(0)}%
          </div>
        )}
      </div>

      {/* Thumbnail strip */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          display: 'flex', gap: 8, padding: '10px 20px',
          background: 'rgba(0,0,0,0.6)', borderTop: '1px solid rgba(255,255,255,0.05)',
          overflowX: 'auto', flexShrink: 0,
        }}
      >
        {images.map((im, i) => {
          const m = OVERLAY_META[im.key] ?? { color: '#6366f1' };
          return (
            <button
              key={im.key}
              onClick={() => onNavigate(i)}
              style={{
                flexShrink: 0, width: 80, height: 60,
                borderRadius: 8, overflow: 'hidden',
                border: `2px solid ${i === index ? m.color : 'transparent'}`,
                background: 'rgba(255,255,255,0.05)',
                cursor: 'pointer', padding: 0,
                transition: 'border-color 0.2s, transform 0.2s',
                transform: i === index ? 'scale(1.05)' : 'scale(1)',
              }}
            >
              <img
                src={resolveUrl(im.storageUrl)}
                alt={im.label}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

const lbBtn: React.CSSProperties = {
  background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8, padding: '6px 10px', cursor: 'pointer', color: 'rgba(255,255,255,0.8)',
  display: 'flex', alignItems: 'center', transition: 'background 0.15s',
};

const navBtn: React.CSSProperties = {
  position: 'absolute', top: '50%', transform: 'translateY(-50%)',
  background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 12, padding: '12px 10px', cursor: 'pointer',
  color: 'white', display: 'flex', zIndex: 10,
  backdropFilter: 'blur(8px)',
  transition: 'background 0.15s',
};

// ── OverlayCard ────────────────────────────────────────────────────────────────

interface OverlayCardProps {
  image: OverlayImage;
  onClick: () => void;
  delay?: number;
}

function OverlayCard({ image, onClick, delay = 0 }: OverlayCardProps) {
  const [loaded, setLoaded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const meta = OVERLAY_META[image.key] ?? { color: '#6366f1', gradient: 'linear-gradient(135deg,#6366f1,#a855f7)', description: '', icon: null };
  const resolveUrl = (url: string) => url.startsWith('http') ? url : `${IMAGE_BASE_URL}/${url}`;

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderRadius: 16, overflow: 'hidden', cursor: 'pointer',
        border: `1px solid ${hovered ? meta.color + '60' : 'rgba(255,255,255,0.06)'}`,
        background: 'rgba(10,15,30,0.7)',
        transition: 'all 0.25s cubic-bezier(0.4,0,0.2,1)',
        transform: hovered ? 'translateY(-4px) scale(1.01)' : 'translateY(0) scale(1)',
        boxShadow: hovered ? `0 20px 40px rgba(0,0,0,0.4), 0 0 0 1px ${meta.color}30` : '0 4px 20px rgba(0,0,0,0.3)',
        animation: `fadeInUp 0.5s ${delay}ms both ease`,
      }}
    >
      {/* Image area */}
      <div style={{ position: 'relative', aspectRatio: '4/3', background: '#050810', overflow: 'hidden' }}>
        {!loaded && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(90deg,rgba(255,255,255,0.03) 25%,rgba(255,255,255,0.07) 50%,rgba(255,255,255,0.03) 75%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.5s infinite',
          }} />
        )}
        <img
          src={resolveUrl(image.storageUrl)}
          alt={image.label}
          onLoad={() => setLoaded(true)}
          style={{
            width: '100%', height: '100%', objectFit: 'cover',
            opacity: loaded ? 1 : 0, transition: 'opacity 0.4s ease',
            display: 'block',
          }}
        />

        {/* Hover overlay */}
        <div style={{
          position: 'absolute', inset: 0,
          background: `linear-gradient(transparent 40%, rgba(0,0,0,0.85) 100%)`,
          opacity: hovered ? 1 : 0, transition: 'opacity 0.25s',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 16,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: meta.gradient, color: 'white',
            padding: '8px 20px', borderRadius: 24, fontSize: '0.8rem', fontWeight: 700,
            boxShadow: `0 4px 15px ${meta.color}40`,
          }}>
            <Maximize2 size={14} /> Open Full View
          </div>
        </div>

        {/* Badge */}
        <div style={{
          position: 'absolute', top: 10, left: 10,
          background: `${meta.color}CC`, backdropFilter: 'blur(8px)',
          padding: '3px 10px', borderRadius: 20,
          fontSize: '0.65rem', fontWeight: 800, color: 'white',
          letterSpacing: '0.04em', textTransform: 'uppercase',
          display: 'flex', alignItems: 'center', gap: 5,
        }}>
          {meta.icon} {image.key.replace(/_/g, ' ')}
        </div>

        {/* Dimensions */}
        {image.width > 0 && (
          <div style={{
            position: 'absolute', bottom: 8, right: 8,
            background: 'rgba(0,0,0,0.7)', padding: '2px 8px', borderRadius: 6,
            fontSize: '0.65rem', color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace',
          }}>
            {image.width}×{image.height}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: '12px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: meta.gradient, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', flexShrink: 0,
          }}>
            {meta.icon}
          </div>
          <div>
            <div style={{ fontSize: '0.87rem', fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>
              {image.label}
            </div>
            <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>
              {meta.description}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function OverlayGallery({ sessionId, allowGenerate = true }: OverlayGalleryProps) {
  const [overlays, setOverlays] = useState<OverlayImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [view, setView] = useState<'grid' | 'single'>('grid');
  const [singleIndex, setSingleIndex] = useState(0);

  useEffect(() => {
    fetchOverlays();
  }, [sessionId]);

  const fetchOverlays = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/analysis/sessions/${sessionId}/overlays`);
      setOverlays(Array.isArray(res.data) ? res.data : []);
    } catch {
      setOverlays([]);
    }
    setLoading(false);
  };

  const handleGenerate = async () => {
    setGenerating(true);
    const id = toast.loading('Rendering 5 clinical overlay images…');
    try {
      const res = await api.post(`/analysis/sessions/${sessionId}/overlays`);
      const { images } = res.data;
      if (Array.isArray(images) && images.length) {
        setOverlays(images.map((im: any) => ({
          key: im.key, label: im.label, storageUrl: im.storageUrl,
          width: im.width, height: im.height,
        })));
        toast.success(`${images.length} clinical overlays ready!`, { id });
      } else {
        await fetchOverlays();
        toast.success('Overlays generated!', { id });
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Failed to generate overlays', { id });
    }
    setGenerating(false);
  };

  if (loading) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 16 }}>
        {[...Array(5)].map((_, i) => (
          <div key={i} style={{
            borderRadius: 16, overflow: 'hidden',
            border: '1px solid rgba(255,255,255,0.06)',
            animation: `fadeInUp 0.4s ${i * 60}ms both ease`,
          }}>
            <div style={{ aspectRatio: '4/3', background: 'rgba(255,255,255,0.03)' }} className="skeleton" />
            <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className="skeleton" style={{ height: 14, width: '60%', borderRadius: 4 }} />
              <div className="skeleton" style={{ height: 10, width: '85%', borderRadius: 4 }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (overlays.length === 0) {
    return (
      <div style={{
        padding: '48px 24px', textAlign: 'center', borderRadius: 20,
        border: '1px dashed rgba(255,255,255,0.08)',
        background: 'rgba(99,120,255,0.02)',
        animation: 'fadeInUp 0.4s ease',
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: 20, margin: '0 auto 20px',
          background: 'linear-gradient(135deg,rgba(99,120,255,0.15),rgba(168,85,247,0.15))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '1px solid rgba(99,120,255,0.2)',
        }}>
          <Images size={28} style={{ color: '#6366f1', opacity: 0.8 }} />
        </div>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 8, color: 'rgba(255,255,255,0.85)' }}>
          No Overlay Images Yet
        </h3>
        <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.35)', marginBottom: 24, maxWidth: 380, margin: '0 auto 24px' }}>
          Generate 5 professional clinical images: anatomical tracing, measurement annotations, deviation chart, and more.
        </p>
        {allowGenerate && (
          <button
            onClick={handleGenerate}
            disabled={generating}
            style={{
              background: 'linear-gradient(135deg,#6366f1,#a855f7)',
              border: 'none', color: 'white',
              padding: '10px 28px', borderRadius: 12,
              fontSize: '0.875rem', fontWeight: 700, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 8,
              boxShadow: '0 4px 20px rgba(99,120,255,0.35)',
              opacity: generating ? 0.7 : 1,
              transition: 'all 0.2s',
            }}
          >
            {generating ? <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Wand2 size={16} />}
            {generating ? 'Rendering…' : 'Generate Clinical Overlays'}
          </button>
        )}
      </div>
    );
  }

  const currentSingle = overlays[singleIndex];
  const currentSingleMeta = OVERLAY_META[currentSingle?.key] ?? { color: '#6366f1', gradient: 'linear-gradient(135deg,#6366f1,#a855f7)', description: '', icon: null };
  const resolveUrl = (url: string) => url.startsWith('http') ? url : `${IMAGE_BASE_URL}/${url}`;

  return (
    <>
      {/* Header toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        marginBottom: 16, flexWrap: 'wrap',
      }}>
        {/* View mode toggle */}
        <div style={{
          display: 'flex', gap: 2, background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: 3,
        }}>
          {(['grid', 'single'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                padding: '5px 14px', borderRadius: 7, border: 'none', cursor: 'pointer',
                fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.04em',
                background: view === v ? 'rgba(99,120,255,0.2)' : 'transparent',
                color: view === v ? '#818cf8' : 'rgba(255,255,255,0.35)',
                transition: 'all 0.15s',
              }}
            >
              {v === 'grid' ? 'GALLERY' : 'COMPARE'}
            </button>
          ))}
        </div>

        <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)' }}>
          {overlays.length} clinical images
        </span>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button
            onClick={handleGenerate}
            disabled={generating}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'rgba(99,120,255,0.1)', border: '1px solid rgba(99,120,255,0.2)',
              color: '#818cf8', padding: '6px 14px', borderRadius: 8,
              fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
              opacity: generating ? 0.6 : 1, transition: 'all 0.2s',
            }}
          >
            <RefreshCw size={13} style={{ animation: generating ? 'spin 1s linear infinite' : 'none' }} />
            {generating ? 'Rendering…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Grid view */}
      {view === 'grid' && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 16,
        }}>
          {overlays.map((img, i) => (
            <OverlayCard
              key={img.key}
              image={img}
              onClick={() => setLightboxIndex(i)}
              delay={i * 60}
            />
          ))}
        </div>
      )}

      {/* Single comparison view */}
      {view === 'single' && (
        <div style={{ display: 'flex', gap: 16, height: '100%', flexDirection: 'column' }}>
          {/* Selector strip */}
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
            {overlays.map((img, i) => {
              const m = OVERLAY_META[img.key] ?? { color: '#6366f1', gradient: 'linear-gradient(135deg,#6366f1,#a855f7)', icon: null };
              const active = i === singleIndex;
              return (
                <button
                  key={img.key}
                  onClick={() => setSingleIndex(i)}
                  style={{
                    flexShrink: 0,
                    display: 'flex', alignItems: 'center', gap: 7,
                    padding: '7px 14px', borderRadius: 10, cursor: 'pointer',
                    border: `1px solid ${active ? m.color + '60' : 'rgba(255,255,255,0.07)'}`,
                    background: active ? `${m.color}15` : 'rgba(255,255,255,0.03)',
                    color: active ? m.color : 'rgba(255,255,255,0.5)',
                    fontSize: '0.78rem', fontWeight: 700,
                    transition: 'all 0.2s',
                  }}
                >
                  {m.icon} {img.label}
                </button>
              );
            })}
          </div>

          {/* Full image */}
          {currentSingle && (
            <div style={{
              borderRadius: 16, overflow: 'hidden',
              border: `1px solid ${currentSingleMeta.color}30`,
              background: '#050810', position: 'relative',
              animation: 'fadeIn 0.2s ease',
            }}>
              <img
                src={resolveUrl(currentSingle.storageUrl)}
                alt={currentSingle.label}
                style={{ width: '100%', display: 'block' }}
              />
              {/* Info strip */}
              <div style={{
                padding: '10px 16px',
                background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(10px)',
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  color: currentSingleMeta.color, fontSize: '0.78rem', fontWeight: 700,
                }}>
                  {currentSingleMeta.icon} {currentSingle.label}
                </div>
                <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.35)' }}>
                  {currentSingleMeta.description}
                </span>
                <button
                  onClick={() => setLightboxIndex(singleIndex)}
                  style={{
                    marginLeft: 'auto',
                    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 8, padding: '5px 12px', cursor: 'pointer',
                    color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem', fontWeight: 600,
                    display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s',
                  }}
                >
                  <Maximize2 size={13} /> Fullscreen
                </button>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
            <button
              onClick={() => setSingleIndex(i => Math.max(0, i - 1))}
              disabled={singleIndex === 0}
              style={{ ...navStripBtn, opacity: singleIndex === 0 ? 0.3 : 1 }}
            >
              <ChevronLeft size={16} /> Prev
            </button>
            <button
              onClick={() => setSingleIndex(i => Math.min(overlays.length - 1, i + 1))}
              disabled={singleIndex === overlays.length - 1}
              style={{ ...navStripBtn, opacity: singleIndex === overlays.length - 1 ? 0.3 : 1 }}
            >
              Next <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <Lightbox
          images={overlays}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
        />
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes fadeIn { from { opacity:0 } to { opacity:1 } }
        @keyframes fadeInUp { from { opacity:0; transform:translateY(16px) } to { opacity:1; transform:none } }
      `}</style>
    </>
  );
}

const navStripBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 8, padding: '7px 16px', cursor: 'pointer',
  color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', fontWeight: 600,
  transition: 'all 0.2s',
};
