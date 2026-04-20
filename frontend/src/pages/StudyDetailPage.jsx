import { useState, useRef, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { studiesApi, imagesApi, analysisApi } from '../api/client'
import { useDropzone } from 'react-dropzone'
import {
  ArrowLeft, Upload, ImageIcon, Zap, Activity, Target, RotateCcw, ChevronRight,
  ZoomIn, ZoomOut, Maximize2, Move, Hand, Focus, Info, CheckCircle
} from 'lucide-react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'

function CalibrationModal({ image, onClose, onDone }) {
  const [knownDistanceMm, setKnownDistanceMm] = useState(10)
  const [points, setPoints] = useState([]) // array of {x, y} px
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [imgLoaded, setImgLoaded] = useState(false)
  const [showLoupe, setShowLoupe] = useState(true)
  const [hoverPos, setHoverPos] = useState(null)
  const [panning, setPanning] = useState(null)

  const canvasRef = useRef(null)
  const imgRef = useRef(new Image())
  const rafRef = useRef(null)

  const mutation = useMutation({
    mutationFn: d => imagesApi.calibrate(image.id, d),
    onSuccess: () => { toast.success('Image calibrated!'); onDone() },
    onError: err => toast.error(err.response?.data?.error || 'Calibration failed'),
  })

  // Load image
  useEffect(() => {
    const url = image.storageUrl?.startsWith('http') ? image.storageUrl : (image.storageUrl?.startsWith('uploads/') ? `/${image.storageUrl}` : `/uploads/${image.storageUrl}`)
    imgRef.current.src = url
    imgRef.current.onload = () => {
      setImgLoaded(true)
    }
  }, [image.storageUrl])

  useEffect(() => {
    if (imgLoaded) fitImage()
  }, [imgLoaded])

  const fitImage = () => {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img || !img.naturalWidth) return
    const s = Math.min(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight) * 0.9
    setScale(s)
    setOffset({
      x: (canvas.width - img.naturalWidth * s) / 2,
      y: (canvas.height - img.naturalHeight * s) / 2
    })
  }

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !imgLoaded) return
    const ctx = canvas.getContext('2d')
    const W = canvas.width, H = canvas.height
    ctx.clearRect(0, 0, W, H)

    // Background
    ctx.fillStyle = '#0a0c10'
    ctx.fillRect(0, 0, W, H)

    ctx.save()
    ctx.translate(offset.x, offset.y)
    ctx.scale(scale, scale)
    ctx.drawImage(img, 0, 0)
    ctx.restore()

    // Draw Points and Line
    if (points.length > 0) {
      ctx.save()
      ctx.strokeStyle = '#22d3ee'
      ctx.lineWidth = 2
      ctx.fillStyle = '#22d3ee'

      // Line
      if (points.length === 2) {
        ctx.beginPath()
        ctx.moveTo(points[0].x * scale + offset.x, points[0].y * scale + offset.y)
        ctx.lineTo(points[1].x * scale + offset.x, points[1].y * scale + offset.y)
        ctx.setLineDash([5, 5])
        ctx.stroke()
        ctx.setLineDash([])
      }

      // Points
      points.forEach((p, i) => {
        const sx = p.x * scale + offset.x
        const sy = p.y * scale + offset.y
        ctx.beginPath()
        ctx.arc(sx, sy, 5, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 2
        ctx.stroke()
        
        // Label
        ctx.fillStyle = '#fff'
        ctx.font = 'bold 10px sans-serif'
        ctx.fillText(`P${i+1}`, sx + 8, sy - 8)
      })
      ctx.restore()
    }

    // Loupe
    if (showLoupe && hoverPos && imgLoaded) {
      const L_RADIUS = 70
      const L_ZOOM = 3
      const { x, y } = hoverPos

      ctx.save()
      ctx.beginPath()
      ctx.arc(x, y - L_RADIUS - 20, L_RADIUS, 0, Math.PI * 2)
      ctx.clip()
      
      ctx.fillStyle = '#000'
      ctx.fillRect(x - L_RADIUS, y - L_RADIUS * 2 - 20, L_RADIUS * 2, L_RADIUS * 2)

      const srcX = (x - offset.x) / scale
      const srcY = (y - offset.y) / scale

      ctx.translate(x, y - L_RADIUS - 20)
      ctx.scale(L_ZOOM, L_ZOOM)
      ctx.translate(-srcX, -srcY)
      ctx.drawImage(img, 0, 0)
      ctx.restore()

      // Loupe Border
      ctx.save()
      ctx.beginPath()
      ctx.arc(x, y - L_RADIUS - 20, L_RADIUS, 0, Math.PI * 2)
      ctx.strokeStyle = '#22d3ee'
      ctx.lineWidth = 3
      ctx.stroke()
      
      // Crosshair in Loupe
      ctx.beginPath()
      ctx.moveTo(x - 10, y - L_RADIUS - 20)
      ctx.lineTo(x + 10, y - L_RADIUS - 20)
      ctx.moveTo(x, y - L_RADIUS - 30)
      ctx.lineTo(x, y - L_RADIUS - 10)
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.restore()
    }
  }, [offset, scale, points, imgLoaded, showLoupe, hoverPos])

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ro = new ResizeObserver(() => {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
      fitImage()
    })
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [imgLoaded])

  const getCanvasPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const handleMouseDown = (e) => {
    const pos = getCanvasPos(e)
    if (e.button === 1 || e.button === 2) {
      setPanning({ x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y })
    } else if (points.length < 2) {
      const pxX = (pos.x - offset.x) / scale
      const pxY = (pos.y - offset.y) / scale
      setPoints([...points, { x: pxX, y: pxY }])
    }
  }

  const handleMouseMove = (e) => {
    const pos = getCanvasPos(e)
    setHoverPos(pos)
    if (panning) {
      setOffset({
        x: panning.ox + (e.clientX - panning.x),
        y: panning.oy + (e.clientY - panning.y)
      })
    }
  }

  const handleWheel = (e) => {
    e.preventDefault()
    const pos = getCanvasPos(e)
    const factor = e.deltaY < 0 ? 1.1 : 0.9
    const newScale = Math.max(0.1, Math.min(20, scale * factor))
    
    setOffset({
      x: pos.x - (pos.x - offset.x) * (newScale / scale),
      y: pos.y - (pos.y - offset.y) * (newScale / scale)
    })
    setScale(newScale)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (points.length !== 2) {
      toast.error('Please select exactly two points on the image.')
      return
    }
    mutation.mutate({
      knownDistanceMm,
      point1: { x: points[0].x, y: points[0].y },
      point2: { x: points[1].x, y: points[1].y }
    })
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 1000, width: '95%', background: '#0b0f1a', border: '1px solid rgba(255,255,255,0.1)' }}>
        <div className="modal-header" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="modal-title" style={{ color: '#06b6d4' }}><Target size={18} /> Advanced Calibration</div>
          <div style={{ display: 'flex', gap: 12 }}>
             <button className="btn btn-ghost btn-sm" onClick={() => setShowLoupe(!showLoupe)}>
               {showLoupe ? <Focus size={14} color="#06b6d4" /> : <Focus size={14} />} Loupe
             </button>
             <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
          </div>
        </div>

        <div style={{ display: 'flex', height: 600 }}>
          {/* Main Canvas Area */}
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#000' }}>
            <canvas
              ref={canvasRef}
              style={{ width: '100%', height: '100%', cursor: points.length < 2 ? 'crosshair' : 'grab' }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={() => setPanning(null)}
              onMouseLeave={() => { setPanning(null); setHoverPos(null) }}
              onWheel={handleWheel}
              onContextMenu={e => e.preventDefault()}
            />
            
            {/* Instruction Overlay */}
            <div style={{
              position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(0,0,0,0.7)', padding: '8px 16px', borderRadius: 20,
              fontSize: 12, color: '#fff', backdropFilter: 'blur(4px)', border: '1px solid rgba(255,255,255,0.1)',
              pointerEvents: 'none', display: 'flex', alignItems: 'center', gap: 8
            }}>
              {points.length === 0 && <><Info size={14} color="#06b6d4" /> Click the first point on the ruler</>}
              {points.length === 1 && <><Info size={14} color="#06b6d4" /> Click the second point on the ruler</>}
              {points.length === 2 && <><CheckCircle size={14} color="#10b981" /> Points set. Enter distance below.</>}
            </div>

            {/* Scale Indicator */}
            <div style={{ position: 'absolute', bottom: 20, left: 20, fontSize: 10, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}>
              ZOOM: {(scale * 100).toFixed(0)}% | SPACE+DRAG TO PAN
            </div>
          </div>

          {/* Controls Panel */}
          <div style={{ width: 300, background: '#0f172a', padding: 24, display: 'flex', flexDirection: 'column', borderLeft: '1px solid rgba(255,255,255,0.05)' }}>
            <h4 style={{ margin: '0 0 16px 0', fontSize: 14, color: '#94a3b8' }}>CALIBRATION DATA</h4>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
              <div style={{ background: '#1e293b', padding: 12, borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>POINT 1</div>
                <div style={{ fontSize: 13, color: points[0] ? '#e2e8f0' : '#475569' }}>
                  {points[0] ? `${points[0].x.toFixed(1)}, ${points[0].y.toFixed(1)} px` : 'Not set'}
                </div>
              </div>
              <div style={{ background: '#1e293b', padding: 12, borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>POINT 2</div>
                <div style={{ fontSize: 13, color: points[1] ? '#e2e8f0' : '#475569' }}>
                  {points[1] ? `${points[1].x.toFixed(1)}, ${points[1].y.toFixed(1)} px` : 'Not set'}
                </div>
              </div>
              {points.length === 2 && (
                <div style={{ background: 'rgba(6,182,212,0.1)', padding: 12, borderRadius: 8, border: '1px solid rgba(6,182,212,0.2)' }}>
                  <div style={{ fontSize: 11, color: '#06b6d4', marginBottom: 4 }}>PIXEL DISTANCE</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>
                    {Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y).toFixed(2)} px
                  </div>
                </div>
              )}
            </div>

            <form onSubmit={handleSubmit} style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div className="form-group" style={{ marginBottom: 24 }}>
                <label className="form-label" style={{ color: '#94a3b8' }}>Known Distance (mm)</label>
                <input 
                  className="form-control" 
                  type="number" 
                  step="0.1" min="1" 
                  style={{ background: '#1e293b', border: '1px solid #334155', color: '#fff' }}
                  value={knownDistanceMm} 
                  onChange={e => setKnownDistanceMm(parseFloat(e.target.value) || 0)} 
                  required 
                  disabled={points.length !== 2}
                />
              </div>

              <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setPoints([])} style={{ justifyContent: 'center' }}>
                  <RotateCcw size={14} /> Reset Points
                </button>
                <button type="submit" className="btn btn-primary" disabled={mutation.isPending || points.length !== 2} style={{ height: 44, fontSize: 15 }}>
                  {mutation.isPending ? 'Saving…' : 'Finalize Calibration'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}

function AnalysisTypeModal({ imageId, onClose, onRun }) {
  const [analysisType, setAnalysisType] = useState('Steiner')
  
  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title"><Activity size={18} /> Select Analysis Type</div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="form-group">
          <label className="form-label">Analysis Type</label>
          <select className="form-control" value={analysisType} onChange={e => setAnalysisType(e.target.value)}>
            <option value="Steiner">Steiner Analysis</option>
            <option value="McNamara">McNamara Analysis</option>
            <option value="Tweed">Tweed Analysis</option>
          </select>
        </div>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          The AI will automatically detect the necessary landmarks and perform the selected cephalometric analysis, including diagnosis and treatment planning.
        </p>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => onRun(analysisType)}>
            <Zap size={14} /> Run Pipeline
          </button>
        </div>
      </div>
    </div>
  )
}

export default function StudyDetailPage() {
  const { studyId } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [calibModal, setCalibModal] = useState(null) // image object
  const [analysisModal, setAnalysisModal] = useState(null) // imageId
  const [runningPipeline, setRunningPipeline] = useState(null)

  const { data: study, isLoading: sLoad } = useQuery({
    queryKey: ['study', studyId],
    queryFn: () => studiesApi.get(studyId).then(r => r.data),
  })

  const { data: images, isLoading: iLoad } = useQuery({
    queryKey: ['images', studyId],
    queryFn: () => imagesApi.listForStudy(studyId).then(r => r.data),
  })

  const uploadMutation = useMutation({
    mutationFn: ({ file }) => imagesApi.upload(studyId, file),
    onSuccess: () => { toast.success('X-ray uploaded!'); qc.invalidateQueries(['images', studyId]) },
    onError: err => toast.error(err.response?.data?.error || 'Upload failed'),
  })

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.dcm', '.bmp'] },
    maxSize: 100 * 1024 * 1024,
    onDrop: ([file]) => file && uploadMutation.mutate({ file }),
  })

  const runPipeline = async (imageId, analysisType) => {
    setAnalysisModal(null)
    setRunningPipeline(imageId)
    try {
      const { data } = await analysisApi.fullPipeline(imageId, analysisType)
      toast.success('AI analysis complete!')
      navigate(`/analysis/${data.session.id}`)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Pipeline failed')
    } finally {
      setRunningPipeline(null)
    }
  }

  if (sLoad) return <div className="page"><div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><div className="spinner" /></div></div>

  const statusColor = s => ({ Active: 'badge-success', Completed: 'badge-accent', Pending: 'badge-warning' }[s] ?? 'badge-muted')

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button className="btn btn-ghost btn-icon" onClick={() => navigate(`/patients/${study?.patient?.id ?? ''}`)}>
          <ArrowLeft size={18} />
        </button>
        <div style={{ flex: 1 }}>
          <h1 style={{ marginBottom: 2 }}>{study?.studyType ?? 'Study'}</h1>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span className={`badge ${statusColor(study?.status)}`}>{study?.status}</span>
            {study?.createdAt && <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Created {format(new Date(study.createdAt), 'dd MMM yyyy')}</span>}
          </div>
        </div>
      </div>

      {/* Upload Zone */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-title" style={{ marginBottom: 16 }}><Upload size={16} color="var(--accent-primary)" /> Upload X-Ray Image</div>
        <div {...getRootProps()} className={`dropzone ${isDragActive ? 'active' : ''} ${uploadMutation.isPending ? 'active' : ''}`}>
          <input {...getInputProps()} id="xray-upload-input" />
          <div className="dropzone-icon"><Upload size={32} /></div>
          {uploadMutation.isPending
            ? <div className="dropzone-text">Uploading…</div>
            : isDragActive
              ? <div className="dropzone-text">Drop to upload</div>
              : <><div className="dropzone-text">Drag & drop an X-ray, or <strong style={{ color: 'var(--accent-primary)' }}>click to browse</strong></div>
                  <div className="dropzone-hint">Supports JPG, PNG, BMP, DICOM · Max 100 MB</div></>}
        </div>
      </div>

      {/* Images list */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="card-title"><ImageIcon size={16} color="var(--accent-primary)" /> X-Ray Images</div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{images?.length ?? 0} images</span>
        </div>

        {iLoad ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><div className="spinner" /></div>
        ) : !images?.length ? (
          <div className="empty-state">
            <ImageIcon size={40} />
            <h3>No images uploaded</h3>
            <p>Upload a cephalometric X-ray above to begin AI analysis.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20, padding: 24 }}>
            {images.map(img => (
              <div key={img.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {/* Thumbnail */}
                <div style={{ background: '#000', aspectRatio: '4/3', overflow: 'hidden', position: 'relative' }}>
                  <img
                    src={img.storageUrl?.startsWith('http') ? img.storageUrl : (img.storageUrl?.startsWith('uploads/') ? `/${img.storageUrl}` : `/uploads/${img.storageUrl}`)}
                    alt="X-ray"
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    onError={e => { e.target.style.display = 'none' }}
                  />
                  <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 6 }}>
                    <span className={`badge ${img.isCalibrated ? 'badge-success' : 'badge-warning'}`}>
                      {img.isCalibrated ? '✓ Calibrated' : 'Uncalibrated'}
                    </span>
                  </div>
                </div>

                <div style={{ padding: 16 }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 12 }}>
                    {img.originalFileName} · {format(new Date(img.uploadedAt), 'dd MMM yyyy')}
                    {img.pixelSpacingMm && <> · <code style={{ color: 'var(--accent-primary)' }}>{img.pixelSpacingMm.toFixed(3)} mm/px</code></>}
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {!img.isCalibrated && (
                      <button id={`cal-btn-${img.id}`} className="btn btn-secondary btn-sm" onClick={() => setCalibModal(img)}>
                        <Target size={13} /> Calibrate
                      </button>
                    )}
                    <button
                      id={`run-btn-${img.id}`}
                      className="btn btn-primary btn-sm"
                      disabled={!img.isCalibrated || runningPipeline === img.id}
                      title={!img.isCalibrated ? 'Calibrate first' : 'Run AI full pipeline'}
                      onClick={() => setAnalysisModal(img.id)}
                    >
                      {runningPipeline === img.id
                        ? <><div className="spinner" style={{ width: 13, height: 13, borderWidth: 2 }} /> Analyzing…</>
                        : <><Zap size={13} /> Run AI</>}
                    </button>
                    <button id={`view-sessions-${img.id}`} className="btn btn-ghost btn-sm" onClick={async () => {
                      try {
                        const { data } = await analysisApi.getLatestSession(img.id)
                        navigate(`/analysis/${data.id}`)
                      } catch { toast.error('No analysis session found') }
                    }}>
                      <Activity size={13} /> Sessions <ChevronRight size={12} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {calibModal && (
        <CalibrationModal image={calibModal} onClose={() => setCalibModal(null)}
          onDone={() => { setCalibModal(null); qc.invalidateQueries(['images', studyId]) }} />
      )}

      {analysisModal && (
        <AnalysisTypeModal 
          imageId={analysisModal} 
          onClose={() => setAnalysisModal(null)} 
          onRun={(type) => runPipeline(analysisModal, type)} 
        />
      )}
    </div>
  )
}
