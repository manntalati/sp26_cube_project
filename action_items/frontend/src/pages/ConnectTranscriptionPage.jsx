import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import StepIndicator from '../components/StepIndicator';
import ServiceCard from '../components/ServiceCard';
import AuthModal from '../components/AuthModal';
import './ConnectPage.css';

const SERVICES = [
    {
        id: 'firefly',
        name: 'Fireflies.ai',
        description: 'Automated meeting transcription, summary, and action item extraction via GraphQL API',
        icon: '✨',
        authType: 'apiKey'
    }
];

export default function ConnectTranscriptionPage({ connections, setConnections }) {
    const navigate = useNavigate();
    const [modalService, setModalService] = useState(null);
    const [authError, setAuthError] = useState('');

    const handleConnect = (service) => {
        setAuthError('');
        setModalService(service);
    };

    const handleDisconnect = () => {
        // Disconnect from backend and clear state
        fetch('/api/auth/fireflies/disconnect', { method: 'POST' }).then(() => {
            setConnections(prev => {
                const newConns = { ...prev };
                delete newConns.transcription;
                return newConns;
            });
        });
    }

    const handleSuccess = async (authData) => {
        try {
            const res = await fetch('/api/auth/fireflies', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ api_key: authData.api_key })
            });
            const data = await res.json();

            if (res.ok && data.success) {
                setConnections((prev) => ({
                    ...prev,
                    transcription: { service: modalService.id, name: modalService.name, email: data.user?.email || 'Connected User' },
                }));
                setModalService(null);
                setAuthError('');
            } else {
                setAuthError(data.error || 'Failed to authenticate API key');
            }
        } catch (err) {
            setAuthError('Network error connecting to backend');
        }
    };

    const isConnected = !!connections.transcription;

    return (
        <div className="connect-page">
            <div className="bg-mesh" />
            <div className="container">
                <StepIndicator
                    currentStep={1}
                    totalSteps={3}
                    labels={['Transcription', 'Calendar', 'AI Analysis']}
                />

                <div className="connect-content animate-fade-in-up">
                    <div className="connect-header">
                        <h1>Connect your transcription service</h1>
                        <p>
                            We use Fireflies.ai to automatically capture notes
                            and action items from your meetings.
                        </p>
                    </div>

                    <div className="connect-cards">
                        {SERVICES.map((service) => (
                            <ServiceCard
                                key={service.id}
                                name={service.name}
                                description={service.description}
                                icon={<span>{service.icon}</span>}
                                connected={connections.transcription?.service === service.id}
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
                                Connected as <strong>{connections.transcription.email}</strong> via{' '}
                                {connections.transcription.name}
                            </span>
                        </div>
                    )}

                    <div className="connect-actions">
                        <button className="btn-secondary" onClick={() => navigate('/')}>
                            ← Back
                        </button>
                        <button
                            className="btn-primary"
                            disabled={!isConnected}
                            onClick={() => navigate('/connect/calendar')}
                        >
                            Continue
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                <path d="M3 8H13M9 4L13 8L9 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
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
