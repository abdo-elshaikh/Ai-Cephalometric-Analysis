import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in UI:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: '100vh', background: '#080c14', color: 'rgba(255,255,255,0.92)', padding: 20, textAlign: 'center',
          fontFamily: '"Inter", sans-serif'
        }}>
          <AlertTriangle size={56} style={{ color: '#ef4444', marginBottom: 20 }} />
          <h2 style={{ fontSize: 24, marginBottom: 8, fontWeight: 600 }}>Unexpected Clinical Workspace Error</h2>
          <p style={{ color: 'rgba(255,255,255,0.55)', maxWidth: 450, marginBottom: 32, lineHeight: 1.5, fontSize: 14 }}>
            The application encountered a critical UI fault. Diagnostic telemetry has been logged. 
            Please reload the application to restore your workspace.
          </p>
          <button 
            onClick={() => window.location.reload()}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px',
              borderRadius: 8, border: '1px solid rgba(99,179,237,0.4)',
              background: 'rgba(99,179,237,0.12)', color: '#63b3ed', cursor: 'pointer',
              fontWeight: 600, fontSize: 14, transition: 'all 0.2s'
            }}
          >
            <RotateCcw size={16} /> Restore Workspace
          </button>
          
          {import.meta.env.DEV && (
            <div style={{ marginTop: 40, width: '100%', maxWidth: 800, textAlign: 'left' }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Developer Stack Trace
              </div>
              <pre style={{
                padding: 16, background: '#111827', borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)',
                overflow: 'auto', fontSize: 12, color: '#ef4444', fontFamily: '"SF Mono", monospace'
              }}>
                {this.state.error?.toString()}
                {'\n'}
                {this.state.error?.stack}
              </pre>
            </div>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
