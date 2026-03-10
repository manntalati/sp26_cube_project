import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ServiceCard from '../components/ServiceCard';
import './DashboardPage.css';

export default function DashboardPage({ connections, setConnections }) {
    const navigate = useNavigate();
    const [events, setEvents] = useState([]);
    const [transcripts, setTranscripts] = useState([]);
    const [loadingData, setLoadingData] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            setLoadingData(true);
            try {
                if (connections.calendar?.connected) {
                    const calRes = await fetch('/api/calendar/events');
                    const calData = await calRes.json();
                    if (calData.success) setEvents(calData.events);
                }

                if (connections.transcription?.connected) {
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

    const hasAll = connections.transcription && connections.calendar;

    if (!hasAll) {
        return (
            <div className="dashboard">
                <div className="bg-mesh" />
                <div className="container">
                    <div className="dashboard-empty animate-fade-in-up">
                        <div className="empty-icon">🔗</div>
                        <h2>Connect your accounts first</h2>
                        <p>You need to connect both a transcription service and a calendar to get started.</p>
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
                        <ServiceCard
                            name={connections.calendar.name}
                            description={`Connected as ${connections.calendar.email}`}
                            icon={<span>📅</span>}
                            connected={true}
                            onDisconnect={() => handleDisconnect('calendar')}
                        />
                    </div>
                </div>

                {/* Upcoming Meetings */}
                <div className="dashboard-section animate-fade-in-up stagger-2">
                    <h2 className="section-title">Upcoming Meetings</h2>
                    {loadingData ? (
                        <p style={{ color: '#94a3b8' }}>Loading events...</p>
                    ) : events.length > 0 ? (
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
                        <p style={{ color: '#94a3b8' }}>No upcoming events found.</p>
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
                                    <p style={{ fontSize: '0.9rem', color: '#94a3b8', margin: 0 }}>
                                        {new Date(parseInt(t.date)).toLocaleString()} • {Math.round(t.duration / 60)} mins
                                    </p>
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
