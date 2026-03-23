import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './SettingsPage.css';

function SettingsPage() {
    const navigate = useNavigate();
    const [aliases, setAliases] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [saving, setSaving] = useState(false);

    // New name input
    const [newName, setNewName] = useState('');

    useEffect(() => {
        fetchAliases();
    }, []);

    const fetchAliases = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/settings/aliases');
            const data = await res.json();
            if (data.success) {
                setAliases(Array.isArray(data.aliases) ? data.aliases : []);
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
                alert("Failed to save names: " + data.error);
            }
        } catch (err) {
            alert("Error saving names: " + err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleAddName = (e) => {
        e.preventDefault();
        const name = newName.trim();
        if (!name) return;

        if (aliases.includes(name)) {
            alert("This name is already in the list.");
            return;
        }

        const updated = [...aliases, name];
        setNewName('');
        saveAliasesToServer(updated);
    };

    const handleRemoveName = (name) => {
        const updated = aliases.filter(n => n !== name);
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
                        <h2>Correct Name List</h2>
                        <p>Add the correct spelling of names. Gemini will automatically identify misspellings in transcripts and update them to these correct names.</p>
                    </div>

                    {loading ? (
                        <p className="loading-text">Loading...</p>
                    ) : error ? (
                        <p className="error-text">{error}</p>
                    ) : (
                        <div className="alias-manager">
                            <form className="alias-add-form" onSubmit={handleAddName}>
                                <input
                                    type="text"
                                    className="edit-field"
                                    placeholder="Correct Name (e.g. John Smith)"
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    disabled={saving}
                                    style={{ flex: 1 }}
                                />
                                <button type="submit" className="btn-primary" disabled={saving || !newName.trim()}>
                                    {saving ? 'Adding...' : 'Add Name'}
                                </button>
                            </form>

                            <div className="alias-list">
                                {aliases.length === 0 ? (
                                    <p className="empty-text">No names added yet.</p>
                                ) : (
                                    <table className="alias-table">
                                        <thead>
                                            <tr>
                                                <th>Correct Name</th>
                                                <th style={{ width: '50px' }}></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {aliases.map((name) => (
                                                <tr key={name}>
                                                    <td><strong>{name}</strong></td>
                                                    <td className="actions-cell">
                                                        <button
                                                            className="btn-remove"
                                                            onClick={() => handleRemoveName(name)}
                                                            disabled={saving}
                                                            title="Delete Name"
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
