import { useState } from 'react';
import './AuthModal.css';

export default function AuthModal({ serviceName, serviceIcon, authType = 'oauth', onClose, onSuccess, error }) {
    const [email, setEmail] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            if (authType === 'apiKey') {
                if (!apiKey.trim()) return;
                await onSuccess({ api_key: apiKey });
            } else {
                if (!email.trim()) return;
                // Simulate OAuth 
                setTimeout(() => {
                    onSuccess({ email });
                }, 800);
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay animate-fade-in" onClick={onClose}>
            <div className="modal-content animate-fade-in-up" onClick={(e) => e.stopPropagation()}>
                <button className="modal-close" onClick={onClose}>
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                        <path d="M4 4L14 14M14 4L4 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                </button>

                <div className="modal-header">
                    <div className="modal-service-icon">{serviceIcon}</div>
                    <h2>Connect to {serviceName}</h2>
                    <p>
                        {authType === 'apiKey'
                            ? `Enter your ${serviceName} API Key to get started`
                            : `Sign in with your ${serviceName} account to get started`}
                    </p>
                </div>

                {error && <div className="modal-error" style={{ color: '#ef4444', marginBottom: '1rem', padding: '0.75rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px', fontSize: '0.9rem' }}>{error}</div>}

                <form onSubmit={handleSubmit} className="modal-form">
                    {authType === 'apiKey' ? (
                        <div className="form-field">
                            <label htmlFor="apiKey">API Key</label>
                            <input
                                id="apiKey"
                                type="password"
                                placeholder={`Enter your ${serviceName} API Key`}
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                required
                                autoFocus
                            />
                            <a href="https://app.fireflies.ai/integrations" target="_blank" rel="noreferrer" style={{ color: '#a78bfa', fontSize: '0.8rem', marginTop: '0.5rem', display: 'inline-block' }}>
                                Get your API key here
                            </a>
                        </div>
                    ) : (
                        <>
                            <div className="form-field">
                                <label htmlFor="email">Email address</label>
                                <input
                                    id="email"
                                    type="email"
                                    placeholder={`your@email.com`}
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    autoFocus
                                />
                            </div>
                            <div className="form-field">
                                <label htmlFor="password">Password</label>
                                <input
                                    id="password"
                                    type="password"
                                    placeholder="••••••••"
                                    required
                                />
                            </div>
                        </>
                    )}

                    <button type="submit" className="btn-primary modal-submit" disabled={loading}>
                        {loading ? (
                            <span className="loading-dots">
                                <span>Connecting</span>
                                <span className="dots">
                                    <span>.</span><span>.</span><span>.</span>
                                </span>
                            </span>
                        ) : (
                            <>
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                    <path d="M2 8H14M10 4L14 8L10 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                                Sign In & Connect
                            </>
                        )}
                    </button>
                </form>

                <p className="modal-disclaimer">
                    We only access meeting data. Your credentials are securely stored.
                </p>
            </div>
        </div>
    );
}
