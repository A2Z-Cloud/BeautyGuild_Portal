import React from 'react';
import { Link } from 'react-router-dom';

// If one screen fails to draw, show a plain message on that screen instead of a blank page.
// It resets when the member moves to another page (the parent changes `resetKey`).
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false, key: props.resetKey };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  static getDerivedStateFromProps(props, state) {
    return props.resetKey !== state.key ? { failed: false, key: props.resetKey } : null;
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="page narrow-page">
        <h1>Something went wrong</h1>
        <p>This page could not be shown. Please try again, or go back to the dashboard.</p>
        <p>
          <button type="button" className="btn btn-secondary" onClick={() => window.location.reload()}>
            Reload this page
          </button>{' '}
          <Link className="btn btn-primary" to="/">
            Go to dashboard
          </Link>
        </p>
      </div>
    );
  }
}
