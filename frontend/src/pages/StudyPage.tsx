import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Upload, Scissors, MousePointer2, CheckCircle, 
  Clock, Image as ImageIcon, FileType, Info, MoreVertical,
  Activity, Zap, Trash2, Camera, Download
} from 'lucide-react';
import api from '../api/api';
import toast from 'react-hot-toast';
import { toPublicUrl } from '../utils/publicUrl';

interface StudyImage {
  id: string;
  fileName: string;
  fileFormat: string;
  fileSizeBytes: number;
  storageUrl: string;
  thumbnailUrl?: string;
  isCalibrated: boolean;
  createdAt: string;
}

export default function StudyPage() {
  const { studyId } = useParams();
  const navigate = useNavigate();
  const [images, setImages] = useState<StudyImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchImages();
  }, [studyId]);

  const fetchImages = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/images/study/${studyId}`);
      setImages(res.data);
    } catch (error) {
      toast.error('Failed to load study images');
    }
    setLoading(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    setUploading(true);
    const tid = toast.loading('Uploading clinical image...');
    try {
      await api.post(`/images/study/${studyId}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      toast.success('Image registered successfully', { id: tid });
      fetchImages();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Upload failed', { id: tid });
    }
    setUploading(false);
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = 2;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: '#060c18', 
      color: '#fff',
      paddingBottom: 40,
      fontFamily: '"Instrument Sans", sans-serif'
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        
        .study-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
          gap: 24px;
          padding: 30px;
        }

        .image-card {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 16px;
          overflow: hidden;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
        }

        .image-card:hover {
          transform: translateY(-4px);
          background: rgba(255, 255, 255, 0.05);
          border-color: rgba(76, 158, 255, 0.3);
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
        }

        .image-preview {
          height: 220px;
          background-color: #000;
          background-size: cover;
          background-position: center;
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .image-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(to top, rgba(6, 12, 24, 0.8), transparent);
          opacity: 0.6;
        }

        .status-badge {
          position: absolute;
          top: 12px;
          right: 12px;
          padding: 4px 10px;
          border-radius: 20px;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          display: flex;
          align-items: center;
          gap: 4px;
          backdrop-filter: blur(8px);
        }

        .status-calibrated {
          background: rgba(34, 197, 94, 0.15);
          color: #4ade80;
          border: 1px solid rgba(74, 222, 128, 0.3);
        }

        .status-pending {
          background: rgba(245, 158, 11, 0.15);
          color: #fbbf24;
          border: 1px solid rgba(251, 191, 36, 0.3);
        }

        .format-tag {
          position: absolute;
          bottom: 12px;
          left: 12px;
          background: rgba(0, 0, 0, 0.5);
          border: 1px solid rgba(255, 255, 255, 0.1);
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 10px;
          font-family: 'DM Mono', monospace;
          color: rgba(255, 255, 255, 0.7);
        }

        .action-btn {
          height: 36px;
          padding: 0 16px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          transition: all 0.2s;
          border: 1px solid transparent;
        }

        .btn-analyze {
          background: #3b82f6;
          color: white;
        }

        .btn-analyze:hover {
          background: #2563eb;
          box-shadow: 0 0 15px rgba(59, 130, 246, 0.4);
        }

        .btn-config {
          background: rgba(255, 255, 255, 0.05);
          border-color: rgba(255, 255, 255, 0.1);
          color: rgba(255, 255, 255, 0.8);
        }

        .btn-config:hover {
          background: rgba(255, 255, 255, 0.1);
          border-color: rgba(255, 255, 255, 0.2);
        }

        .upload-zone {
          border: 2px dashed rgba(255, 255, 255, 0.1);
          border-radius: 20px;
          padding: 60px;
          text-align: center;
          background: rgba(255, 255, 255, 0.01);
          transition: all 0.3s;
          max-width: 600px;
          margin: 60px auto;
          cursor: pointer;
        }

        .upload-zone:hover {
          border-color: #3b82f6;
          background: rgba(59, 130, 246, 0.03);
          transform: scale(1.01);
        }

        .skeleton {
          background: linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.03) 75%);
          background-size: 200% 100%;
          animation: loading 1.5s infinite;
        }

        @keyframes loading {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      {/* Glassmorphic Header */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(6, 12, 24, 0.8)',
        backdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        padding: '16px 30px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <button 
            onClick={() => navigate(-1)}
            style={{ 
              background: 'rgba(255, 255, 255, 0.05)', 
              border: '1px solid rgba(255, 255, 255, 0.1)', 
              borderRadius: '10px', padding: '8px', cursor: 'pointer', color: '#fff'
            }}
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>Study Repository</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
              <span style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.4)' }}>DICOM / Radiographic Assets</span>
              <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(255, 255, 255, 0.2)' }} />
              <span style={{ fontSize: 12, color: '#3b82f6', fontWeight: 600 }}>Study ID: {studyId?.slice(0, 8)}</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <input 
            type="file" 
            ref={fileInputRef} 
            style={{ display: 'none' }} 
            accept="image/png, image/jpeg, .dcm"
            onChange={handleFileUpload}
          />
          <button 
            className="action-btn btn-analyze"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={{ borderRadius: '10px', height: 40 }}
          >
            <Upload size={16} />
            {uploading ? 'Processing...' : 'Upload Study Image'}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main>
        {loading ? (
          <div className="study-grid">
            {[1, 2, 3].map(i => (
              <div key={i} className="image-card skeleton" style={{ height: 320 }} />
            ))}
          </div>
        ) : images.length === 0 ? (
          <div className="upload-zone" onClick={() => fileInputRef.current?.click()}>
            <div style={{ 
              width: 80, height: 80, borderRadius: '50%', 
              background: 'rgba(59, 130, 246, 0.1)', 
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 24px', color: '#3b82f6'
            }}>
              <Camera size={40} />
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>No Clinical Assets Found</h2>
            <p style={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: 16, maxWidth: 400, margin: '0 auto 30px', lineHeight: 1.6 }}>
              This study is currently empty. Upload a lateral cephalogram or clinical photograph to begin the analysis pipeline.
            </p>
            <div style={{ 
              display: 'inline-flex', alignItems: 'center', gap: 10,
              background: 'rgba(255, 255, 255, 0.05)', padding: '10px 20px',
              borderRadius: '12px', color: 'rgba(255, 255, 255, 0.6)', fontSize: 14
            }}>
              <Download size={16} /> Supports .DICOM, .JPG, .PNG
            </div>
          </div>
        ) : (
          <div className="study-grid">
            {images.map(img => (
              <div key={img.id} className="image-card">
                <div 
                  className="image-preview"
                  style={{ backgroundImage: `url(${toPublicUrl(img.thumbnailUrl || img.storageUrl)})` }}
                >
                  <div className="image-overlay" />
                  <div className={`status-badge ${img.isCalibrated ? 'status-calibrated' : 'status-pending'}`}>
                    {img.isCalibrated ? (
                      <><CheckCircle size={10} /> Calibrated</>
                    ) : (
                      <><Clock size={10} /> Pending Calibration</>
                    )}
                  </div>
                  <div className="format-tag">{img.fileFormat?.toUpperCase() || 'IMAGE'}</div>
                  
                  {/* Quick actions on overlay */}
                  <div style={{ position: 'absolute', bottom: 12, right: 12, display: 'flex', gap: 8 }}>
                    <button 
                      style={{ 
                        background: 'rgba(0, 0, 0, 0.6)', border: 'none', borderRadius: '6px', 
                        padding: '6px', cursor: 'pointer', color: 'white' 
                      }}
                      title="Asset Info"
                    >
                      <Info size={14} />
                    </button>
                    <button 
                      style={{ 
                        background: 'rgba(0, 0, 0, 0.6)', border: 'none', borderRadius: '6px', 
                        padding: '6px', cursor: 'pointer', color: 'white' 
                      }}
                      title="More Options"
                    >
                      <MoreVertical size={14} />
                    </button>
                  </div>
                </div>

                <div style={{ padding: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 15 }}>
                    <div>
                      <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0, color: 'rgba(255, 255, 255, 0.9)' }}>
                        {img.fileName.length > 30 ? `${img.fileName.slice(0, 27)}...` : img.fileName}
                      </h3>
                      <div style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.4)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <FileType size={12} /> {formatSize(img.fileSizeBytes)}
                        <span style={{ opacity: 0.3 }}>•</span>
                        <Zap size={11} style={{ color: '#fbbf24' }} /> High Contrast
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 10 }}>
                    <button 
                      className="action-btn btn-analyze"
                      style={{ flex: 1.5, justifyContent: 'center' }}
                      onClick={() => navigate(`/analysis/${img.id}`)}
                    >
                      <Activity size={16} /> Analyze
                    </button>
                    <button 
                      className="action-btn btn-config"
                      style={{ flex: 1, justifyContent: 'center' }}
                      onClick={() => navigate(`/studies/${studyId}/calibrate/${img.id}`)}
                    >
                      <Scissors size={14} /> Calibrate
                    </button>
                    <button 
                      className="action-btn btn-config"
                      style={{ width: 44, padding: 0, justifyContent: 'center', color: '#ef4444' }}
                      title="Delete Asset"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
