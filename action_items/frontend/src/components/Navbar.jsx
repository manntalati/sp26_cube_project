import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AGENT_ROLES, readAgentRole, writeAgentRole } from '../agentRole';
import './Navbar.css';

export default function Navbar({ connections = {}, setConnections }) {
    const navigate = useNavigate();
    const [agentRole, setAgentRole] = useState(readAgentRole);

    const selectAgentRole = (role) => {
        writeAgentRole(role);
        setAgentRole(role);
    };
    const isDashboard = location.pathname === '/dashboard';
    const hasConnections = Object.keys(connections).length > 0;

    const handleSignOut = async () => {
        try {
            await fetch('/api/auth/signout', { method: 'POST' });
            if (setConnections) {
                setConnections({});
            }
            navigate('/');
        } catch (err) {
            console.error('Failed to sign out', err);
        }
    };

    return (
        <nav className="navbar">
            <div className="navbar-inner container">
                <div className="navbar-brand" onClick={() => navigate('/')}>
                    <div className="navbar-logo">
                        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                            <rect width="28" height="28" rx="8" fill="url(#logoGrad)" />
                            <path d="M8 14L12 18L20 10" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                            <defs>
                                <linearGradient id="logoGrad" x1="0" y1="0" x2="28" y2="28">
                                    <stop stopColor="#7c5cfc" />
                                    <stop offset="1" stopColor="#34d399" />
                                </linearGradient>
                            </defs>
                        </svg>
                    </div>
                    <span className="navbar-title">Action Items Agent</span>
                </div>

                <div className="navbar-role-cluster" role="group" aria-label="Agent perspective">
                    <span className="navbar-role-label">Perspective</span>
                    <div className="role-pill-bar">
                        {AGENT_ROLES.map((r) => (
                            <button
                                key={r}
                                type="button"
                                className={`role-pill ${agentRole === r ? 'active' : ''}`}
                                onClick={() => selectAgentRole(r)}
                            >
                                {r}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="navbar-right">
                    {hasConnections && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <button className="btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }} onClick={() => navigate('/settings')}>
                                ⚙️ Settings
                            </button>
                            <button className="navbar-signout" onClick={handleSignOut}>
                                Sign Out
                            </button>
                        </div>
                    )}
                    {isDashboard && (
                        <div className="navbar-avatar">
                            <span>U</span>
                        </div>
                    )}
                </div>
            </div>
        </nav>
    );
}
