import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import './ActionItemReviewPage.css';

export default function ActionItemReviewPage({ connections }) {
    const { transcriptId } = useParams();
    const navigate = useNavigate();

    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [pushing, setPushing] = useState(false);
    const [pushSuccess, setPushSuccess] = useState(false);
    const [ownerFilter, setOwnerFilter] = useState('all');
    const [priorityFilter, setPriorityFilter] = useState('all');
    const [taskStatusFilter, setTaskStatusFilter] = useState('all');
    const [sortField, setSortField] = useState('none');
    const [sortDirection, setSortDirection] = useState('asc');

    useEffect(() => {
        if (!connections.transcription) {
            navigate('/dashboard');
            return;
        }

        const pollUntilReady = async (maxMs = 60000) => {
            const start = Date.now();
            while (Date.now() - start < maxMs) {
                const res = await fetch(`/api/gemini/status/${transcriptId}`);
                const data = await res.json();
                const analysis = data.analysis;

                if (analysis?.status === 'ready' && Array.isArray(analysis.items)) {
                    setItems(analysis.items.map(item => ({
                        ...item,
                        // reviewStatus: pending/approved/rejected (local UI)
                        status: 'pending',
                        // keep Gemini-provided priority/status if present, otherwise blank/undefined
                        priority: item.priority || '',
                        task_status: item.task_status || 'Not Started',
                    })));
                    return;
                }

                if (analysis?.status === 'error') {
                    throw new Error(analysis.error || 'Gemini analysis failed');
                }

                await new Promise(r => setTimeout(r, 1200));
            }
            throw new Error('Timed out waiting for analysis');
        };

        const fetchAnalysis = async () => {
            try {
                // Ensure analysis is enqueued in the background
                await fetch('/api/gemini/enqueue', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ transcript_id: transcriptId })
                });
                await pollUntilReady();
            } catch (err) {
                setError(err?.message || "Network error while calling Gemini");
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        fetchAnalysis();
    }, [transcriptId, connections, navigate]);

    const handleAction = (id, action) => {
        setItems(items.map(item =>
            item.id === id ? { ...item, status: action } : item
        ));
    };

    const handleEdit = (id, field, value) => {
        setItems(items.map(item =>
            item.id === id ? { ...item, [field]: value } : item
        ));
    };

    const handlePushToCalendar = async () => {
        const approvedItems = items.filter(i => i.status === 'approved');
        if (approvedItems.length === 0) return;

        setPushing(true);
        let allSuccess = true;

        for (const item of approvedItems) {
            try {
                // Determine start and end times (dummy values based on today if relative)
                // In a production app, Gemini should parse absolute ISO dates, but for now we'll do a simple mock
                // or just use today + 1 hour as a placeholder if we can't parse it.
                const now = new Date();
                const start = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour from now
                const end = new Date(start.getTime() + 30 * 60 * 1000);   // 30 mins later

                const desc = `${item.description}\n\nOwner: ${item.owner || 'Unassigned'}\nDeadline: ${item.deadline || 'None'}`;

                const res = await fetch('/api/calendar/events', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        summary: `Action: ${item.description.substring(0, 30)}...`,
                        description: desc,
                        start_time: start.toISOString(),
                        end_time: end.toISOString()
                    })
                });

                const data = await res.json();
                if (!data.success) allSuccess = false;
            } catch (err) {
                console.error("Failed to push event", err);
                allSuccess = false;
            }
        }

        setPushing(false);
        if (allSuccess) setPushSuccess(true);
    };

    if (loading) {
        return (
            <div className="review-page">
                <div className="container">
                    <div className="loading-state">
                        <div className="spinner">✨</div>
                        <h2>Gemini is analyzing your meeting...</h2>
                        <p>Extracting action items, identifying owners, and finding gaps.</p>
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="review-page">
                <div className="container">
                    <div className="error-state">
                        <h2>Analysis Failed</h2>
                        <p>{error}</p>
                        <button className="btn-secondary" onClick={() => navigate('/dashboard')}>Back to Dashboard</button>
                    </div>
                </div>
            </div>
        );
    }

    const approvedCount = items.filter(i => i.status === 'approved').length;

    const uniqueOwners = Array.from(new Set(items.map(i => i.owner).filter(Boolean)));

    const filteredItems = items.filter(item => {
        if (ownerFilter !== 'all' && item.owner !== ownerFilter) return false;
        if (priorityFilter !== 'all' && (item.priority || '') !== priorityFilter) return false;
        if (taskStatusFilter !== 'all' && (item.task_status || 'Not Started') !== taskStatusFilter) return false;
        return true;
    });

    const sortedItems = [...filteredItems].sort((a, b) => {
        if (sortField === 'none') return 0;

        const dir = sortDirection === 'asc' ? 1 : -1;

        const getPriorityRank = (p) => {
            if (p === 'High') return 0;
            if (p === 'Medium') return 1;
            if (p === 'Low') return 2;
            return 3; // blank/unknown last
        };

        const getStatusRank = (s) => {
            if (s === 'Not Started') return 0;
            if (s === 'In Progress') return 1;
            if (s === 'Completed') return 2;
            return 3;
        };

        if (sortField === 'owner') {
            const av = (a.owner || '').toLowerCase();
            const bv = (b.owner || '').toLowerCase();
            if (av < bv) return -1 * dir;
            if (av > bv) return 1 * dir;
            return 0;
        }

        if (sortField === 'priority') {
            const av = getPriorityRank(a.priority || '');
            const bv = getPriorityRank(b.priority || '');
            if (av < bv) return -1 * dir;
            if (av > bv) return 1 * dir;
            return 0;
        }

        if (sortField === 'task_status') {
            const av = getStatusRank(a.task_status || 'Not Started');
            const bv = getStatusRank(b.task_status || 'Not Started');
            if (av < bv) return -1 * dir;
            if (av > bv) return 1 * dir;
            return 0;
        }

        if (sortField === 'deadline') {
            const ad = a.deadline ? Date.parse(a.deadline) : NaN;
            const bd = b.deadline ? Date.parse(b.deadline) : NaN;
            if (isNaN(ad) && isNaN(bd)) return 0;
            if (isNaN(ad)) return 1 * dir; // blank goes last
            if (isNaN(bd)) return -1 * dir;
            if (ad < bd) return -1 * dir;
            if (ad > bd) return 1 * dir;
            return 0;
        }

        return 0;
    });

    return (
        <div className="review-page">
            <div className="bg-mesh" />
            <div className="container">
                <div className="review-header animate-fade-in-up">
                    <button className="btn-back" onClick={() => navigate('/dashboard')}>← Back</button>
                    <h1>Review Action Items</h1>
                    <p>Review Gemini’s action items and fill in any missing gaps like owner, deadline, priority, and status.</p>
                </div>

                <div className="filter-bar animate-fade-in-up stagger-1">
                    <div className="filter-group">
                        <label>Owner</label>
                        <select
                            value={ownerFilter}
                            onChange={(e) => setOwnerFilter(e.target.value)}
                            className="edit-field"
                        >
                            <option value="all">All</option>
                            {uniqueOwners.map(o => (
                                <option key={o} value={o}>{o}</option>
                            ))}
                        </select>
                    </div>
                    <div className="filter-group">
                        <label>Priority</label>
                        <select
                            value={priorityFilter}
                            onChange={(e) => setPriorityFilter(e.target.value)}
                            className="edit-field"
                        >
                            <option value="all">All</option>
                            <option value="High">High</option>
                            <option value="Medium">Medium</option>
                            <option value="Low">Low</option>
                        </select>
                    </div>
                    <div className="filter-group">
                        <label>Status</label>
                        <select
                            value={taskStatusFilter}
                            onChange={(e) => setTaskStatusFilter(e.target.value)}
                            className="edit-field"
                        >
                            <option value="all">All</option>
                            <option value="Not Started">Not Started</option>
                            <option value="In Progress">In Progress</option>
                            <option value="Completed">Completed</option>
                        </select>
                    </div>
                    <div className="filter-group sort-group">
                        <label>Sort By</label>
                        <div className="sort-row">
                            <select
                                value={sortField}
                                onChange={(e) => setSortField(e.target.value)}
                                className="edit-field"
                            >
                                <option value="none">None</option>
                                <option value="owner">Owner</option>
                                <option value="priority">Priority</option>
                                <option value="task_status">Status</option>
                                <option value="deadline">Deadline</option>
                            </select>
                            <select
                                value={sortDirection}
                                onChange={(e) => setSortDirection(e.target.value)}
                                className="edit-field"
                            >
                                <option value="asc">Asc</option>
                                <option value="desc">Desc</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div className="items-grid animate-fade-in-up stagger-1">
                    {sortedItems.map(item => (
                        <div key={item.id} className={`item-card ${item.status}`}>
                            <div className="item-header">
                                <span className={`source-badge ${item.source}`}>{item.source === 'suggested' ? '✨ New Insight' : '📝 Transcript'}</span>
                                {item.gap_notes && <span className="gap-badge">⚠️ {item.gap_notes}</span>}
                            </div>

                            <div className="item-body">
                                <textarea
                                    className="edit-field desc"
                                    value={item.description}
                                    onChange={(e) => handleEdit(item.id, 'description', e.target.value)}
                                    placeholder="Task description"
                                />

                                <div className="meta-fields">
                                    <div className="field-group">
                                        <label>Owner</label>
                                        <input
                                            type="text"
                                            className="edit-field"
                                            value={item.owner || ''}
                                            onChange={(e) => handleEdit(item.id, 'owner', e.target.value)}
                                            placeholder="Unassigned"
                                        />
                                    </div>
                                    <div className="field-group">
                                        <label>Deadline</label>
                                        <input
                                            type="datetime-local"
                                            className="edit-field"
                                            value={item.deadline || ''}
                                            onChange={(e) => handleEdit(item.id, 'deadline', e.target.value)}
                                        />
                                    </div>
                                    <div className="field-group">
                                        <label>Priority</label>
                                        <select
                                            className="edit-field"
                                            value={item.priority || ''}
                                            onChange={(e) => handleEdit(item.id, 'priority', e.target.value)}
                                        >
                                            <option value="">--</option>
                                            <option value="High">High</option>
                                            <option value="Medium">Medium</option>
                                            <option value="Low">Low</option>
                                        </select>
                                    </div>
                                    <div className="field-group">
                                        <label>Status</label>
                                        <select
                                            className="edit-field"
                                            value={item.task_status || 'Not Started'}
                                            onChange={(e) => handleEdit(item.id, 'task_status', e.target.value)}
                                        >
                                            <option value="Not Started">Not Started</option>
                                            <option value="In Progress">In Progress</option>
                                            <option value="Completed">Completed</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <div className="item-actions">
                                {item.status === 'pending' ? (
                                    <>
                                        <button className="btn-approve" onClick={() => handleAction(item.id, 'approved')}>✓ Approve</button>
                                        <button className="btn-reject" onClick={() => handleAction(item.id, 'rejected')}>✕ Reject</button>
                                    </>
                                ) : (
                                    <button className="btn-reset" onClick={() => handleAction(item.id, 'pending')}>
                                        Undo {item.status}
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="review-footer animate-fade-in-up stagger-2">
                    <div className="summary">
                        {approvedCount} of {items.length} items approved
                    </div>
                    {connections.calendar?.connected && approvedCount > 0 && (
                        <button
                            className="btn-primary push-btn"
                            onClick={handlePushToCalendar}
                            disabled={pushing || pushSuccess}
                        >
                            {pushing ? 'Pushing...' : pushSuccess ? '✓ Scheduled via Google Calendar' : `Push ${approvedCount} Items to Calendar`}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
