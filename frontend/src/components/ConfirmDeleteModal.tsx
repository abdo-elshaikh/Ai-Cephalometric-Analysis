import { useState, useEffect } from 'react';
import { AlertCircle, X, Trash2 } from 'lucide-react';

interface ConfirmDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmText?: string;
  loading?: boolean;
}

export default function ConfirmDeleteModal({
  isOpen, onClose, onConfirm,
  title, description, confirmText = 'Delete Permanently',
  loading = false
}: ConfirmDeleteModalProps) {
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsAnimating(true);
      document.body.style.overflow = 'hidden';
    } else {
      const timer = setTimeout(() => setIsAnimating(false), 300);
      document.body.style.overflow = 'unset';
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isOpen && !isAnimating) return null;

  return (
    <div 
      className={`modal-overlay ${isOpen ? 'modal-overlay--active' : ''}`}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'rgba(5, 8, 15, 0.7)',
        backdropFilter: 'blur(10px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px', transition: 'opacity 0.3s ease',
        opacity: isOpen ? 1 : 0,
        pointerEvents: isOpen ? 'auto' : 'none',
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes modal-pop-in {
          0% { transform: scale(0.9) translateY(10px); opacity: 0; }
          100% { transform: scale(1) translateY(0); opacity: 1; }
        }
        .confirm-modal-content {
          animation: modal-pop-in 0.3s cubic-bezier(0.19, 1, 0.22, 1) forwards;
        }
      `}} />

      <div 
        className="confirm-modal-content"
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: '440px',
          background: 'linear-gradient(135deg, #1e1e2d 0%, #11111d 100%)',
          borderRadius: '24px',
          border: '1px solid rgba(239, 68, 68, 0.2)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
          overflow: 'hidden',
          padding: '32px',
          textAlign: 'center'
        }}
      >
        <div style={{
          width: 64, height: 64, borderRadius: '50%', background: 'rgba(239, 68, 68, 0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 24px', color: '#ef4444'
        }}>
          <AlertCircle size={32} />
        </div>

        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0 0 12px', color: 'white' }}>
          {title}
        </h2>
        
        <p style={{ fontSize: '0.95rem', color: '#94a3b8', lineHeight: 1.6, marginBottom: 32 }}>
          {description}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button 
            onClick={onConfirm}
            disabled={loading}
            style={{
              padding: '14px', borderRadius: '12px', background: '#ef4444',
              border: 'none', color: 'white', cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '1rem', fontWeight: 600, transition: 'all 0.2s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: '0 4px 12px rgba(239, 68, 68, 0.2)'
            }}
            onMouseOver={e => !loading && (e.currentTarget.style.filter = 'brightness(1.1)')}
            onMouseOut={e => !loading && (e.currentTarget.style.filter = 'brightness(1)')}
          >
            {loading ? (
              <div className="animate-spin" style={{ width: 20, height: 20, border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%' }} />
            ) : (
              <Trash2 size={18} />
            )}
            {loading ? 'Deleting...' : confirmText}
          </button>
          
          <button 
            onClick={onClose}
            disabled={loading}
            style={{
              padding: '12px', borderRadius: '12px', background: 'transparent',
              border: '1px solid rgba(255, 255, 255, 0.1)', color: '#94a3b8',
              cursor: 'pointer', fontSize: '0.9rem', fontWeight: 500, transition: 'all 0.2s'
            }}
            onMouseOver={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'}
            onMouseOut={e => e.currentTarget.style.background = 'transparent'}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
