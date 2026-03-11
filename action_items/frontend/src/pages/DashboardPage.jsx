import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ServiceCard from '../components/ServiceCard';
import './DashboardPage.css';

export default function DashboardPage({ connections, setConnections }) {
    const navigate = useNavigate();
    const [events, setEvents] = useState([]);
    const [transcripts, setTranscripts] = useState([]);
    const [analysisById, setAnalysisById] = useState({});
    const [loadingData, setLoadingData] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            setLoadingData(true);
            try {
                if (connections.calendar) {
                    const calRes = await fetch('/api/calendar/events');
                    const calData = await calRes.json();
                    if (calData.success) setEvents(calData.events);
                }

                if (connections.transcription) {
                    const ffRes = await fetch('/api/fireflies/transcripts');
                    const ffData = await ffRes.json();
                    if (ffData.success) setTranscripts(ffData.transcripts);
                }
            } catch (err) {
                console.error("Error fetching dashboard data", err);
            } finally {
                setLoadingData(false);
            }
        };

        if (connections.transcription || connections.calendar) {
            fetchData();
        }
    }, [connections]);

    useEffect(() => {
        if (!transcripts.length) return;

        let cancelled = false;

        const refreshStatuses = async () => {
            try {
                const pairs = await Promise.all(
                    transcripts.map(async (t) => {
                        const res = await fetch(`/api/gemini/status/${t.id}`);
                        const data = await res.json();
                        return [t.id, data.analysis];
                    })
                );
                if (cancelled) return;
                setAnalysisById(Object.fromEntries(pairs));
            } catch (err) {
                console.error("Failed to fetch analysis statuses", err);
            }
        };

        refreshStatuses();
        const interval = setInterval(refreshStatuses, 2500);
        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, [transcripts]);

    const handleDisconnect = (type) => {
        const endpoint = type === 'calendar' ? '/api/auth/calendar/disconnect' : '/api/auth/fireflies/disconnect';
        fetch(endpoint, { method: 'POST' }).then(() => {
            setConnections((prev) => {
                const next = { ...prev };
                delete next[type];
                return next;
            });
        });
    };

    const hasTranscription = !!connections.transcription;

    if (!hasTranscription) {
        return (
            <div className="dashboard">
                <div className="bg-mesh" />
                <div className="container">
                    <div className="dashboard-empty animate-fade-in-up">
                        <div className="empty-icon">🔗</div>
                        <h2>Connect your accounts first</h2>
                        <p>Connect Fireflies so we can pull meeting transcripts and extract action items.</p>
                        <button className="btn-primary" onClick={() => navigate('/connect/transcription')}>
                            Start Setup
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="dashboard">
            <div className="bg-mesh" />
            <div className="container">
                {/* Welcome */}
                <div className="dashboard-welcome animate-fade-in-up">
                    <div className="welcome-content">
                        <h1>You're all set! 🎉</h1>
                        <p>
                            Action Items Agent is ready to capture your action items, schedule tasks,
                            and keep your team on track.
                        </p>
                    </div>
                </div>

                {/* Connected Accounts */}
                <div className="dashboard-section animate-fade-in-up stagger-1">
                    <h2 className="section-title">Connected Accounts</h2>
                    <div className="dashboard-cards">
                        <ServiceCard
                            name={connections.transcription.name}
                            description={`Connected as ${connections.transcription.email}`}
                            icon={<span>✨</span>}
                            connected={true}
                            onDisconnect={() => handleDisconnect('transcription')}
                        />
                        {connections.calendar && (
                            <ServiceCard
                                name={connections.calendar.name}
                                description={`Connected as ${connections.calendar.email}`}
                                icon={<span>📅</span>}
                                connected={true}
                                onDisconnect={() => handleDisconnect('calendar')}
                            />
                        )}
                    </div>
                </div>

                {/* Upcoming Meetings */}
                <div className="dashboard-section animate-fade-in-up stagger-2">
                    <h2 className="section-title">Upcoming Meetings</h2>
                    {loadingData ? (
                        <p style={{ color: '#94a3b8' }}>Loading events...</p>
                    ) : connections.calendar && events.length > 0 ? (
                        <div className="placeholder-grid">
                            {events.map((m, i) => (
                                <div key={i} className="meeting-card">
                                    <div className="meeting-time">
                                        {new Date(m.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                    <div className="meeting-info">
                                        <span className="meeting-title">{m.title}</span>
                                        <span className="meeting-participants" style={{ fontSize: '0.8rem' }}>
                                            {new Date(m.start).toLocaleDateString()}
                                        </span>
                                    </div>
                                    <div className="meeting-status">
                                        <a href={m.link} target="_blank" rel="noreferrer" className="status-badge upcoming" style={{ textDecoration: 'none' }}>View</a>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p style={{ color: '#94a3b8' }}>
                            {connections.calendar ? 'No upcoming events found.' : 'Connect Google Calendar to see upcoming meetings here.'}
                        </p>
                    )}
                </div>

                {/* Recent Action Items */}
                <div className="dashboard-section animate-fade-in-up stagger-3">
                    <h2 className="section-title">Recent Transcripts & Action Items</h2>
                    {loadingData ? (
                        <p style={{ color: '#94a3b8' }}>Loading transcripts...</p>
                    ) : transcripts.length > 0 ? (
                        <div className="action-items-list" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {transcripts.map((t, i) => (
                                <div key={t.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '12px' }}>
                                    <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem', marginTop: 0 }}>{t.title}</h3>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                                        <p style={{ fontSize: '0.9rem', color: '#94a3b8', margin: 0 }}>
                                            {new Date(parseInt(t.date)).toLocaleString()} • {Math.round(t.duration / 60)} mins
                                        </p>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                            {analysisById[t.id]?.status && (
                                                <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                                                    {analysisById[t.id].status === 'ready'
                                                        ? 'AI ready'
                                                        : analysisById[t.id].status === 'processing'
                                                            ? 'Analyzing…'
                                                            : analysisById[t.id].status === 'queued'
                                                                ? 'Queued…'
                                                                : analysisById[t.id].status === 'error'
                                                                    ? 'AI error'
                                                                    : 'Not queued'}
                                                </span>
                                            )}
                                            <button
                                                className="btn-primary"
                                                style={{ padding: '0.4rem 1rem', fontSize: '0.9rem', whiteSpace: 'nowrap' }}
                                                onClick={() => navigate(`/review/${t.id}`)}
                                            >
                                                Review
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="action-items-placeholder">
                            <div className="ai-empty">
                                <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                                    <rect x="4" y="4" width="32" height="32" rx="8" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 2" />
                                    <path d="M14 20H26M14 26H22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                    <circle cx="14" cy="14" r="2" fill="currentColor" />
                                </svg>
                                <p>Action items will appear here after your next meeting is transcribed</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
