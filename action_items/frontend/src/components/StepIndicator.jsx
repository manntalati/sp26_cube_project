import './StepIndicator.css';

export default function StepIndicator({ currentStep, totalSteps, labels }) {
    return (
        <div className="step-indicator">
            {Array.from({ length: totalSteps }, (_, i) => {
                const stepNum = i + 1;
                const isActive = stepNum === currentStep;
                const isCompleted = stepNum < currentStep;

                return (
                    <div key={i} className="step-indicator-item">
                        <div
                            className={`step-dot ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}
                        >
                            {isCompleted ? (
                                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                    <path d="M3 7L6 10L11 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            ) : (
                                <span>{stepNum}</span>
                            )}
                        </div>
                        {labels && labels[i] && (
                            <span className={`step-label ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}>
                                {labels[i]}
                            </span>
                        )}
                        {i < totalSteps - 1 && (
                            <div className={`step-line ${isCompleted ? 'completed' : ''}`} />
                        )}
                    </div>
                );
            })}
        </div>
    );
}
