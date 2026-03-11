import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import StepIndicator from '../components/StepIndicator';
import ServiceCard from '../components/ServiceCard';
import AuthModal from '../components/AuthModal';
import './ConnectPage.css';

const SERVICES = [
    {
        id: 'gemini',
        name: 'Gemini AI',
        description: 'Google\'s Gemini AI analyzes your meeting transcripts to extract, enrich, and prioritize action items',
        icon: '🤖',
        authType: 'apiKey'
    }
];

export default function ConnectGeminiPage({ connections, setConnections }) {
    const navigate = useNavigate();
    const [modalService, setModalService] = useState(null);
    const [authError, setAuthError] = useState('');

    const handleConnect = (service) => {
        setAuthError('');
        setModalService(service);
    };

    const handleDisconnect = () => {
        fetch('/api/auth/gemini/disconnect', { method: 'POST' }).then(() => {
            setConnections(prev => {
                const newConns = { ...prev };
                delete newConns.gemini;
                return newConns;
            });
        });
    };

    const handleSuccess = async (authData) => {
        try {
            const res = await fetch('/api/auth/gemini', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ api_key: authData.api_key })
            });
            const data = await res.json();

            if (res.ok && data.success) {
                setConnections((prev) => ({
                    ...prev,
                    gemini: { service: 'gemini', name: 'Gemini AI', connected: true },
                }));
                setModalService(null);
                setAuthError('');
            } else {
                setAuthError(data.error || 'Failed to validate Gemini API key');
            }
        } catch (err) {
            setAuthError('Network error connecting to backend');
        }
    };

    const isConnected = !!connections.gemini;

    return (
        <div className="connect-page">
            <div className="bg-mesh" />
            <div className="container">
                <StepIndicator
                    currentStep={3}
                    totalSteps={3}
                    labels={['Transcription', 'Calendar', 'AI Analysis']}
                />

                <div className="connect-content animate-fade-in-up">
                    <div className="connect-header">
                        <h1>Connect AI analysis</h1>
                        <p>
                            Provide your Gemini API key so MeetingMind can analyze transcripts,
                            enrich action items, and identify gaps automatically.
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
                                connected={connections.gemini?.service === service.id}
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
                                Gemini AI connected via <strong>{connections.gemini.name}</strong>
                            </span>
                        </div>
                    )}

                    <div className="connect-actions">
                        <button className="btn-secondary" onClick={() => navigate('/connect/calendar')}>
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
