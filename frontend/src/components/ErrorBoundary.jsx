import { Component } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '60vh', display: 'flex', alignItems: 'center',
          justifyContent: 'center', flexDirection: 'column', gap: 16, padding: 40
        }}>
          <AlertTriangle size={48} color="var(--warning)" />
          <h2 style={{ color: 'var(--text-primary)' }}>Something went wrong</h2>
          <p style={{ color: 'var(--text-muted)', maxWidth: 400, textAlign: 'center' }}>
            {this.state.error?.message ?? 'An unexpected error occurred'}
          </p>
          <button className="btn btn-primary" onClick={() => this.setState({ hasError: false, error: null })}>
            <RefreshCw size={15} /> Try Again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
