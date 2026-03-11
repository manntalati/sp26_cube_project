import { useState } from 'react';
import './AuthModal.css';

export default function AuthModal({ serviceName, serviceIcon, authType = 'oauth', onClose, onSuccess, error }) {
    const [email, setEmail] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [clientId, setClientId] = useState('');
    const [clientSecret, setClientSecret] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            if (authType === 'apiKey') {
                if (!apiKey.trim()) return;
                await onSuccess({ api_key: apiKey });
            } else if (authType === 'googleOAuth') {
                if (!clientId.trim() || !clientSecret.trim()) return;
                await onSuccess({ client_id: clientId, client_secret: clientSecret });
            } else {
                if (!email.trim()) return;
                setTimeout(() => {
                    onSuccess({ email });
                }, 800);
            }
        } finally {
            setLoading(false);
        }
    };

    const getSubtitle = () => {
        if (authType === 'apiKey') return `Enter your ${serviceName} API Key to get started`;
        if (authType === 'googleOAuth') return 'Enter your Google Cloud OAuth credentials to connect your calendar';
        return `Sign in with your ${serviceName} account to get started`;
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
                    <p>{getSubtitle()}</p>
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
                    ) : authType === 'googleOAuth' ? (
                        <>
                            <div className="form-field">
                                <label htmlFor="clientId">Client ID</label>
                                <input
                                    id="clientId"
                                    type="text"
                                    placeholder="Enter your Google OAuth Client ID"
                                    value={clientId}
                                    onChange={(e) => setClientId(e.target.value)}
                                    required
                                    autoFocus
                                />
                            </div>
                            <div className="form-field">
                                <label htmlFor="clientSecret">Client Secret</label>
                                <input
                                    id="clientSecret"
                                    type="password"
                                    placeholder="Enter your Google OAuth Client Secret"
                                    value={clientSecret}
                                    onChange={(e) => setClientSecret(e.target.value)}
                                    required
                                />
                            </div>
                            <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer" style={{ color: '#a78bfa', fontSize: '0.8rem', display: 'inline-block' }}>
                                Get your credentials from Google Cloud Console →
                            </a>
                        </>
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
                                {authType === 'googleOAuth' ? 'Connect & Authorize' : 'Sign In & Connect'}
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
