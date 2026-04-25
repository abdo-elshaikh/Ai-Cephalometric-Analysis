import React, { useState, useEffect } from 'react';
import { WifiOff } from 'lucide-react';

export function NetworkIndicator() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: 'rgba(239, 68, 68, 0.95)',
        backdropFilter: 'blur(10px)',
        color: '#fff',
        padding: '8px 16px',
        borderRadius: 24,
        boxShadow: '0 4px 20px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.1)',
        fontWeight: 600,
        fontSize: 13,
        letterSpacing: '0.02em'
      }}
    >
      <WifiOff size={14} />
      You are currently offline. Changes will not be saved.
    </div>
  );
}
