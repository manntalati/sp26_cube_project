import { useNavigate, useLocation } from 'react-router-dom';
import './Navbar.css';

export default function Navbar() {
    const navigate = useNavigate();
    const location = useLocation();
    const isOnboarding = location.pathname.startsWith('/connect');
    const isDashboard = location.pathname === '/dashboard';

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
                    <span className="navbar-title">MeetingMind</span>
                </div>

                <div className="navbar-right">
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
