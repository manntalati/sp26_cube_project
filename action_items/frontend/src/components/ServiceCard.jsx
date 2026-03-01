import './ServiceCard.css';

export default function ServiceCard({ name, description, icon, connected, onConnect, onDisconnect }) {
    return (
        <div className={`service-card ${connected ? 'connected' : ''}`}>
            <div className="service-card-icon">{icon}</div>
            <div className="service-card-content">
                <h3 className="service-card-name">{name}</h3>
                <p className="service-card-desc">{description}</p>
            </div>
            <div className="service-card-action">
                {connected ? (
                    <div className="service-card-connected">
                        <span className="connected-badge">
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                <path d="M3 7L6 10L11 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            Connected
                        </span>
                        {onDisconnect && (
                            <button className="btn-disconnect" onClick={onDisconnect}>
                                Disconnect
                            </button>
                        )}
                    </div>
                ) : (
                    <button className="btn-connect" onClick={onConnect}>
                        Connect
                    </button>
                )}
            </div>
        </div>
    );
}
