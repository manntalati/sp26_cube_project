import { useNavigate } from 'react-router-dom';
import './LandingPage.css';

export default function LandingPage() {
    const navigate = useNavigate();

    return (
        <div className="landing">
            <div className="bg-mesh" />

            {/* Hero */}
            <section className="hero container">
                <div className="hero-content animate-fade-in-up">
                    <div className="hero-badge">
                        <span className="badge-dot" />
                        AI-Powered Meeting Assistant
                    </div>

                    <h1 className="hero-title">
                        Never miss an <br />
                        <span className="gradient-text">action item</span> again
                    </h1>

                    <p className="hero-subtitle">
                        Automatically capture action items from your meetings, fill your
                        calendar with tasks and deadlines, and schedule follow-ups — all
                        powered by AI.
                    </p>

                    <div className="hero-actions">
                        <button className="btn-primary hero-cta" onClick={() => navigate('/connect/transcription')}>
                            Get Started
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                <path d="M3 8H13M9 4L13 8L9 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </button>
                        <span className="hero-note">Free to connect · 2-minute setup</span>
                    </div>
                </div>

                <div className="hero-visual animate-fade-in-up stagger-2">
                    <div className="hero-illustration">
                        {/* Floating cards animation */}
                        <div className="float-card card-1">
                            <div className="float-card-icon">📋</div>
                            <div className="float-card-text">
                                <span className="fc-title">Action Items</span>
                                <span className="fc-desc">3 items extracted</span>
                            </div>
                        </div>

                        <div className="float-card card-2">
                            <div className="float-card-icon">📅</div>
                            <div className="float-card-text">
                                <span className="fc-title">Calendar Updated</span>
                                <span className="fc-desc">Deadline set for Mar 5</span>
                            </div>
                        </div>

                        <div className="float-card card-3">
                            <div className="float-card-icon">🤝</div>
                            <div className="float-card-text">
                                <span className="fc-title">Follow-up Scheduled</span>
                                <span className="fc-desc">Team sync on Mar 7</span>
                            </div>
                        </div>

                        {/* Central pulsing orb */}
                        <div className="hero-orb">
                            <div className="orb-ring ring-1" />
                            <div className="orb-ring ring-2" />
                            <div className="orb-ring ring-3" />
                            <div className="orb-core">
                                <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                                    <path d="M16 4V28M4 16H28" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
                                    <circle cx="16" cy="16" r="6" stroke="white" strokeWidth="2" />
                                </svg>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Features */}
            <section className="features container animate-fade-in-up stagger-3">
                <div className="features-grid">
                    <div className="feature-item">
                        <div className="feature-icon">🎙️</div>
                        <h3>Smart Transcription</h3>
                        <p>Connect Otter.ai or Firefly to auto-capture meeting notes and action items</p>
                    </div>
                    <div className="feature-item">
                        <div className="feature-icon">🎯</div>
                        <h3>Gap Analysis</h3>
                        <p>AI identifies missing action items and recommends concrete next steps</p>
                    </div>
                    <div className="feature-item">
                        <div className="feature-icon">📆</div>
                        <h3>Auto-Scheduling</h3>
                        <p>Tasks and deadlines are automatically added to your calendar</p>
                    </div>
                    <div className="feature-item">
                        <div className="feature-icon">🔄</div>
                        <h3>Follow-up Meetings</h3>
                        <p>Subsequent meetings scheduled automatically to keep momentum going</p>
                    </div>
                </div>
            </section>
        </div>
    );
}
