import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import StepIndicator from '../components/StepIndicator';
import ServiceCard from '../components/ServiceCard';
import AuthModal from '../components/AuthModal';
import './ConnectPage.css';

const SERVICES = [
    {
        id: 'google',
        name: 'Google Calendar',
        description: 'Sync with your Google Workspace calendar for seamless scheduling via Google OAuth',
        icon: '📅',
        authType: 'googleOAuth'
    }
];

export default function ConnectCalendarPage({ connections, setConnections }) {
    const navigate = useNavigate();
    const location = useLocation();
    const [modalService, setModalService] = useState(null);
    const [authError, setAuthError] = useState('');

    // Check query params for success redirect from backend OAuth callback
    useEffect(() => {
        const queryParams = new URLSearchParams(location.search);
        if (queryParams.get('success') === 'true') {
            // Force status refresh since we just connected
            fetch('/api/auth/status')
                .then(res => res.json())
                .then(data => {
                    if (data.calendar?.connected) {
                        setConnections(prev => ({
                            ...prev,
                            calendar: {
                                service: 'google',
                                name: 'Google Calendar',
                                email: data.calendar.email || 'Google User'
                            }
                        }));
                        // Remove query param from URL
                        navigate('/connect/calendar', { replace: true });
                    }
                });
        }
    }, [location.search, navigate, setConnections]);

    const handleConnect = (service) => {
        setAuthError('');
        setModalService(service);
    };

    const handleDisconnect = () => {
        fetch('/api/auth/calendar/disconnect', { method: 'POST' }).then(() => {
            setConnections(prev => {
                const newConns = { ...prev };
                delete newConns.calendar;
                return newConns;
            });
        });
    };

    const handleSuccess = async (authData) => {
        try {
            const res = await fetch('/api/auth/google', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    client_id: authData.client_id,
                    client_secret: authData.client_secret
                })
            });
            const data = await res.json();

            if (res.ok && data.auth_url) {
                // Redirect to Google consent screen
                window.location.href = data.auth_url;
            } else {
                setAuthError(data.error || 'Failed to initialize Google OAuth');
            }
        } catch (err) {
            setAuthError('Network error connecting to backend');
        }
    };

    const isConnected = !!connections.calendar;

    return (
        <div className="connect-page">
            <div className="bg-mesh" />
            <div className="container">
                <StepIndicator
                    currentStep={2}
                    totalSteps={2}
                    labels={['Transcription', 'Calendar']}
                />

                <div className="connect-content animate-fade-in-up">
                    <div className="connect-header">
                        <h1>Connect your calendar</h1>
                        <p>
                            Link your calendar so MeetingMind can auto-schedule tasks, deadlines,
                            and follow-up meetings from your action items.
                        </p>
                        {authError && <p style={{ color: '#ef4444', marginTop: '1rem' }}>{authError}</p>}
                    </div>

                    <div className="connect-cards">
                        {SERVICES.map((service) => (
                            <ServiceCard
                                key={service.id}
                                name={service.name}
                                description={service.description}
                                icon={<span>{service.icon}</span>}
                                connected={connections.calendar?.service === service.id}
                                onConnect={() => handleConnect(service)}
                                onDisconnect={handleDisconnect}
                            />
                        ))}
                    </div>

                    {isConnected && (
                        <div className="connect-status animate-fade-in">
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                <circle cx="8" cy="8" r="7" stroke="#34d399" strokeWidth="1.5" />
                                <path d="M5 8L7 10L11 6" stroke="#34d399" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            <span>
                                Connected as <strong>{connections.calendar.email}</strong> via{' '}
                                {connections.calendar.name}
                            </span>
                        </div>
                    )}

                    <div className="connect-actions">
                        <button className="btn-secondary" onClick={() => navigate('/connect/transcription')}>
                            ← Back
                        </button>
                        <button
                            className="btn-primary"
                            disabled={!isConnected}
                            onClick={() => navigate('/dashboard')}
                        >
                            Finish Setup
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                <path d="M3 7L6 10L13 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>

            {modalService && (
                <AuthModal
                    serviceName={modalService.name}
                    serviceIcon={<span style={{ fontSize: '1.8rem' }}>{modalService.icon}</span>}
                    authType={modalService.authType}
                    error={authError}
                    onClose={() => setModalService(null)}
                    onSuccess={handleSuccess}
                />
            )}
        </div>
    );
}
