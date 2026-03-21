import { StrictMode, Component } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/globals.css'
import App from './App.jsx'

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e) { return { error: e }; }
  render() {
    if (this.state.error) {
      return (
        <pre style={{ color: 'red', padding: '2rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          {'ERROR: ' + this.state.error?.message + '\n' + this.state.error?.stack}
        </pre>
      );
    }
    return this.props.children;
  }
}

try {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
} catch (e) {
  document.getElementById('root').innerHTML =
    '<pre style="color:red;padding:2rem">' + e + '\n' + e.stack + '</pre>';
}
