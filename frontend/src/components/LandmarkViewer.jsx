import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import {
  ZoomIn, ZoomOut, Maximize2, Sun, Contrast,
  Eye, EyeOff, RotateCcw, Crosshair, Layers,
  Lock, Unlock, Ruler, Grid3X3, Sliders,
  Download, Search, Move, Hand, Triangle,
  FlipHorizontal2, ScanLine, Focus, ChevronRight,
  Undo2, Redo2
} from 'lucide-react'

// ── Tokens ─────────────────────────────────────────────────────────────────
const C = {
  bg: '#07090f',
  surface: '#0e1119',
  surfaceHi: '#141824',
  border: 'rgba(255,255,255,0.06)',
  borderMed: 'rgba(255,255,255,0.10)',
  borderHi: 'rgba(255,255,255,0.16)',
  teal: '#2dd4bf',
  tealDim: 'rgba(45,212,191,0.12)',
  tealBorder: 'rgba(45,212,191,0.24)',
  amber: '#f59e0b',
  amberDim: 'rgba(245,158,11,0.12)',
  violet: '#8b5cf6',
  violetDim: 'rgba(139,92,246,0.12)',
  red: '#f43f5e',
  redDim: 'rgba(244,63,94,0.12)',
  green: '#22c55e',
  text0: '#f8fafc',
  text1: '#94a3b8',
  text2: '#475569',
  text3: '#1e293b',
  mono: '"Geist Mono", "JetBrains Mono", "Fira Code", monospace',
  sans: '"Geist", "DM Sans", system-ui, sans-serif',
  r: '6px',
  rLg: '10px',
}

const LANDMARK_HIT_PX = 12
const DOT_R = 4

const GROUPS = {
  Skeletal: ['S', 'N', 'A', 'B', 'ANS', 'PNS', 'Me', 'Gn', 'Go', 'Or', 'Po', 'Ar', 'Ba', 'Co', 'Pog', 'Pg', 'Pt', 'PTM'],
  Dental: ['U1', 'U1R', 'L1', 'L1R', 'U6', 'L6', 'UL', 'LL', 'UP1', 'LP1', 'UP6', 'LP6'],
  'Soft Tissue': ['Prn', 'Sn', 'LS', 'LI', "Pog'", 'Me\'', 'Gn\'', 'Cm', 'Sl', 'StU', 'StL', 'Li'],
}
const GROUP_COLORS = { Skeletal: '#2dd4bf', Dental: '#60a5fa', 'Soft Tissue': '#f472b6', Other: '#64748b' }

const LANDMARK_INFO = {
  'S': { name: 'Sella', desc: 'Center of the pituitary fossa (Sella Turcica). Skeletal reference point.' },
  'N': { name: 'Nasion', desc: 'The most anterior point of the frontonasal suture.' },
  'A': { name: 'Subspinale (Point A)', desc: 'Deepest midline point in the maxilla between ANS and Prosthion.' },
  'B': { name: 'Supramentale (Point B)', desc: 'Deepest midline point on the mandibular symphysis.' },
  'ANS': { name: 'Anterior Nasal Spine', desc: 'Tip of the bony anterior nasal spine.' },
  'PNS': { name: 'Posterior Nasal Spine', desc: 'Tip of the posterior spine of the palatine bone.' },
  'Me': { name: 'Menton', desc: 'Lowest point of the mandibular symphysis.' },
  'Gn': { name: 'Gnathion', desc: 'The most anteroinferior point on the mandibular symphysis.' },
  'Go': { name: 'Gonion', desc: 'The most posterior and inferior point at the angle of the mandible.' },
  'Or': { name: 'Orbitale', desc: 'The lowest point on the infraorbital margin.' },
  'Po': { name: 'Porion', desc: 'The most superior point of the external auditory meatus.' },
  'Ar': { name: 'Articulare', desc: 'Intersection of the inferior contour of the cranial base and the posterior contour of the condylar process.' },
  'Pg': { name: 'Pogonion', desc: 'The most anterior point on the mandibular symphysis.' },
  'U1': { name: 'Upper Incisor Edge', desc: 'The incisal tip of the most prominent maxillary central incisor.' },
  'L1': { name: 'Lower Incisor Edge', desc: 'The incisal tip of the most prominent mandibular central incisor.' },
}

const TRACING_PATHS = [
  { name: 'Mandible', codes: ['Ar', 'Go', 'Me', 'Gn', 'Pog', 'B'], color: '#2dd4bf', opacity: 0.5 },
  { name: 'Soft Tissue', codes: ['Prn', 'Sn', 'LS', 'StU', 'StL', 'LI', 'Sl', 'Pog\'', 'Gn\'', 'Me\''], color: '#f472b6', opacity: 0.6 },
  { name: 'Maxilla', codes: ['PNS', 'ANS', 'A'], color: '#60a5fa', opacity: 0.4 },
]

function classifyLandmark(code) {
  for (const [g, codes] of Object.entries(GROUPS)) {
    if (codes.includes(code)) return g
  }
  return 'Other'
}

function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by) }

function drawRR(ctx, x, y, w, h, r) {
  ctx.beginPath()
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r)
  else ctx.rect(x, y, w, h)
}

// ─────────────────────────────────────────────────────────────────────────────
export default function LandmarkViewer({
  imageUrl,
  landmarks = [],
  onUpdate,
  readOnly = false,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  onUpdateEnd,
}) {
  const containerRef = useRef(null)
  const osdRef = useRef(null)       // OpenSeadragon viewer instance
  const overlayCanvasRef = useRef(null)
  const animRef = useRef(null)
  const imgNaturalRef = useRef({ w: 1, h: 1 })
  const landmarksRef = useRef(landmarks)
  landmarksRef.current = landmarks

  const [osdReady, setOsdReady] = useState(false)
  const [osdError, setOsdError] = useState(false)
  const [tool, setTool] = useState('select')
  const [selected, setSelected] = useState(null)
  const [hovered, setHovered] = useState(null)
  const [dragging, setDragging] = useState(null)
  const [rulerPts, setRulerPts] = useState([])
  const [anglePts, setAnglePts] = useState([])
  const [showLandmarks, setShowLandmarks] = useState(true)
  const [showTracing, setShowTracing] = useState(true)
  const [showLabels, setShowLabels] = useState(true)
  const [showCrosshairs, setShowCrosshairs] = useState(true)
  const [showGrid, setShowGrid] = useState(false)
  const [brightness, setBrightness] = useState(100)
  const [contrast, setContrast] = useState(100)
  const [invert, setInvert] = useState(false)
  const [flipH, setFlipH] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [panelOpen, setPanelOpen] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeGroup, setActiveGroup] = useState(null)
  const [lockedGroups, setLockedGroups] = useState(new Set())
  const mouseCanvasRef = useRef(null)

  const groups = useMemo(() => {
    const out = { Skeletal: [], Dental: [], 'Soft Tissue': [], Other: [] }
    landmarks.forEach(lm => { out[classifyLandmark(lm.landmarkCode)].push(lm) })
    return out
  }, [landmarks])

  // ── Load OpenSeadragon dynamically ────────────────────────────────────────
  useEffect(() => {
    if (!imageUrl || !containerRef.current) return
    let cancelled = false

    const init = (OSD) => {
      if (cancelled || !containerRef.current) return
      if (osdRef.current) { osdRef.current.destroy(); osdRef.current = null }

      const viewer = OSD.default ? new OSD.default.Viewer({
        element: containerRef.current,
        tileSources: { type: 'image', url: imageUrl },
        showNavigationControl: false,
        showNavigator: false,
        animationTime: 0.25,
        blendTime: 0.1,
        minZoomImageRatio: 0.5,
        maxZoomPixelRatio: 12,
        visibilityRatio: 0.5,
        zoomPerScroll: 1.4,
        constrainDuringPan: false,
        background: C.bg,
        crossOriginPolicy: 'Anonymous',
      }) : (() => {
        const V = OSD
        return new V({
          element: containerRef.current,
          tileSources: { type: 'image', url: imageUrl },
          showNavigationControl: false,
          showNavigator: false,
          animationTime: 0.25,
          blendTime: 0.1,
          minZoomImageRatio: 0.5,
          maxZoomPixelRatio: 12,
          visibilityRatio: 0.5,
          zoomPerScroll: 1.4,
          constrainDuringPan: false,
          background: C.bg,
          crossOriginPolicy: 'Anonymous',
        })
      })()

      viewer.addHandler('open', () => {
        if (cancelled) return
        const item = viewer.world.getItemAt(0)
        if (item) {
          const s = item.getContentSize()
          imgNaturalRef.current = { w: s.x, h: s.y }
        }
        setOsdReady(true)
      })
      viewer.addHandler('open-failed', () => setOsdError(true))

      osdRef.current = viewer
    }

    // Try to load openseadragon
    if (window.OpenSeadragon) {
      init(window.OpenSeadragon)
      return
    }

    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/openseadragon/4.1.0/openseadragon.min.js'
    script.onload = () => { if (!cancelled) init(window.OpenSeadragon) }
    script.onerror = () => { if (!cancelled) setOsdError(true) }
    document.head.appendChild(script)

    return () => {
      cancelled = true
      if (osdRef.current) { osdRef.current.destroy(); osdRef.current = null }
    }
  }, [imageUrl])

  // Apply image filters via OSD tiledImage
  useEffect(() => {
    if (!osdRef.current || !osdReady) return
    const item = osdRef.current.world.getItemAt(0)
    if (!item) return
    const filters = []
    if (brightness !== 100 || contrast !== 100) {
      const b = brightness / 100
      const c = contrast / 100
      // We use CSS filter on the OSD canvas element as a fallback
    }
    // Apply CSS filter on the OSD container canvas
    const innerCanvas = containerRef.current?.querySelector('canvas')
    if (innerCanvas) {
      innerCanvas.style.filter = [
        `brightness(${brightness}%)`,
        `contrast(${contrast}%)`,
        invert ? 'invert(100%)' : '',
        flipH ? '' : '',
      ].filter(Boolean).join(' ')
      innerCanvas.style.transform = flipH ? 'scaleX(-1)' : ''
    }
  }, [brightness, contrast, invert, flipH, osdReady])

  // ── Overlay canvas sizing ─────────────────────────────────────────────────
  const resizeOverlay = useCallback(() => {
    const canvas = overlayCanvasRef.current
    const wrap = containerRef.current
    if (!canvas || !wrap) return
    const rect = wrap.getBoundingClientRect()
    canvas.width = rect.width
    canvas.height = rect.height
    canvas.style.width = rect.width + 'px'
    canvas.style.height = rect.height + 'px'
  }, [])

  useEffect(() => {
    const ro = new ResizeObserver(resizeOverlay)
    if (containerRef.current) ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [resizeOverlay])

  // ── Convert image-space px → canvas-space px ──────────────────────────────
  const imgToCanvas = useCallback((ix, iy) => {
    if (!osdRef.current || !osdReady) return { x: ix, y: iy }
    const vp = osdRef.current.viewport
    const nat = imgNaturalRef.current
    const imgPoint = new window.OpenSeadragon.Point(ix / nat.w, iy / nat.h)
    const vpPoint = vp.imageToViewportCoordinates(imgPoint)
    const px = vp.viewportToWindowCoordinates(vpPoint)
    const rect = containerRef.current.getBoundingClientRect()
    return { x: px.x - rect.left, y: px.y - rect.top }
  }, [osdReady])

  const canvasToImg = useCallback((cx, cy) => {
    if (!osdRef.current || !osdReady) return { x: cx, y: cy }
    const rect = containerRef.current.getBoundingClientRect()
    const winPt = new window.OpenSeadragon.Point(cx + rect.left, cy + rect.top)
    const vp = osdRef.current.viewport
    const vpPt = vp.windowToViewportCoordinates(winPt)
    const imgPt = vp.viewportToImageCoordinates(vpPt)
    const nat = imgNaturalRef.current
    return { x: imgPt.x * nat.w, y: imgPt.y * nat.h }
  }, [osdReady])

  // ── Draw overlay ──────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = overlayCanvasRef.current
    if (!canvas || !osdReady) return
    const ctx = canvas.getContext('2d')
    const W = canvas.width, H = canvas.height
    ctx.clearRect(0, 0, W, H)

    // Grid
    if (showGrid && osdRef.current) {
      const zoom = osdRef.current.viewport.getZoom(true)
      const step = Math.max(20, 60 / zoom)
      ctx.save()
      ctx.strokeStyle = 'rgba(255,255,255,0.04)'
      ctx.lineWidth = 0.5
      for (let x = 0; x < W; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke() }
      for (let y = 0; y < H; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke() }
      ctx.restore()
    }

    // Ruler
    if (rulerPts.length >= 2) {
      const [a, b] = rulerPts
      ctx.save()
      ctx.strokeStyle = C.amber; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4])
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
      ctx.setLineDash([])
        ;[a, b].forEach(p => {
          ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2)
          ctx.fillStyle = C.amber; ctx.fill()
        })
      const d = dist(a.x, a.y, b.x, b.y).toFixed(1)
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
      ctx.font = `bold 11px ${C.mono}`
      const tw = ctx.measureText(`${d}px`).width
      drawRR(ctx, mx - tw / 2 - 7, my - 19, tw + 14, 20, 4)
      ctx.fillStyle = 'rgba(0,0,0,0.78)'; ctx.fill()
      ctx.fillStyle = C.amber; ctx.fillText(`${d}px`, mx - tw / 2, my - 3)
      ctx.restore()
    }
    if (rulerPts.length === 1) {
      ctx.save()
      ctx.beginPath(); ctx.arc(rulerPts[0].x, rulerPts[0].y, 4, 0, Math.PI * 2)
      ctx.fillStyle = C.amber; ctx.fill(); ctx.restore()
    }

    // Angle
    if (anglePts.length > 0) {
      ctx.save()
      ctx.strokeStyle = C.violet; ctx.lineWidth = 1.5; ctx.fillStyle = C.violet
      ctx.beginPath()
      anglePts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y))
      ctx.stroke()
      anglePts.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill() })
      if (anglePts.length === 3) {
        const [a, b, c2] = anglePts
        const a1 = Math.atan2(a.y - b.y, a.x - b.x)
        const a2 = Math.atan2(c2.y - b.y, c2.x - b.x)
        let deg = Math.abs((a2 - a1) * 180 / Math.PI)
        if (deg > 180) deg = 360 - deg
        ctx.beginPath(); ctx.arc(b.x, b.y, 28, a1, a2)
        ctx.strokeStyle = 'rgba(139,92,246,0.3)'; ctx.lineWidth = 14; ctx.stroke()
        ctx.font = `bold 11px ${C.mono}`
        const label = `${deg.toFixed(1)}°`
        const tw = ctx.measureText(label).width
        drawRR(ctx, b.x - tw / 2 - 7, b.y + 14, tw + 14, 20, 4)
        ctx.fillStyle = 'rgba(0,0,0,0.78)'; ctx.fill()
        ctx.fillStyle = C.violet; ctx.fillText(label, b.x - tw / 2, b.y + 28)
      }
      ctx.restore()
    }

    // Anatomical Tracing
    if (showTracing) {
      TRACING_PATHS.forEach(path => {
        const pts = path.codes
          .map(c => landmarksRef.current.find(l => l.landmarkCode === c))
          .filter(Boolean)
          .map(l => imgToCanvas(l.xPx, l.yPx))

        if (pts.length < 2) return

        ctx.save()
        ctx.strokeStyle = path.color
        ctx.lineWidth = 1.8
        ctx.globalAlpha = path.opacity
        ctx.lineJoin = 'round'
        ctx.lineCap = 'round'

        ctx.beginPath()
        ctx.moveTo(pts[0].x, pts[0].y)

        // Draw using quadratic curves for smoothness
        for (let i = 1; i < pts.length - 2; i++) {
          const xc = (pts[i].x + pts[i + 1].x) / 2
          const yc = (pts[i].y + pts[i + 1].y) / 2
          ctx.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc)
        }

        // For the last 2 points
        if (pts.length > 2) {
          ctx.quadraticCurveTo(pts[pts.length - 2].x, pts[pts.length - 2].y, pts[pts.length - 1].x, pts[pts.length - 1].y)
        } else {
          ctx.lineTo(pts[1].x, pts[1].y)
        }

        ctx.stroke()
        ctx.restore()
      })
    }

    if (!showLandmarks) return

    // Landmarks
    landmarksRef.current.forEach(lm => {
      const grp = classifyLandmark(lm.landmarkCode)
      if (lockedGroups.has(grp)) return
      const dimBySearch = searchQuery && !lm.landmarkCode.toLowerCase().includes(searchQuery.toLowerCase()) && !lm.landmarkName?.toLowerCase().includes(searchQuery.toLowerCase())
      const dimByGroup = activeGroup && grp !== activeGroup
      const shouldDim = dimBySearch || dimByGroup

      const { x: sx, y: sy } = imgToCanvas(lm.xPx, lm.yPx)
      const isHov = hovered === lm.landmarkCode
      const isSel = selected === lm.landmarkCode
      const isDrag = dragging === lm.landmarkCode
      const grpColor = GROUP_COLORS[grp]
      const dotColor = lm.isManuallyAdjusted ? C.amber : grpColor
      const r = isSel || isHov ? DOT_R + 2.5 : DOT_R

      ctx.save()
      ctx.globalAlpha = shouldDim ? 0.18 : 1

      // Outer ring
      if (isSel) {
        ctx.beginPath(); ctx.arc(sx, sy, r + 7, 0, Math.PI * 2)
        ctx.strokeStyle = dotColor; ctx.lineWidth = 0.75
        ctx.globalAlpha = shouldDim ? 0.06 : 0.25; ctx.stroke()
        ctx.globalAlpha = shouldDim ? 0.18 : 1
      }

      // Crosshair
      if (showCrosshairs) {
        ctx.strokeStyle = dotColor; ctx.lineWidth = 0.6
        ctx.globalAlpha = shouldDim ? 0.08 : (isSel || isHov ? 0.55 : 0.3)
        ctx.beginPath()
        ctx.moveTo(sx - r - 6, sy); ctx.lineTo(sx + r + 6, sy)
        ctx.moveTo(sx, sy - r - 6); ctx.lineTo(sx, sy + r + 6)
        ctx.stroke()
        ctx.globalAlpha = shouldDim ? 0.18 : 1
      }

      // Fill
      ctx.shadowColor = dotColor; ctx.shadowBlur = isSel ? 14 : isHov ? 8 : 4
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2)
      ctx.fillStyle = isSel ? 'rgba(255,255,255,0.9)' : dotColor + '28'
      ctx.fill()
      ctx.strokeStyle = dotColor; ctx.lineWidth = isSel ? 1.8 : 1.3; ctx.stroke()
      ctx.shadowBlur = 0

      // Label
      const showLabel = showLabels && (isHov || isSel || (!dimBySearch && searchQuery) || (activeGroup && grp === activeGroup))
      if (showLabel) {
        const text = lm.landmarkCode + (lm.isManuallyAdjusted ? ' ✎' : '')
        ctx.font = `600 10px ${C.mono}`
        const tw = ctx.measureText(text).width
        const lx = sx + r + 9, ly = sy + 4
        drawRR(ctx, lx - 4, ly - 13, tw + 10, 16, 3)
        ctx.fillStyle = 'rgba(7,9,15,0.9)'; ctx.fill()
        ctx.strokeStyle = dotColor + '50'; ctx.lineWidth = 0.5; ctx.stroke()
        ctx.fillStyle = dotColor; ctx.fillText(text, lx + 1, ly - 0.5)
      }

      ctx.restore()
    })

    // Selected coord chip
    if (selected) {
      const lm = landmarksRef.current.find(l => l.landmarkCode === selected)
      if (lm) {
        const { x: sx, y: sy } = imgToCanvas(lm.xPx, lm.yPx)
        ctx.save()
        ctx.font = `500 9px ${C.mono}`
        const txt = `${lm.xPx.toFixed(0)}, ${lm.yPx.toFixed(0)}`
        const tw = ctx.measureText(txt).width
        drawRR(ctx, sx - tw / 2 - 6, sy + DOT_R + 12, tw + 12, 14, 3)
        ctx.fillStyle = 'rgba(7,9,15,0.88)'; ctx.fill()
        ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillText(txt, sx - tw / 2, sy + DOT_R + 22)
        ctx.restore()
      }
    }
  }, [
    osdReady, showLandmarks, showLabels, showCrosshairs, showGrid,
    rulerPts, anglePts, hovered, selected, dragging,
    lockedGroups, activeGroup, searchQuery, imgToCanvas,
  ])

  // Redraw on every OSD viewport update
  useEffect(() => {
    if (!osdReady || !osdRef.current) return
    const handler = () => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
      animRef.current = requestAnimationFrame(draw)
    }
    osdRef.current.addHandler('update-viewport', handler)
    osdRef.current.addHandler('animation', handler)
    handler()
    return () => {
      osdRef.current?.removeHandler('update-viewport', handler)
      osdRef.current?.removeHandler('animation', handler)
    }
  }, [osdReady, draw])

  useEffect(() => {
    if (animRef.current) cancelAnimationFrame(animRef.current)
    animRef.current = requestAnimationFrame(draw)
  }, [draw])

  // ── Hit test in canvas space ──────────────────────────────────────────────
  const hitTest = useCallback((cx, cy) => {
    for (const lm of [...landmarksRef.current].reverse()) {
      const { x, y } = imgToCanvas(lm.xPx, lm.yPx)
      if (dist(cx, cy, x, y) <= LANDMARK_HIT_PX) return lm
    }
    return null
  }, [imgToCanvas])

  // ── Pointer events on overlay canvas ────────────────────────────────────
  const getPos = (e) => {
    const r = overlayCanvasRef.current.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const onMouseMove = useCallback((e) => {
    const { x, y } = getPos(e)
    mouseCanvasRef.current = { x, y }

    if (dragging && !readOnly) {
      const ip = canvasToImg(x, y)
      onUpdate?.(dragging, ip.x, ip.y)
      draw()
      return
    }
    if (tool === 'ruler' || tool === 'angle') {
      overlayCanvasRef.current.style.cursor = 'crosshair'
      return
    }
    if (tool === 'pan') { overlayCanvasRef.current.style.cursor = 'grab'; return }

    if (showLandmarks) {
      const hit = hitTest(x, y)
      setHovered(hit?.landmarkCode ?? null)
      overlayCanvasRef.current.style.cursor = hit ? (readOnly ? 'default' : 'grab') : 'default'
    }
  }, [dragging, tool, showLandmarks, hitTest, canvasToImg, onUpdate, draw, readOnly])

  const onMouseDown = useCallback((e) => {
    if (e.button !== 0) return
    const { x, y } = getPos(e)

    if (tool === 'ruler') {
      setRulerPts(p => p.length >= 2 ? [{ x, y }] : [...p, { x, y }])
      return
    }
    if (tool === 'angle') {
      setAnglePts(p => p.length >= 3 ? [{ x, y }] : [...p, { x, y }])
      return
    }
    if (tool === 'pan' || !showLandmarks) return

    const hit = hitTest(x, y)
    if (hit) {
      e.stopPropagation()
      setSelected(hit.landmarkCode)
      if (!readOnly) setDragging(hit.landmarkCode)
    } else {
      setSelected(null)
    }
  }, [tool, showLandmarks, hitTest, readOnly])

  const onMouseUp = useCallback(() => {
    if (dragging) onUpdateEnd?.()
    setDragging(null)
  }, [dragging, onUpdateEnd])

  // ── Keyboard Shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return

      const key = e.key.toLowerCase()

      // Tool selection
      if (key === 's') setTool('select')
      if (key === 'h' || key === 'p') setTool('pan')
      if (key === 'r') { setTool('ruler'); setRulerPts([]) }
      if (key === 'a') { setTool('angle'); setAnglePts([]) }

      // Toggles
      if (key === 'b') setShowLandmarks(v => !v)
      if (key === 't') setShowTracing(v => !v)
      if (key === 'l') setShowLabels(v => !v)
      if (key === 'c') setShowCrosshairs(v => !v)
      if (key === 'g') setShowGrid(v => !v)
      if (key === 'i') setInvert(v => !v)

      // Actions
      if (key === 'f') fitImage()
      if (key === 'escape') { setSelected(null); setTool('select'); setRulerPts([]); setAnglePts([]) }

      // Micro-adjust
      if (selected && !readOnly && ['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        e.preventDefault()
        const lm = landmarksRef.current.find(l => l.landmarkCode === selected)
        if (!lm) return
        let { xPx: nx, yPx: ny } = lm
        const delta = e.shiftKey ? 5 : 1
        if (key === 'arrowup') ny -= delta
        if (key === 'arrowdown') ny += delta
        if (key === 'arrowleft') nx -= delta
        if (key === 'arrowright') nx += delta
        onUpdate?.(selected, nx, ny)
        onUpdateEnd?.()
      }
      // Undo/Redo
      if (key === 'z' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        if (e.shiftKey) onRedo?.()
        else onUndo?.()
      }
      if (key === 'y' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        onRedo?.()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selected, readOnly, onUpdate, onUndo, onRedo])

  // Disable OSD mouse navigation when over a landmark
  useEffect(() => {
    if (!osdReady || !osdRef.current) return
    const canvas = overlayCanvasRef.current
    if (!canvas) return

    const blockOSD = (e) => {
      if (tool === 'pan' || tool === 'ruler' || tool === 'angle') return
      const { x, y } = getPos(e)
      if (hitTest(x, y) || dragging) e.stopPropagation()
    }
    canvas.addEventListener('mousedown', blockOSD, true)
    return () => canvas.removeEventListener('mousedown', blockOSD, true)
  }, [osdReady, hitTest, dragging, tool])

  // ── Export ────────────────────────────────────────────────────────────────
  const exportImage = () => {
    const overlay = overlayCanvasRef.current
    if (!overlay) return
    const osdCanvas = containerRef.current?.querySelector('.openseadragon-canvas canvas') || containerRef.current?.querySelector('canvas')
    if (!osdCanvas) return
    const merged = document.createElement('canvas')
    merged.width = osdCanvas.width; merged.height = osdCanvas.height
    const ctx = merged.getContext('2d')
    ctx.drawImage(osdCanvas, 0, 0)
    ctx.drawImage(overlay, 0, 0)
    const link = document.createElement('a')
    link.download = 'cephalometric.png'
    link.href = merged.toDataURL('image/png')
    link.click()
  }

  const fitImage = () => {
    if (!osdRef.current) return
    osdRef.current.viewport.goHome(true)
  }

  const selectedLm = useMemo(() => landmarks.find(l => l.landmarkCode === selected), [landmarks, selected])

  const filteredLandmarks = useMemo(() => {
    if (!searchQuery) return landmarks
    const q = searchQuery.toLowerCase()
    return landmarks.filter(l => l.landmarkCode.toLowerCase().includes(q) || l.landmarkName?.toLowerCase().includes(q))
  }, [landmarks, searchQuery])

  // ── Toolbar button style ──────────────────────────────────────────────────
  const tb = (active = false) => ({
    width: 30, height: 30, borderRadius: C.r, border: 'none', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', outline: 'none',
    background: active ? C.tealDim : 'transparent',
    color: active ? C.teal : C.text2,
    transition: 'all 0.15s',
  })

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%', background: C.bg, fontFamily: C.sans, overflow: 'hidden' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        .osd-wrap * { outline: none !important; }
        .osd-wrap .openseadragon-canvas { background: ${C.bg} !important; }
      `}</style>

      {/* ── Viewer column ── */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {/* OSD mount */}
        <div
          ref={containerRef}
          className="osd-wrap"
          style={{ position: 'absolute', inset: 0, background: C.bg }}
        />

        {/* Overlay canvas — pointer events only for select/ruler/angle */}
        <canvas
          ref={overlayCanvasRef}
          style={{
            position: 'absolute', inset: 0, pointerEvents:
              (tool === 'pan' || !osdReady) ? 'none' : 'all',
          }}
          onMouseMove={onMouseMove}
          onMouseDown={onMouseDown}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
        />

        {/* OSD not ready / error */}
        {!osdReady && !osdError && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, pointerEvents: 'none' }}>
            <div style={{ width: 28, height: 28, border: `2px solid ${C.tealBorder}`, borderTopColor: C.teal, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <span style={{ fontSize: 11, color: C.text2, letterSpacing: '0.08em', fontFamily: C.mono }}>LOADING RADIOGRAPH</span>
          </div>
        )}
        {osdError && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 12, color: C.red, fontFamily: C.mono }}>Failed to load image</span>
          </div>
        )}

        {/* ── Top toolbar ── */}
        <div style={{
          position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', gap: 2, alignItems: 'center',
          background: 'rgba(7,9,15,0.88)', backdropFilter: 'blur(14px)',
          borderRadius: 40, padding: '5px 12px',
          border: `1px solid ${C.borderMed}`,
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          zIndex: 30,
        }}>
          {/* Tools */}
          <button style={tb(tool === 'select')} onClick={() => setTool('select')} title="Select (S)"><Crosshair size={13} /></button>
          <button style={tb(tool === 'pan')} onClick={() => setTool('pan')} title="Pan (Space)"><Hand size={13} /></button>
          <button style={tb(tool === 'ruler')} onClick={() => { setTool(t => t === 'ruler' ? 'select' : 'ruler'); setRulerPts([]) }} title="Measure (R)"><Ruler size={13} /></button>
          <button style={tb(tool === 'angle')} onClick={() => { setTool(t => t === 'angle' ? 'select' : 'angle'); setAnglePts([]) }} title="Angle (A)"><Triangle size={13} /></button>

          <div style={{ width: 1, height: 18, background: C.border, margin: '0 4px' }} />

          {/* Zoom */}
          <button style={tb()} onClick={() => osdRef.current?.viewport.zoomBy(1 / 1.4)} title="Zoom out"><ZoomOut size={13} /></button>
          <button style={tb()} onClick={() => osdRef.current?.viewport.zoomBy(1.4)} title="Zoom in"><ZoomIn size={13} /></button>
          <button style={tb()} onClick={fitImage} title="Fit"><Maximize2 size={12} /></button>

          <div style={{ width: 1, height: 18, background: C.border, margin: '0 4px' }} />

          {/* History */}
          <button onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)" style={{ ...tb(), opacity: canUndo ? 1 : 0.3 }}><Undo2 size={13} /></button>
          <button onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Y)" style={{ ...tb(), opacity: canRedo ? 1 : 0.3 }}><Redo2 size={13} /></button>

          <div style={{ width: 1, height: 18, background: C.border, margin: '0 4px' }} />

          {/* Image */}
          <button style={tb(flipH)} onClick={() => setFlipH(v => !v)} title="Flip H"><FlipHorizontal2 size={13} /></button>
          <button style={tb(invert)} onClick={() => setInvert(v => !v)} title="Invert"><ScanLine size={13} /></button>
          <button style={tb(filterOpen)} onClick={() => setFilterOpen(v => !v)} title="Filters"><Sliders size={13} /></button>

          <div style={{ width: 1, height: 18, background: C.border, margin: '0 4px' }} />

          {/* Visibility */}
          <button style={tb(!showLandmarks)} onClick={() => setShowLandmarks(v => !v)} title="Landmarks (B)">
            {showLandmarks ? <Eye size={13} /> : <EyeOff size={13} />}
          </button>
          <button style={tb(showTracing)} onClick={() => setShowTracing(v => !v)} title="Tracing (T)"><Triangle size={13} /></button>
          <button style={tb(showGrid)} onClick={() => setShowGrid(v => !v)} title="Grid (G)"><Grid3X3 size={13} /></button>

          <div style={{ width: 1, height: 18, background: C.border, margin: '0 4px' }} />

          <button style={tb()} onClick={() => { setBrightness(100); setContrast(100); setInvert(false); setFlipH(false); setRulerPts([]); setAnglePts([]); fitImage() }} title="Reset"><RotateCcw size={12} /></button>
          <button style={tb()} onClick={exportImage} title="Export PNG"><Download size={12} /></button>
          <button style={tb(panelOpen)} onClick={() => setPanelOpen(v => !v)} title="Panel"><Layers size={13} /></button>
        </div>

        {/* ── Filter strip ── */}
        {filterOpen && (
          <div style={{
            position: 'absolute', top: 56, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(7,9,15,0.92)', backdropFilter: 'blur(14px)',
            borderRadius: C.rLg, padding: '10px 18px',
            border: `1px solid ${C.borderMed}`,
            zIndex: 30, display: 'flex', gap: 24, alignItems: 'center',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}>
            <div style={{ display: 'flex', gap: 15, borderRight: `1px solid ${C.border}`, paddingRight: 15 }}>
              {[
                { label: 'Normal', b: 100, c: 100, i: false },
                { label: 'Bone', b: 90, c: 150, i: false },
                { label: 'Soft', b: 130, c: 80, i: false },
                { label: 'Invert', b: 100, c: 100, i: true },
              ].map(p => (
                <button key={p.label} onClick={() => { setBrightness(p.b); setContrast(p.c); setInvert(p.i) }} style={{
                  padding: '4px 9px', borderRadius: 4, border: `1px solid ${C.border}`,
                  background: 'rgba(255,255,255,0.03)', color: C.text1, fontSize: 9,
                  fontFamily: C.mono, cursor: 'pointer', transition: 'all 0.1s',
                }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = C.teal}
                  onMouseLeave={e => e.currentTarget.style.borderColor = C.border}
                >{p.label}</button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
              {[
                { label: 'Brightness', val: brightness, set: setBrightness, min: 20, max: 260, color: '#fbbf24' },
                { label: 'Contrast', val: contrast, set: setContrast, min: 20, max: 260, color: C.violet },
              ].map(({ label, val, set, min, max, color }) => (
                <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'center' }}>
                  <span style={{ fontSize: 9, color: C.text2, fontFamily: C.mono, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</span>
                  <input type="range" min={min} max={max} value={val} onChange={e => set(Number(e.target.value))}
                    style={{ width: 80, accentColor: color }} />
                  <span style={{ fontSize: 10, color, fontFamily: C.mono, fontWeight: 700 }}>{val}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Legend ── */}
        <div style={{
          position: 'absolute', top: 12, left: 12,
          background: 'rgba(7,9,15,0.82)', backdropFilter: 'blur(10px)',
          borderRadius: C.rLg, padding: '9px 13px',
          border: `1px solid ${C.border}`,
          display: 'flex', flexDirection: 'column', gap: 5,
          fontSize: 10, color: C.text2, fontFamily: C.mono,
          zIndex: 20,
        }}>
          {[
            { color: C.teal, label: 'AI detected' },
            { color: C.amber, label: 'Manual' },
            { color: C.violet, label: 'Hovered' },
          ].map(({ color, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, boxShadow: `0 0 5px ${color}90` }} />
              <span>{label}</span>
            </div>
          ))}
          {tool === 'ruler' && <div style={{ marginTop: 4, color: C.amber, fontSize: 9 }}>Click 2 pts to measure</div>}
          {tool === 'angle' && <div style={{ marginTop: 4, color: C.violet, fontSize: 9 }}>Click 3 pts for angle</div>}
        </div>

        {/* ── Selected card ── */}
        {selectedLm && (
          <div style={{
            position: 'absolute', top: 12, right: panelOpen ? 260 + 16 : 12,
            background: 'rgba(7,9,15,0.92)', backdropFilter: 'blur(12px)',
            borderRadius: C.rLg, padding: '12px 15px',
            border: `1px solid ${C.tealBorder}`,
            minWidth: 160, transition: 'right 0.25s ease',
            zIndex: 20, boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.teal, fontFamily: C.mono, marginBottom: 1 }}>{selectedLm.landmarkCode}</div>
                <div style={{ fontSize: 10, color: C.text2, fontFamily: C.mono }}>{selectedLm.landmarkName}</div>
              </div>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: GROUP_COLORS[classifyLandmark(selectedLm.landmarkCode)] }} />
            </div>

            {LANDMARK_INFO[selectedLm.landmarkCode] && (
              <div style={{ margin: '8px 0', padding: '8px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 6, border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 9, color: C.teal, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4, letterSpacing: '0.05em' }}>Clinical Definition</div>
                <div style={{ fontSize: 10, color: C.text1, lineHeight: 1.5 }}>{LANDMARK_INFO[selectedLm.landmarkCode].desc}</div>
              </div>
            )}

            <div style={{ fontSize: 10, color: C.text1, fontFamily: C.mono, lineHeight: 1.9 }}>
              <span style={{ color: C.text2 }}>X </span>{Number(selectedLm.xPx).toFixed(1)}<br />
              <span style={{ color: C.text2 }}>Y </span>{Number(selectedLm.yPx).toFixed(1)}
            </div>

            {selectedLm.confidenceScore != null && (
              <div style={{ marginTop: 9 }}>
                <div style={{ height: 2, borderRadius: 1, background: 'rgba(255,255,255,0.06)', overflow: 'hidden', marginBottom: 3 }}>
                  <div style={{
                    height: '100%', borderRadius: 1,
                    width: `${(selectedLm.confidenceScore * 100).toFixed(0)}%`,
                    background: selectedLm.confidenceScore > 0.9 ? C.green : C.amber,
                  }} />
                </div>
                <span style={{ fontSize: 9, color: selectedLm.confidenceScore > 0.9 ? C.green : C.amber, fontFamily: C.mono }}>
                  {(selectedLm.confidenceScore * 100).toFixed(0)}% confidence
                </span>
              </div>
            )}
            {selectedLm.isManuallyAdjusted && (
              <div style={{ marginTop: 7, fontSize: 9, color: C.amber, fontFamily: C.mono }}>✎ Manually adjusted</div>
            )}

            {!readOnly && (
              <div style={{ marginTop: 12, paddingTop: 8, borderTop: `1px solid ${C.border}`, display: 'flex', gap: 6 }}>
                <button
                  onClick={() => setSelected(null)}
                  style={{ flex: 1, padding: '4px 0', fontSize: 9, color: C.text2, background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 4, cursor: 'pointer' }}
                >Deselect</button>
              </div>
            )}
          </div>
        )}

        {/* ── Bottom status ── */}
        <div style={{
          position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(7,9,15,0.82)', backdropFilter: 'blur(12px)',
          borderRadius: 30, padding: '5px 14px',
          border: `1px solid ${C.border}`,
          display: 'flex', gap: 10, alignItems: 'center', zIndex: 20,
          fontSize: 10, fontFamily: C.mono, whiteSpace: 'nowrap',
        }}>
          <span style={{ color: C.text2 }}>{landmarks.length} landmarks</span>
          <div style={{ width: 1, height: 12, background: C.border }} />
          <span style={{ color: C.teal }}>{landmarks.filter(l => l.isManuallyAdjusted).length} adjusted</span>
          <div style={{ width: 1, height: 12, background: C.border }} />
          <span style={{ color: C.text2 }}>{hovered || selected || tool}</span>
        </div>
      </div>

      {/* ── Side panel ── */}
      {panelOpen && (
        <div style={{
          width: 256, flexShrink: 0, display: 'flex', flexDirection: 'column',
          background: C.surface, borderLeft: `1px solid ${C.border}`, overflow: 'hidden',
        }}>
          {/* Search */}
          <div style={{ padding: '11px 11px 8px', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'rgba(255,255,255,0.03)', borderRadius: C.r, padding: '6px 10px', border: `1px solid ${C.border}` }}>
              <Search size={11} color={C.text2} />
              <input
                value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search landmarks…"
                style={{ background: 'none', border: 'none', outline: 'none', fontSize: 11, color: C.text0, fontFamily: C.mono, width: '100%' }}
              />
            </div>
          </div>

          {/* Group filters */}
          <div style={{ padding: '7px 11px', display: 'flex', flexWrap: 'wrap', gap: 4, borderBottom: `1px solid ${C.border}` }}>
            {Object.entries(GROUP_COLORS).map(([grp, col]) => {
              if (!groups[grp]?.length) return null
              const active = activeGroup === grp
              return (
                <button key={grp} onClick={() => setActiveGroup(g => g === grp ? null : grp)} style={{
                  padding: '2px 8px', borderRadius: 20, border: `1px solid ${active ? col + '60' : C.border}`,
                  background: active ? col + '18' : 'transparent', color: active ? col : C.text2,
                  fontSize: 9, fontFamily: C.mono, cursor: 'pointer', fontWeight: active ? 700 : 400,
                }}>
                  {grp} {groups[grp].length}
                </button>
              )
            })}
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
            {Object.entries(groups).map(([grpName, lms]) => {
              if (!lms.length) return null
              const col = GROUP_COLORS[grpName]
              const isLocked = lockedGroups.has(grpName)
              const visible = searchQuery ? lms.filter(l =>
                l.landmarkCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
                l.landmarkName?.toLowerCase().includes(searchQuery.toLowerCase())
              ) : lms
              if (!visible.length) return null
              return (
                <div key={grpName}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 11px 3px', position: 'sticky', top: 0, background: C.surface, borderBottom: `1px solid ${C.border}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9, fontWeight: 700, color: col, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: C.mono }}>
                      <div style={{ width: 5, height: 5, borderRadius: '50%', background: col }} />
                      {grpName} <span style={{ color: C.text3, fontWeight: 400 }}>{visible.length}</span>
                    </div>
                    <button onClick={() => setLockedGroups(s => { const n = new Set(s); n.has(grpName) ? n.delete(grpName) : n.add(grpName); return n })}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: isLocked ? C.red : C.text3, padding: 2 }}>
                      {isLocked ? <Lock size={10} /> : <Unlock size={10} />}
                    </button>
                  </div>
                  {visible.map(lm => {
                    const isSel = selected === lm.landmarkCode
                    return (
                      <div key={lm.id ?? lm.landmarkCode}
                        onClick={() => setSelected(c => c === lm.landmarkCode ? null : lm.landmarkCode)}
                        onMouseEnter={() => setHovered(lm.landmarkCode)}
                        onMouseLeave={() => setHovered(null)}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 11px', cursor: 'pointer', background: isSel ? C.tealDim : 'transparent', borderLeft: `2px solid ${isSel ? C.teal : 'transparent'}`, transition: 'all 0.1s' }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: lm.isManuallyAdjusted ? C.amber : col, boxShadow: isSel ? `0 0 5px ${col}` : 'none' }} />
                        <span style={{ fontSize: 11, fontWeight: 700, color: isSel ? C.teal : C.text1, minWidth: 28, fontFamily: C.mono }}>{lm.landmarkCode}</span>
                        <span style={{ fontSize: 10, color: C.text2, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: C.mono }}>{lm.landmarkName}</span>
                        {lm.confidenceScore != null && (
                          <div style={{ width: 24, height: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 1, overflow: 'hidden', flexShrink: 0 }}>
                            <div style={{ height: '100%', background: lm.confidenceScore > 0.9 ? C.green : C.amber, width: `${lm.confidenceScore * 100}%` }} />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>

          {/* Footer stats */}
          <div style={{ padding: '9px 11px', borderTop: `1px solid ${C.border}`, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {[
              { label: 'Total', value: landmarks.length, color: C.text2 },
              { label: 'Adjusted', value: landmarks.filter(l => l.isManuallyAdjusted).length, color: C.amber },
              { label: 'High conf', value: landmarks.filter(l => (l.confidenceScore ?? 1) > 0.9).length, color: C.green },
              { label: 'Low conf', value: landmarks.filter(l => l.confidenceScore != null && l.confidenceScore < 0.75).length, color: C.red },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: 'rgba(255,255,255,0.025)', borderRadius: C.r, padding: '5px 8px' }}>
                <div style={{ fontSize: 9, color: C.text3, marginBottom: 2, fontFamily: C.mono }}>{label}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color, fontFamily: C.mono }}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}