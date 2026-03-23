import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import './ActionItemReviewPage.css';

// ─── TagInput ─────────────────────────────────────────────────────────────────
function TagInput({ owners, onChange, options = [], placeholder = '' }) {
    const [inputVal, setInputVal] = useState('');
    const inputRef = useRef(null);
    const datalistId = `datalist-${Math.random().toString(36).substring(2, 9)}`;

    const addTag = (raw) => {
        const trimmed = raw.trim();
        if (!trimmed) return;
        const newOwners = [...owners];
        trimmed.split(',').forEach(part => {
            const p = part.trim();
            if (p && !newOwners.includes(p)) newOwners.push(p);
        });
        onChange(newOwners);
        setInputVal('');
    };

    const removeTag = (index) => onChange(owners.filter((_, i) => i !== index));

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(inputVal); }
        else if (e.key === 'Backspace' && inputVal === '' && owners.length > 0) removeTag(owners.length - 1);
    };

    return (
        <div className="tag-input-container" onClick={() => inputRef.current?.focus()}>
            {owners.map((owner, i) => (
                <span key={i} className="tag-chip">
                    <span className="tag-label">{owner}</span>
                    <button className="tag-remove" onClick={(e) => { e.stopPropagation(); removeTag(i); }}>×</button>
                </span>
            ))}
            <input
                ref={inputRef}
                className="tag-text-input"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={() => addTag(inputVal)}
                placeholder={owners.length === 0 ? placeholder || 'Add owner, press Enter…' : ''}
                list={options.length > 0 ? datalistId : undefined}
            />
            {options.length > 0 && (
                <datalist id={datalistId}>
                    {options.map(opt => <option key={opt} value={opt} />)}
                </datalist>
            )}
        </div>
    );
}

// ─── Flag Badge (expandable on click) ────────────────────────────────────────
function FlagBadge({ icon, text, colorClass }) {
    const [expanded, setExpanded] = useState(false);
    return (
        <span
            className={`flag-badge ${colorClass} ${expanded ? 'expanded' : ''}`}
            onClick={() => setExpanded(v => !v)}
            title="Click to expand"
        >
            {icon} <span className="flag-text">{text}</span>
        </span>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ActionItemReviewPage({ connections }) {
    const { transcriptId } = useParams();
    const navigate = useNavigate();

    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [pushing, setPushing] = useState(false);
    const [pushResult, setPushResult] = useState(null);

    // Subtab
    const [activeTab, setActiveTab] = useState('review');

    // Filters
    const [ownerFilters, setOwnerFilters] = useState([]);
    const [priorityFilter, setPriorityFilter] = useState('all');
    const [taskStatusFilter, setTaskStatusFilter] = useState('all');
    const [deadlineFrom, setDeadlineFrom] = useState('');
    const [deadlineTo, setDeadlineTo] = useState('');

    // Sort
    const [sortField, setSortField] = useState('none');
    const [sortDirection, setSortDirection] = useState('asc');

    const pollUntilReady = async (maxMs = 120000) => {
        const start = Date.now();
        while (Date.now() - start < maxMs) {
            const res = await fetch(`/api/gemini/status/${transcriptId}`);
            const data = await res.json();
            const analysis = data.analysis;

            if (analysis?.status === 'ready' && Array.isArray(analysis.items)) {
                setItems(analysis.items.map(item => ({
                    status: 'pending',
                    priority: '',
                    task_status: 'Not Started',
                    ...item, // Let the backend-saved item overwrite the defaults above
                    owner: Array.isArray(item.owner)
                        ? item.owner
                        : (item.owner ? [item.owner] : []),
                    description_flag: item.description_flag || null,
                    owner_flag: item.owner_flag || null,
                    gap_notes: Array.isArray(item.gap_notes)
                        ? item.gap_notes
                        : (item.gap_notes
                            ? item.gap_notes.split(',').map(s => s.trim()).filter(Boolean)
                            : []),
                })));
                return;
            }

            if (analysis?.status === 'error') throw new Error(analysis.error || 'Gemini analysis failed');
            await new Promise(r => setTimeout(r, 1200));
        }
        throw new Error('Timed out waiting for analysis');
    };

    const handleReanalyze = async () => {
        if (!window.confirm("Are you sure you want to reanalyze this meeting? All current items (approved, pending, and rejected) will be overwritten!")) return;
        setItems([]);
        setError(null);
        setLoading(true);
        try {
            await fetch('/api/gemini/enqueue', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ transcript_id: transcriptId, force: true })
            });
            await pollUntilReady();
        } catch (err) {
            setError(err?.message || 'Network error while reanalyzing');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!connections.transcription) { navigate('/dashboard'); return; }

        const fetchAnalysis = async () => {
            try {
                await fetch('/api/gemini/enqueue', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ transcript_id: transcriptId })
                });
                await pollUntilReady();
            } catch (err) {
                setError(err?.message || 'Network error while calling Gemini');
            } finally {
                setLoading(false);
            }
        };

        fetchAnalysis();
    }, [transcriptId, connections, navigate]);

    // Save state to backend
    const saveState = async (newItems) => {
        setItems(newItems);
        try {
            await fetch('/api/gemini/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ transcript_id: transcriptId, items: newItems })
            });
        } catch (err) {
            console.error('Failed to save state:', err);
        }
    };

    const handleAction = (id, action) => {
        const newItems = items.map(item => item.id === id ? { ...item, status: action } : item);
        saveState(newItems);
        setPushResult(null);
    };

    const handleEdit = (id, field, value) => {
        const newItems = items.map(item => item.id === id ? { ...item, [field]: value } : item);
        saveState(newItems);
    };

    // Push approved items to Google Calendar using deadline date, and Delete items that are no longer approved but were pushed
    const handlePushToCalendar = async () => {
        const approvedItems = items.filter(i => i.status === 'approved');
        const deleteItems = items.filter(i => i.status !== 'approved' && i.pushed_to_calendar && i.event_id);

        if (approvedItems.length === 0 && deleteItems.length === 0) return;

        setPushing(true);
        setPushResult(null);
        let successCount = 0;
        let deleteCount = 0;
        const errors = [];
        const pushedIds = [];
        const deletedIds = [];
        const eventIdsMap = {}; // store new/updated event ids

        // 1. Process deletions
        for (const item of deleteItems) {
            try {
                const res = await fetch(`/api/calendar/events/${item.event_id}`, { method: 'DELETE' });
                const data = await res.json();
                if (data.success) {
                    deleteCount++;
                    deletedIds.push(item.id);
                } else {
                    errors.push(`Delete failed: ${data.error}`);
                }
            } catch (err) {
                errors.push(err.message);
            }
        }

        const formatTime12H = (timeStr) => {
            if (!timeStr) return '';
            const [h, m] = timeStr.split(':');
            let hours = parseInt(h, 10);
            const ampm = hours >= 12 ? 'PM' : 'AM';
            hours = hours % 12 || 12;
            return `${hours}:${m} ${ampm}`;
        };

        for (const item of approvedItems) {
            try {
                // All-day event requires start and end to be YYYY-MM-DD
                // End date is exclusive, so it must be the day after
                let startDate, endDate;
                if (item.deadline) {
                    startDate = item.deadline;
                    const d = new Date(item.deadline);
                    d.setDate(d.getDate() + 1);
                    endDate = d.toISOString().split('T')[0];
                } else {
                    const today = new Date();
                    const tomorrow = new Date(today);
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    const dayAfter = new Date(tomorrow);
                    dayAfter.setDate(dayAfter.getDate() + 1);

                    startDate = tomorrow.toISOString().split('T')[0];
                    endDate = dayAfter.toISOString().split('T')[0];
                }

                const ownerStr = Array.isArray(item.owner) ? item.owner.join(', ') : (item.owner || 'Unassigned');
                const deadlineStr = item.deadline ? `${item.deadline}${item.deadline_time ? ' at ' + formatTime12H(item.deadline_time) : ''}` : 'None';
                const desc = `${item.description}\n\nOwner(s): ${ownerStr}\nDeadline: ${deadlineStr}\nPriority: ${item.priority || 'N/A'}`;

                const endpoint = item.event_id ? `/api/calendar/events/${item.event_id}` : '/api/calendar/events';
                const method = item.event_id ? 'PUT' : 'POST';

                const res = await fetch(endpoint, {
                    method: method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        summary: item.description.length > 50
                            ? item.description.substring(0, 50) + '…'
                            : item.description,
                        description: desc,
                        start_time: startDate,
                        end_time: endDate,
                    })
                });

                const data = await res.json();
                if (data.success) {
                    successCount++;
                    pushedIds.push(item.id);
                    eventIdsMap[item.id] = data.event_id;
                } else {
                    errors.push(data.error || 'Unknown error');
                }
            } catch (err) {
                errors.push(err.message);
            }
        }

        let newItems = items;
        if (deletedIds.length > 0) {
            newItems = newItems.map(item =>
                deletedIds.includes(item.id)
                    ? { ...item, pushed_to_calendar: false, event_id: null }
                    : item
            );
        }
        if (pushedIds.length > 0) {
            newItems = newItems.map(item =>
                pushedIds.includes(item.id)
                    ? { ...item, pushed_to_calendar: true, event_id: eventIdsMap[item.id] }
                    : item
            );
        }

        if (deletedIds.length > 0 || pushedIds.length > 0) {
            saveState(newItems);
        }

        setPushing(false);
        setPushResult({ success: errors.length === 0, count: successCount + deleteCount, errors });
    };

    const handleCreateActionItem = () => {
        const newItem = {
            id: Math.max(0, ...items.map(i => i.id)) + 1,
            description: '',
            owner: [],
            deadline: '',
            deadline_time: '',
            priority: 'Medium',
            task_status: 'Not Started',
            status: 'approved',
            source: 'manual'
        };
        saveState([...items, newItem]);
    };

    // ─── Loading / Error ──────────────────────────────────────────────────────
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

    // ─── Counts ───────────────────────────────────────────────────────────────
    const reviewCount = items.filter(i => i.status === 'pending').length;
    const approvedCount = items.filter(i => i.status === 'approved').length;
    const rejectedCount = items.filter(i => i.status === 'rejected').length;

    const statusForTab = { review: 'pending', approved: 'approved', rejected: 'rejected' };
    const tabItems = items.filter(i => i.status === statusForTab[activeTab]);

    // Owner options for filter (all items)
    const allOwners = Array.from(new Set(
        items.flatMap(i => (Array.isArray(i.owner) ? i.owner : []))
    )).filter(Boolean).sort();

    // ─── Filter ───────────────────────────────────────────────────────────────
    const filteredItems = tabItems.filter(item => {
        const owners = Array.isArray(item.owner) ? item.owner : [];
        if (ownerFilters.length > 0 && !ownerFilters.some(filterOwner => owners.includes(filterOwner))) return false;
        if (priorityFilter !== 'all' && (item.priority || '') !== priorityFilter) return false;
        if (taskStatusFilter !== 'all' && (item.task_status || 'Not Started') !== taskStatusFilter) return false;
        if (deadlineFrom && item.deadline && item.deadline < deadlineFrom) return false;
        if (deadlineTo && item.deadline && item.deadline > deadlineTo) return false;
        // If a deadline range is specified but item has no deadline, exclude it
        if ((deadlineFrom || deadlineTo) && !item.deadline) return false;
        return true;
    });

    // ─── Sort ─────────────────────────────────────────────────────────────────
    const sortedItems = [...filteredItems].sort((a, b) => {
        if (sortField === 'none') return 0;
        const dir = sortDirection === 'asc' ? 1 : -1;
        const getPriorityRank = (p) => ({ 'High': 0, 'Medium': 1, 'Low': 2 }[p] ?? 3);
        const getStatusRank = (s) => ({ 'Not Started': 0, 'In Progress': 1, 'Completed': 2 }[s] ?? 3);

        if (sortField === 'owner') {
            // Sort by first owner name alphabetically; empty arrays sort last
            const av = (Array.isArray(a.owner) && a.owner.length > 0 ? a.owner[0] : '\uFFFF').toLowerCase();
            const bv = (Array.isArray(b.owner) && b.owner.length > 0 ? b.owner[0] : '\uFFFF').toLowerCase();
            return av < bv ? -dir : av > bv ? dir : 0;
        }
        if (sortField === 'priority') return (getPriorityRank(a.priority || '') - getPriorityRank(b.priority || '')) * dir;
        if (sortField === 'task_status') return (getStatusRank(a.task_status || 'Not Started') - getStatusRank(b.task_status || 'Not Started')) * dir;
        if (sortField === 'deadline') {
            const ad = a.deadline ? Date.parse(a.deadline) : NaN;
            const bd = b.deadline ? Date.parse(b.deadline) : NaN;
            if (isNaN(ad) && isNaN(bd)) return 0;
            if (isNaN(ad)) return dir;
            if (isNaN(bd)) return -dir;
            return (ad - bd) * dir;
        }
        return 0;
    });

    return (
        <div className="review-page">
            <div className="bg-mesh" />
            <div className="container">
                {/* Header */}
                <div className="review-header animate-fade-in-up" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                        <button className="btn-back" onClick={() => navigate('/dashboard')}>← Back</button>
                        <h1>Review Action Items</h1>
                        <p>Review Gemini's action items and fill in any missing gaps like owner, deadline, priority, and status.</p>
                    </div>
                    <button className="btn-secondary" onClick={handleReanalyze} style={{ marginTop: '2.5rem' }}>
                        🔄 Reanalyze Meeting
                    </button>
                </div>

                {/* Subtabs */}
                <div className="subtab-bar animate-fade-in-up">
                    {[
                        { key: 'review', label: 'Under Review', count: reviewCount, cls: 'review-count' },
                        { key: 'approved', label: 'Approved', count: approvedCount, cls: 'approved-count' },
                        { key: 'rejected', label: 'Rejected', count: rejectedCount, cls: 'rejected-count' },
                    ].map(tab => (
                        <button
                            key={tab.key}
                            className={`subtab-btn ${activeTab === tab.key ? 'active' : ''}`}
                            onClick={() => setActiveTab(tab.key)}
                        >
                            {tab.label}
                            <span className={`tab-count ${tab.cls}`}>{tab.count}</span>
                        </button>
                    ))}
                </div>

                {/* Approved tab: Push to Calendar */}
                {activeTab === 'approved' && (
                    <div className="approved-toolbar animate-fade-in-up" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        <button
                            className="btn-push-calendar"
                            onClick={handlePushToCalendar}
                            disabled={pushing || (items.filter(i => i.status === 'approved').length === 0 && items.filter(i => i.status !== 'approved' && i.pushed_to_calendar && i.event_id).length === 0)}
                        >
                            {pushing
                                ? 'Adding/Updating/Deleting Calendar Events…'
                                : pushResult?.success
                                    ? `✓ ${pushResult.count} Event${pushResult.count !== 1 ? 's' : ''} Synced on Google Calendar`
                                    : `📅 Sync Events to Google Calendar`}
                        </button>
                        <button
                            className="btn-secondary"
                            onClick={handleCreateActionItem}
                            style={{ padding: '0.65rem 1rem' }}
                        >
                            + Create Action Item
                        </button>
                        {pushResult && !pushResult.success && pushResult.errors.length > 0 && (
                            <span className="push-error-hint">
                                {pushResult.count} succeeded, {pushResult.errors.length} failed — {pushResult.errors[0]}
                            </span>
                        )}
                    </div>
                )}

                {/* Filter + Sort Bar */}
                <div className="filter-section animate-fade-in-up stagger-1">
                    <div className="filter-section-label">Filter By</div>
                    <div className="filter-bar">
                        <div className="filter-group filter-group-owner">
                            <label>Owner(s)</label>
                            <TagInput
                                owners={ownerFilters}
                                onChange={setOwnerFilters}
                                options={allOwners}
                                placeholder="Any owner (all)"
                            />
                        </div>
                        <div className="filter-group">
                            <label>Priority</label>
                            <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className="edit-field">
                                <option value="all">All</option>
                                <option value="High">High</option>
                                <option value="Medium">Medium</option>
                                <option value="Low">Low</option>
                            </select>
                        </div>
                        <div className="filter-group">
                            <label>Status</label>
                            <select value={taskStatusFilter} onChange={(e) => setTaskStatusFilter(e.target.value)} className="edit-field">
                                <option value="all">All</option>
                                <option value="Not Started">Not Started</option>
                                <option value="In Progress">In Progress</option>
                                <option value="Completed">Completed</option>
                            </select>
                        </div>
                        <div className="filter-group filter-group-deadline">
                            <label>Deadline Range</label>
                            <div className="deadline-range-row">
                                <input
                                    type="date"
                                    className="edit-field deadline-range-input"
                                    value={deadlineFrom}
                                    onChange={(e) => setDeadlineFrom(e.target.value)}
                                    title="From date"
                                />
                                <span className="deadline-range-sep">→</span>
                                <input
                                    type="date"
                                    className="edit-field deadline-range-input"
                                    value={deadlineTo}
                                    onChange={(e) => setDeadlineTo(e.target.value)}
                                    title="To date"
                                />
                            </div>
                        </div>
                        <div className="filter-group sort-group">
                            <label>Sort By</label>
                            <div className="sort-row">
                                <select value={sortField} onChange={(e) => setSortField(e.target.value)} className="edit-field">
                                    <option value="none">None</option>
                                    <option value="owner">Owner</option>
                                    <option value="priority">Priority</option>
                                    <option value="task_status">Status</option>
                                    <option value="deadline">Deadline</option>
                                </select>
                                <select value={sortDirection} onChange={(e) => setSortDirection(e.target.value)} className="edit-field">
                                    <option value="asc">Ascending</option>
                                    <option value="desc">Descending</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Items Grid */}
                <div className="items-grid animate-fade-in-up stagger-1">
                    {sortedItems.length === 0 ? (
                        <div className="empty-tab">
                            <span className="empty-tab-icon">
                                {activeTab === 'review' ? '🎉' : activeTab === 'approved' ? '✅' : '🗑️'}
                            </span>
                            <p>
                                {activeTab === 'review'
                                    ? 'No items left under review.'
                                    : activeTab === 'approved'
                                        ? 'No approved items yet. Head to "Under Review" to approve some.'
                                        : 'No rejected items.'}
                            </p>
                        </div>
                    ) : sortedItems.map(item => (
                        <div key={item.id} className={`item-card ${item.status}`}>
                            <div className="item-header">
                                <span className={`source-badge ${item.source}`}>
                                    {item.source === 'suggested' ? '✨ New Insight' : '📝 Transcript'}
                                </span>
                                {/* Each gap note as its own bubble */}
                                {(Array.isArray(item.gap_notes) ? item.gap_notes : []).map((gap, gi) => (
                                    <FlagBadge key={`gap-${gi}`} icon="⚠️" text={gap} colorClass="gap-flag" />
                                ))}
                                {item.description_flag && (
                                    <FlagBadge icon="📋" text={item.description_flag} colorClass="description-flag" />
                                )}
                                {item.owner_flag && (
                                    <FlagBadge icon="👤" text={item.owner_flag} colorClass="owner-flag" />
                                )}
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
                                        <label>Owner(s)</label>
                                        <TagInput
                                            owners={Array.isArray(item.owner) ? item.owner : (item.owner ? [item.owner] : [])}
                                            onChange={(v) => handleEdit(item.id, 'owner', v)}
                                            options={allOwners}
                                        />
                                    </div>
                                    <div className="field-group">
                                        <label>Deadline</label>
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            <input
                                                type="date"
                                                className="edit-field"
                                                value={item.deadline || ''}
                                                onChange={(e) => handleEdit(item.id, 'deadline', e.target.value)}
                                            />
                                            <input
                                                type="time"
                                                step="900"
                                                className="edit-field"
                                                value={item.deadline_time || ''}
                                                onChange={(e) => handleEdit(item.id, 'deadline_time', e.target.value)}
                                            />
                                        </div>
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
                                {activeTab === 'review' ? (
                                    <>
                                        <button className="btn-approve" onClick={() => handleAction(item.id, 'approved')}>✓ Approve</button>
                                        <button className="btn-reject" onClick={() => handleAction(item.id, 'rejected')}>✕ Reject</button>
                                    </>
                                ) : (
                                    <button className="btn-reset" onClick={() => handleAction(item.id, 'pending')}>↩ Undo</button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Footer summary (non-approved tabs) */}
                {activeTab !== 'approved' && (
                    <div className="review-footer animate-fade-in-up stagger-2">
                        <div className="summary">{approvedCount} of {items.length} items approved</div>
                    </div>
                )}
            </div>
        </div>
    );
}
