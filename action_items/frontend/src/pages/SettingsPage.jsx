import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './SettingsPage.css';

function SettingsPage() {
    const navigate = useNavigate();
    const [aliases, setAliases] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [saving, setSaving] = useState(false);

    // New alias inputs
    const [newAliasFrom, setNewAliasFrom] = useState('');
    const [newAliasTo, setNewAliasTo] = useState('');

    useEffect(() => {
        fetchAliases();
    }, []);

    const fetchAliases = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/settings/aliases');
            const data = await res.json();
            if (data.success) {
                setAliases(data.aliases || {});
            } else {
                setError(data.error);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const saveAliasesToServer = async (newAliases) => {
        setSaving(true);
        try {
            const res = await fetch('/api/settings/aliases', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ aliases: newAliases })
            });
            const data = await res.json();
            if (data.success) {
                setAliases(data.aliases);
            } else {
                alert("Failed to save aliases: " + data.error);
            }
        } catch (err) {
            alert("Error saving aliases: " + err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleAddAlias = (e) => {
        e.preventDefault();
        const from = newAliasFrom.trim();
        const to = newAliasTo.trim();
        if (!from || !to) return;

        const updated = { ...aliases, [from]: to };
        setNewAliasFrom('');
        setNewAliasTo('');
        saveAliasesToServer(updated);
    };

    const handleRemoveAlias = (key) => {
        const updated = { ...aliases };
        delete updated[key];
        saveAliasesToServer(updated);
    };

    return (
        <div className="settings-page">
            <header className="page-header">
                <div className="header-left">
                    <button className="btn-icon" onClick={() => navigate('/dashboard')}>
                        ← Back
                    </button>
                    <h1>Settings</h1>
                </div>
            </header>

            <main className="container">
                <div className="settings-section animate-fade-in-up">
                    <div className="section-header">
                        <h2>Name Alias Mapping</h2>
                        <p>Define known misspellings or nicknames. Gemini will automatically correct them in future meetings.</p>
                    </div>

                    {loading ? (
                        <p className="loading-text">Loading...</p>
                    ) : error ? (
                        <p className="error-text">{error}</p>
                    ) : (
                        <div className="alias-manager">
                            <form className="alias-add-form" onSubmit={handleAddAlias}>
                                <input
                                    type="text"
                                    className="edit-field"
                                    placeholder="Misspelled/Nickname (e.g. Jon)"
                                    value={newAliasFrom}
                                    onChange={(e) => setNewAliasFrom(e.target.value)}
                                    disabled={saving}
                                />
                                <span className="alias-arrow">→</span>
                                <input
                                    type="text"
                                    className="edit-field"
                                    placeholder="Correct Name (e.g. John Smith)"
                                    value={newAliasTo}
                                    onChange={(e) => setNewAliasTo(e.target.value)}
                                    disabled={saving}
                                />
                                <button type="submit" className="btn-primary" disabled={saving || !newAliasFrom.trim() || !newAliasTo.trim()}>
                                    {saving ? 'Adding...' : 'Add'}
                                </button>
                            </form>

                            <div className="alias-list">
                                {Object.keys(aliases).length === 0 ? (
                                    <p className="empty-text">No name mappings defined yet.</p>
                                ) : (
                                    <table className="alias-table">
                                        <thead>
                                            <tr>
                                                <th>Original (Transcript)</th>
                                                <th>Replaced With</th>
                                                <th></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {Object.entries(aliases).map(([key, value]) => (
                                                <tr key={key}>
                                                    <td><code>{key}</code></td>
                                                    <td><strong>{value}</strong></td>
                                                    <td className="actions-cell">
                                                        <button
                                                            className="btn-remove"
                                                            onClick={() => handleRemoveAlias(key)}
                                                            disabled={saving}
                                                            title="Delete Mapping"
                                                        >
                                                            ×
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}

export default SettingsPage;
