import { useEffect, useRef, useState, useCallback } from 'react';
import OpenSeadragon from 'openseadragon';
import { ZoomIn, ZoomOut, Maximize, Eye, EyeOff } from 'lucide-react';
import type { TracingLine } from '../utils/tracingDefinitions';

// ── Public types ──────────────────────────────────────────────────────────────

export interface XrayPoint {
    id?: string | number;
    x: number;
    y: number;
    color?: string;
    label?: string;
}

/**
 * A measurement value to render as a floating annotation near a landmark.
 *
 * Color convention (matches C# backend):
 *   Normal    → '#059669' (Green)
 *   Increased → '#ea580c' (Orange)
 *   Decreased → '#dc2626' (Red)
 */
export interface MeasurementLabel {
    nearLandmark: string;
    value: number;
    unit: '°' | 'mm';
    color: string;
    offsetX?: number;
    offsetY?: number;
}

/** Display mode for the viewer. */
export type ViewMode = 'xray' | 'tracing' | 'overlay';

interface XrayViewerProps {
    imageUrl: string;
    points?: XrayPoint[];
    tracings?: TracingLine[];
    measurementLabels?: MeasurementLabel[];
    showTracings?: boolean;
    viewMode?: ViewMode;
    mode?: 'view' | 'calibrate' | 'analyze';
    onPointMove?: (idx: number, newX: number, newY: number) => void;
    onCanvasClick?: (x: number, y: number) => void;
    selectedPointId?: string | number | null;
    // PointNix header metadata
    patientName?: string;
    patientMeta?: string;   // e.g. "11Y, Female"
    date?: string;
}

// ── Internal types ────────────────────────────────────────────────────────────

interface SvgElement {
    id: string;
    type: 'line' | 'path';
    x1?: number; y1?: number; x2?: number; y2?: number;
    d?: string;
    stroke: string; strokeWidth: number; opacity: number; dashed?: boolean;
    fill?: string;
}

interface SvgLabel {
    id: string; x: number; y: number;
    text: string; fill: string; fontSize: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const norm = (v: number, d: number) => (v >= 0 && v <= 1 ? v * d : v);

const mkPt = (p: { x: number; y: number }, w: number, h: number) =>
    new OpenSeadragon.Point(norm(p.x, w), norm(p.y, h));

const toPx = (viewer: OpenSeadragon.Viewer, ip: OpenSeadragon.Point) =>
    viewer.viewport.pixelFromPoint(viewer.viewport.imageToViewportCoordinates(ip));

/**
 * Infer stroke style from a tracing line's color.
 * Soft tissue profile & Anatomical (Green) → thicker.
 * Incisor axes (Slate) → medium.
 * Reference planes (Purple/Cyan) → standard.
 */
function inferStroke(hex: string): { strokeWidth: number; opacity: number } {
    const h = hex.toLowerCase();
    if (h.startsWith('#16a34a'))
        return { strokeWidth: 2.4, opacity: 0.95 };
    if (h.startsWith('#4b5563'))
        return { strokeWidth: 1.5, opacity: 0.90 };
    return { strokeWidth: 1.7, opacity: 0.88 };
}

function buildCatmullRom(pts: {x:number, y:number}[], tension = 0.4): string {
    if (pts.length < 2) return '';
    let d = `M ${pts[0].x},${pts[0].y} `;
    for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[Math.max(i - 1, 0)];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const p3 = pts[Math.min(i + 2, pts.length - 1)];

        const cp1x = p1.x + (p2.x - p0.x) * tension / 3;
        const cp1y = p1.y + (p2.y - p0.y) * tension / 3;
        const cp2x = p2.x - (p3.x - p1.x) * tension / 3;
        const cp2y = p2.y - (p3.y - p1.y) * tension / 3;

        d += `C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y} `;
    }
    return d.trim();
}

function buildToothPath(tip: {x:number, y:number}, root: {x:number, y:number}): string {
    const dx = root.x - tip.x;
    const dy = root.y - tip.y;
    const len = Math.hypot(dx, dy);
    if (len < 5) return '';
    const ux = dx / len, uy = dy / len;
    const px = -uy, py = ux;
    
    const cw = len * 0.38; // crown width
    const cl = len * 0.42; // crown length
    const rw = len * 0.18; // root width
    
    let d = `M ${tip.x},${tip.y} `;
    d += `C ${tip.x + px * cw},${tip.y + py * cw} ${tip.x + ux * cl + px * cw},${tip.y + uy * cl + py * cw} ${tip.x + ux * cl},${tip.y + uy * cl} `;
    d += `C ${tip.x + ux * cl - px * cw},${tip.y + uy * cl - py * cw} ${tip.x - px * cw},${tip.y - py * cw} ${tip.x},${tip.y} Z `;
    d += `M ${tip.x + ux * cl},${tip.y + uy * cl} `;
    d += `C ${tip.x + ux * (cl + (len - cl) / 2) + px * rw},${tip.y + uy * (cl + (len - cl) / 2) + py * rw} ${root.x},${root.y} ${root.x},${root.y} `;
    d += `C ${root.x},${root.y} ${tip.x + ux * (cl + (len - cl) / 2) - px * rw},${tip.y + uy * (cl + (len - cl) / 2) - py * rw} ${tip.x + ux * cl},${tip.y + uy * cl} `;
    return d;
}

function buildMolarPath(pt: {x:number, y:number}, isUpper: boolean): string {
    const w = 26, h = 20;
    const dir = isUpper ? -1 : 1;
    const x = pt.x, y = pt.y;
    let d = `M ${x - w / 2},${y} `;
    d += `C ${x - w / 4},${y + 4 * dir} ${x + w / 4},${y + 4 * dir} ${x + w / 2},${y} `;
    d += `L ${x + w / 2},${y + h * dir} `;
    d += `L ${x - w / 2},${y + h * dir} Z`;
    return d;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function XrayViewer({
    imageUrl,
    points = [],
    tracings = [],
    measurementLabels = [],
    showTracings = true,
    viewMode: initialViewMode = 'overlay',
    mode = 'view',
    onPointMove,
    onCanvasClick,
    selectedPointId,
    patientName,
    patientMeta,
    date,
}: XrayViewerProps) {
    const viewerId = useRef(`osd-${Math.random().toString(36).slice(2, 9)}`).current;
    const loupeId = useRef(`osd-loupe-${Math.random().toString(36).slice(2, 9)}`).current;
    const containerRef = useRef<HTMLDivElement>(null);
    const loupeContainerRef = useRef<HTMLDivElement>(null);

    const VI = useRef<OpenSeadragon.Viewer | null>(null);
    const LI = useRef<OpenSeadragon.Viewer | null>(null);
    const TR = useRef<OpenSeadragon.MouseTracker[]>([]);
    const CAL = useRef<{ evt: keyof OpenSeadragon.ViewerEventMap; fn: (ev: any) => void }[]>([]);
    const SZ = useRef({ w: 0, h: 0 });

    const [lines, setLines] = useState<SvgElement[]>([]);
    const [labels, setLabels] = useState<SvgLabel[]>([]);
    const [ready, setReady] = useState(false);
    const [loupe, setLoupe] = useState(false);
    const [lblsOn, setLblsOn] = useState(true);
    const [vm, setVm] = useState<ViewMode>(initialViewMode);

    // Sync internal state with prop
    useEffect(() => {
        setVm(initialViewMode);
    }, [initialViewMode]);

    // ── Init ──────────────────────────────────────────────────────────────────

    useEffect(() => {
        if (!containerRef.current || !loupeContainerRef.current) return;

        const osd = OpenSeadragon({
            element: containerRef.current,
            prefixUrl: 'https://openseadragon.github.io/openseadragon/images/',
            tileSources: { type: 'image', url: imageUrl, crossOriginPolicy: 'Anonymous' } as any,
            showNavigationControl: false, zoomPerClick: mode === 'view' ? 2 : 1,
            minZoomImageRatio: 0.5, maxZoomPixelRatio: 12,
            animationTime: 0.3, springStiffness: 14,
            gestureSettingsMouse: { clickToZoom: mode === 'view' },
        });
        osd.addHandler('open', () => {
            const s = osd.world.getItemAt(0).getContentSize();
            SZ.current = { w: s.x, h: s.y }; setReady(true);
        });
        osd.addHandler('canvas-click', (ev: any) => {
            if (!ev.quick || mode !== 'calibrate' || !onCanvasClick) return;
            const ip = osd.viewport.viewportToImageCoordinates(osd.viewport.pointFromPixel(ev.position));
            onCanvasClick(ip.x, ip.y);
        });

        const lp = OpenSeadragon({
            element: loupeContainerRef.current,
            prefixUrl: 'https://openseadragon.github.io/openseadragon/images/',
            tileSources: { type: 'image', url: imageUrl, crossOriginPolicy: 'Anonymous' } as any,
            showNavigationControl: false, mouseNavEnabled: false, zoomPerClick: 1,
            gestureSettingsMouse: { clickToZoom: false, dblClickToZoom: false, scrollToZoom: false },
        });

        VI.current = osd; LI.current = lp;
        return () => {
            TR.current.forEach(t => t.destroy()); TR.current = [];
            osd.destroy(); lp.destroy();
            VI.current = null; LI.current = null; setReady(false);
        };
    }, [imageUrl, viewerId, loupeId, mode, onCanvasClick]);

    // ── Canvas visibility for view mode ───────────────────────────────────────

    useEffect(() => {
        if (!ready) return;
        const el = document.getElementById(viewerId);
        if (!el) return;
        const cvs = el.querySelector('canvas') as HTMLCanvasElement | null;
        if (!cvs) return;
        cvs.style.opacity = vm === 'tracing' ? '0' : '1';
        el.style.background = vm === 'tracing' ? '#ffffff' : '#04080f';
    }, [vm, viewerId, ready]);

    // ── Loupe ─────────────────────────────────────────────────────────────────

    const panLoupe = useCallback((x: number, y: number) => {
        const l = LI.current;
        if (!l?.isOpen()) return;
        const vp = l.viewport.imageToViewportCoordinates(new OpenSeadragon.Point(x, y));
        l.viewport.panTo(vp, true); l.viewport.zoomTo(10, vp, true);
    }, []);

    // ── SVG lines + labels ────────────────────────────────────────────────────

    useEffect(() => {
        const viewer = VI.current;
        if (!viewer || !ready || !showTracings) { setLines([]); setLabels([]); return; }
        const { w, h } = SZ.current;
        const pm = new Map<string, { x: number; y: number }>();
        points.forEach(p => { if (p.label) pm.set(p.label, p); });

        const run = () => {
            if (!viewer.viewport) return;
            const L: SvgElement[] = [], LB: SvgLabel[] = [];

            tracings.forEach((t, i) => {
                const col = t.color ?? '#9333ea';
                const { strokeWidth, opacity } = inferStroke(col);

                if (t.type === 'spline' && t.points) {
                    const pts = t.points.map(p => pm.get(p)).filter(Boolean) as {x:number,y:number}[];
                    if (pts.length < 2) return;
                    const scrPts = pts.map(p => toPx(viewer, mkPt(p, w, h)));
                    L.push({ id: `l${i}`, type: 'path', d: buildCatmullRom(scrPts), stroke: col, strokeWidth, opacity });
                } else if (t.type === 'tooth') {
                    const p1 = pm.get(t.p1!), p2 = pm.get(t.p2!);
                    if (!p1 || !p2) return;
                    const a = toPx(viewer, mkPt(p1, w, h)), b = toPx(viewer, mkPt(p2, w, h));
                    L.push({ id: `l${i}`, type: 'path', d: buildToothPath(a, b), stroke: col, strokeWidth, opacity });
                } else if (t.type === 'molar') {
                    const p1 = pm.get(t.p1!);
                    if (!p1) return;
                    const a = toPx(viewer, mkPt(p1, w, h));
                    L.push({ id: `l${i}`, type: 'path', d: buildMolarPath(a, !!t.isUpper), stroke: col, strokeWidth, opacity });
                } else {
                    const p1 = pm.get(t.p1!), p2 = pm.get(t.p2!);
                    if (!p1 || !p2) return;
                    const a = toPx(viewer, mkPt(p1, w, h)), b = toPx(viewer, mkPt(p2, w, h));
                    L.push({ id: `l${i}`, type: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: col, strokeWidth, opacity, dashed: t.isAxis });
                }
            });

            measurementLabels.forEach((m, mi) => {
                const lm = pm.get(m.nearLandmark);
                if (!lm) return;
                const px = toPx(viewer, mkPt(lm, w, h));
                LB.push({ id: `mv${mi}`, x: px.x + (m.offsetX ?? 14), y: px.y + (m.offsetY ?? 0), text: `${m.value.toFixed(2)} ${m.unit}`, fill: m.color, fontSize: 13 });
            });

            setLines(L); setLabels(LB);
        };

        const EVTS = ['animation', 'update-viewport', 'pan', 'zoom', 'resize'] as const;
        EVTS.forEach(e => viewer.addHandler(e, run));
        run();
        return () => { EVTS.forEach(e => viewer.removeHandler(e, run)); };
    }, [ready, points, tracings, measurementLabels, showTracings]);

    // ── Point overlays ────────────────────────────────────────────────────────

    useEffect(() => {
        const viewer = VI.current;
        if (!viewer || !ready) return;
        TR.current.forEach(t => t.destroy()); TR.current = [];
        CAL.current.forEach(({ evt, fn }) => viewer.removeHandler(evt, fn)); CAL.current = [];
        viewer.clearOverlays();

        const { w, h } = SZ.current;
        const light = vm === 'tracing';

        points.forEach((p, idx) => {
            const isCal = mode === 'calibrate', isSel = selectedPointId === p.id;
            const col = isCal ? (idx === 0 ? '#22c55e' : '#ef4444') : (p.color ?? '#9333ea');
            // Highlight: Always use point color for dot to show confidence on X-ray
            const sz = isCal ? 18 : isSel ? 15 : 10;

            const el = document.createElement('div');
            el.dataset.pointId = p.id?.toString() ?? '';
            Object.assign(el.style, {
                position: 'absolute', width: `${sz}px`, height: `${sz}px`, borderRadius: '50%',
                background: isSel ? 'white' : 'transparent',
                border: `2px solid ${isSel ? col : (light ? col : 'rgba(255,255,255,0.7)')}`,
                boxShadow: `0 0 0 ${isSel ? 3 : 2}px ${col}`,
                cursor: mode !== 'view' ? 'grab' : 'default',
                transition: 'all 0.12s', zIndex: isSel ? '99' : '10',
            });

            const dot = document.createElement('div');
            Object.assign(dot.style, {
                width: '4px', height: '4px', borderRadius: '50%',
                background: col, // Prefer encoded color (confidence) over white
                position: 'absolute', top: '50%', left: '50%',
                transform: 'translate(-50%,-50%)', pointerEvents: 'none',
                boxShadow: light ? 'none' : '0 0 2px rgba(0,0,0,0.5)',
            });
            el.appendChild(dot);

            if (p.label && lblsOn) {
                const lbl = document.createElement('div');
                lbl.textContent = p.label;
                Object.assign(lbl.style, {
                    position: 'absolute', left: 'calc(100% + 5px)', top: '50%', transform: 'translateY(-50%)',
                    background: light ? 'rgba(255,255,255,0.92)' : 'rgba(8,13,24,0.88)',
                    padding: '2px 6px', borderRadius: '4px',
                    color: light ? '#12122a' : 'white', fontSize: '10px', fontWeight: '700',
                    fontFamily: '"IBM Plex Mono", monospace', border: `1px solid ${col}55`,
                    pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: '100',
                });
                el.appendChild(lbl);
            }

            if (isCal) {
                const n = document.createElement('div');
                n.textContent = idx === 0 ? '1' : '2';
                Object.assign(n.style, {
                    position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
                    color: 'white', fontSize: '9px', fontWeight: '800', fontFamily: 'monospace',
                    textShadow: '0 1px 3px rgba(0,0,0,0.9)', pointerEvents: 'none',
                });
                el.appendChild(n);
            }

            const ip = mkPt(p, w, h);
            viewer.addOverlay({ element: el, location: viewer.viewport.imageToViewportCoordinates(ip), placement: OpenSeadragon.Placement.CENTER });

            if (mode !== 'view') {
                const tr = new OpenSeadragon.MouseTracker({
                    element: el,
                    dragHandler: (e: any) => {
                        el.style.cursor = 'grabbing';
                        const ov = viewer.getOverlayById(el); if (!ov) return;
                        const nl = ov.location.plus(viewer.viewport.deltaPointsFromPixels(e.delta));
                        ov.update({ location: nl });
                        const il = viewer.viewport.viewportToImageCoordinates(nl);
                        onPointMove?.(idx, il.x, il.y);
                        setLoupe(true); panLoupe(il.x, il.y);
                    },
                    dragEndHandler: () => { el.style.cursor = 'grab'; setLoupe(false); },
                });
                TR.current.push(tr);
            }
        });

        // Calibration distance line
        if (mode === 'calibrate' && points.length === 2 && w > 0) {
            const ld = document.createElement('div');
            Object.assign(ld.style, { position: 'absolute', height: '2px', background: 'linear-gradient(90deg,#22c55e,#ef4444)', transformOrigin: 'center left', pointerEvents: 'none' });
            const bg = document.createElement('div');
            Object.assign(bg.style, { position: 'absolute', top: '-22px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(8,13,24,0.9)', padding: '2px 7px', borderRadius: '4px', color: '#22d3ee', fontSize: '10px', fontWeight: '700', fontFamily: '"IBM Plex Mono", monospace', whiteSpace: 'nowrap' });
            ld.appendChild(bg);
            const ip0 = mkPt(points[0], w, h), ip1 = mkPt(points[1], w, h);
            viewer.addOverlay({ element: ld, location: viewer.viewport.imageToViewportCoordinates(ip0), placement: OpenSeadragon.Placement.CENTER_LEFT });
            const draw = () => {
                const a = viewer.viewport.pixelFromPoint(viewer.viewport.imageToViewportCoordinates(ip0));
                const b = viewer.viewport.pixelFromPoint(viewer.viewport.imageToViewportCoordinates(ip1));
                const dx = b.x - a.x, dy = b.y - a.y;
                ld.style.width = `${Math.hypot(dx, dy)}px`;
                ld.style.transform = `translateY(-50%) rotate(${Math.atan2(dy, dx) * 180 / Math.PI}deg)`;
                bg.textContent = `${Math.hypot(ip1.x - ip0.x, ip1.y - ip0.y).toFixed(1)} px`;
            };
            draw();
            (['animation', 'update-viewport'] as const).forEach(e => { viewer.addHandler(e, draw); CAL.current.push({ evt: e, fn: draw }); });
        }
    }, [ready, points, mode, selectedPointId, lblsOn, vm, panLoupe, onPointMove]);

    // ── Theme tokens ──────────────────────────────────────────────────────────

    const light = vm === 'tracing';
    const tbBg = light ? 'rgba(244,244,248,0.94)' : 'rgba(8,13,24,0.88)';
    const tbBdr = light ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.08)';
    const tbClr = light ? 'rgba(20,20,40,0.55)' : 'rgba(255,255,255,0.50)';
    const tbHov = light ? '#111' : '#fff';
    const tbHovBg = light ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.10)';
    const tbAct = light ? '#1d4ed8' : '#4c9eff';
    const tbActBg = light ? 'rgba(29,78,216,0.10)' : 'rgba(76,158,255,0.14)';
    const tbActBdr = light ? 'rgba(29,78,216,0.32)' : 'rgba(76,158,255,0.32)';
    const hdrClr = light ? '#1a1a2e' : 'rgba(255,255,255,0.72)';
    const rulClr = light ? '#1a1a2e' : 'rgba(255,255,255,0.70)';

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%', background: light ? '#fff' : '#04080f' }}>
            <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&display=swap');
        .xv-b { background:transparent; border:none; cursor:pointer; padding:7px; border-radius:6px;
                 display:flex; align-items:center; justify-content:center;
                 color:${tbClr}; transition:background .13s,color .13s; }
        .xv-b:hover { background:${tbHovBg}; color:${tbHov}; }
        .xv-b.on { color:${tbAct}; }
        .xv-vm { width:100%; padding:4px 6px; border-radius:4px; cursor:pointer;
                  font:700 9px/1 "IBM Plex Mono",monospace; letter-spacing:.08em;
                  border:1px solid ${tbBdr}; color:${tbClr}; background:transparent; transition:all .13s; }
        .xv-vm:hover:not(.on) { border-color:${light ? 'rgba(0,0,0,.2)' : 'rgba(255,255,255,.2)'}; color:${tbHov}; }
        .xv-vm.on { background:${tbActBg}; border-color:${tbActBdr}; color:${tbAct}; }
      `}</style>

            {/* Loupe */}
            <div style={{
                position: 'absolute', bottom: 20, left: 20, width: 175, height: 175, borderRadius: '50%',
                border: `3px solid ${light ? 'rgba(0,0,0,.4)' : 'rgba(255,255,255,.8)'}`,
                boxShadow: '0 6px 28px rgba(0,0,0,.45)', overflow: 'hidden',
                display: loupe ? 'block' : 'none', zIndex: 100, pointerEvents: 'none', background: light ? '#fff' : '#03070f'
            }}>
                <div ref={loupeContainerRef} style={{ width: '100%', height: '100%' }} />
                <svg viewBox="0 0 175 175" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                    <line x1="87.5" y1="67" x2="87.5" y2="108" stroke="#10b981" strokeWidth="1" />
                    <line x1="67" y1="87.5" x2="108" y2="87.5" stroke="#10b981" strokeWidth="1" />
                    <circle cx="87.5" cy="87.5" r="4" fill="none" stroke="#10b981" strokeWidth="1" strokeDasharray="2 2" />
                </svg>
            </div>

            {/* PointNix-style patient header + ruler */}
            {(patientName || date) && (
                <div style={{
                    position: 'absolute', top: 10, left: 12, zIndex: 20, pointerEvents: 'none',
                    fontFamily: '"IBM Plex Mono",monospace', color: hdrClr, fontSize: 11, lineHeight: 1.65
                }}>
                    {patientName && (
                        <div style={{ fontWeight: 600 }}>
                            {patientName}{patientMeta ? ` (${patientMeta})` : ''}
                        </div>
                    )}
                    {date && <div style={{ opacity: .65 }}>{date}</div>}

                    {/* Ruler — matches the 40 mm scale bar in the reference images */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5 }}>
                        <div style={{ position: 'relative', width: 80, height: 14 }}>
                            {/* Baseline */}
                            <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: rulClr, transform: 'translateY(-50%)' }} />
                            {/* Ticks — 9 ticks for 8 intervals over 40 mm */}
                            {Array.from({ length: 9 }).map((_, i) => (
                                <div key={i} style={{
                                    position: 'absolute', left: `${(i / 8) * 100}%`, top: '50%',
                                    transform: 'translateY(-50%)',
                                    width: 1, height: (i === 0 || i === 8) ? 10 : 5,
                                    background: rulClr,
                                }} />
                            ))}
                        </div>
                        <span style={{ fontSize: 10, color: hdrClr, opacity: .7, fontWeight: 600 }}>40mm</span>
                    </div>
                </div>
            )}

            {/* Toolbar */}
            <div style={{
                position: 'absolute', top: 14, right: 14, zIndex: 30,
                display: 'flex', flexDirection: 'column', gap: 4,
                background: tbBg, backdropFilter: 'blur(10px)', padding: 6, borderRadius: 10,
                border: `1px solid ${tbBdr}`, boxShadow: '0 4px 16px rgba(0,0,0,.22)'
            }}>
                <button className="xv-b" title="Zoom in" onClick={() => VI.current?.viewport.zoomBy(1.4)}>  <ZoomIn size={14} /></button>
                <button className="xv-b" title="Zoom out" onClick={() => VI.current?.viewport.zoomBy(1 / 1.4)}><ZoomOut size={14} /></button>
                <button className="xv-b" title="Reset view" onClick={() => VI.current?.viewport.goHome()}>     <Maximize size={14} /></button>
                <div style={{ height: 1, background: tbBdr, margin: '2px 0' }} />
                <button className={`xv-b ${lblsOn ? 'on' : ''}`} onClick={() => setLblsOn(v => !v)} title={lblsOn ? 'Hide labels' : 'Show labels'}>
                    {lblsOn ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
                <div style={{ height: 1, background: tbBdr, margin: '2px 0' }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {(['xray', 'tracing', 'overlay'] as ViewMode[]).map(v => (
                        <button key={v} className={`xv-vm ${vm === v ? 'on' : ''}`} onClick={() => setVm(v)}>
                            {v === 'xray' ? 'X‑RAY' : v === 'tracing' ? 'TRACE' : 'BOTH'}
                        </button>
                    ))}
                </div>
            </div>

            {/* OSD canvas */}
            <div ref={containerRef} style={{ width: '100%', height: '100%', backgroundColor: light ? '#ffffff' : '#04080f' }} />

            {/* SVG tracing + measurement labels */}
            {showTracings && (
                <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 5, overflow: 'visible' }}>
                    <defs>
                        {vm === 'overlay' && (
                            <filter id="xv-glow" x="-25%" y="-25%" width="150%" height="150%">
                                <feGaussianBlur in="SourceGraphic" stdDeviation="1.2" result="b" />
                                <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                            </filter>
                        )}
                    </defs>

                    {lines.map(l => (
                        l.type === 'line' ? (
                            <line key={l.id}
                                x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
                                stroke={l.stroke} strokeWidth={l.strokeWidth} strokeOpacity={l.opacity}
                                strokeDasharray={l.dashed ? '7 5' : undefined} strokeLinecap="round"
                                filter={vm === 'overlay' ? 'url(#xv-glow)' : undefined}
                            />
                        ) : (
                            <path key={l.id}
                                d={l.d}
                                stroke={l.stroke} strokeWidth={l.strokeWidth} strokeOpacity={l.opacity}
                                fill="none"
                                strokeLinecap="round" strokeLinejoin="round"
                                filter={vm === 'overlay' ? 'url(#xv-glow)' : undefined}
                            />
                        )
                    ))}

                    {/* Measurement value annotations — IBM Plex Mono, color-coded */}
                    {labels.map(lb => (
                        <text key={lb.id} x={lb.x} y={lb.y}
                            fontFamily='"IBM Plex Mono",monospace'
                            fontSize={lb.fontSize} fontWeight="600"
                            fill={lb.fill} textAnchor="start" dominantBaseline="auto"
                            stroke={light ? 'rgba(255,255,255,0.88)' : 'rgba(0,0,0,0.65)'}
                            strokeWidth="2.5" strokeLinejoin="round" paintOrder="stroke fill"
                        >
                            {lb.text}
                        </text>
                    ))}
                </svg>
            )}
        </div>
    );
}