import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './SettingsPage.css';

function SettingsPage() {
    const navigate = useNavigate();
<<<<<<< HEAD
    const [aliases, setAliases] = useState([]);
=======
    const [aliases, setAliases] = useState({});
>>>>>>> 03f7540674afb827f90eaf7d4f54e5aaa69ff2c0
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [saving, setSaving] = useState(false);

<<<<<<< HEAD
    // New name input
    const [newName, setNewName] = useState('');
=======
    // New alias inputs
    const [newAliasFrom, setNewAliasFrom] = useState('');
    const [newAliasTo, setNewAliasTo] = useState('');
>>>>>>> 03f7540674afb827f90eaf7d4f54e5aaa69ff2c0

    useEffect(() => {
        fetchAliases();
    }, []);

    const fetchAliases = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/settings/aliases');
            const data = await res.json();
            if (data.success) {
<<<<<<< HEAD
                setAliases(Array.isArray(data.aliases) ? data.aliases : []);
=======
                setAliases(data.aliases || {});
>>>>>>> 03f7540674afb827f90eaf7d4f54e5aaa69ff2c0
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
<<<<<<< HEAD
                alert("Failed to save names: " + data.error);
            }
        } catch (err) {
            alert("Error saving names: " + err.message);
=======
                alert("Failed to save aliases: " + data.error);
            }
        } catch (err) {
            alert("Error saving aliases: " + err.message);
>>>>>>> 03f7540674afb827f90eaf7d4f54e5aaa69ff2c0
        } finally {
            setSaving(false);
        }
    };

<<<<<<< HEAD
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
=======
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
>>>>>>> 03f7540674afb827f90eaf7d4f54e5aaa69ff2c0
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
<<<<<<< HEAD
                        <h2>Correct Name List</h2>
                        <p>Add the correct spelling of names. Gemini will automatically identify misspellings in transcripts and update them to these correct names.</p>
=======
                        <h2>Name Alias Mapping</h2>
                        <p>Define known misspellings or nicknames. Gemini will automatically correct them in future meetings.</p>
>>>>>>> 03f7540674afb827f90eaf7d4f54e5aaa69ff2c0
                    </div>

                    {loading ? (
                        <p className="loading-text">Loading...</p>
                    ) : error ? (
                        <p className="error-text">{error}</p>
                    ) : (
                        <div className="alias-manager">
<<<<<<< HEAD
                            <form className="alias-add-form" onSubmit={handleAddName}>
=======
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
>>>>>>> 03f7540674afb827f90eaf7d4f54e5aaa69ff2c0
                                <input
                                    type="text"
                                    className="edit-field"
                                    placeholder="Correct Name (e.g. John Smith)"
<<<<<<< HEAD
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    disabled={saving}
                                    style={{ flex: 1 }}
                                />
                                <button type="submit" className="btn-primary" disabled={saving || !newName.trim()}>
                                    {saving ? 'Adding...' : 'Add Name'}
=======
                                    value={newAliasTo}
                                    onChange={(e) => setNewAliasTo(e.target.value)}
                                    disabled={saving}
                                />
                                <button type="submit" className="btn-primary" disabled={saving || !newAliasFrom.trim() || !newAliasTo.trim()}>
                                    {saving ? 'Adding...' : 'Add'}
>>>>>>> 03f7540674afb827f90eaf7d4f54e5aaa69ff2c0
                                </button>
                            </form>

                            <div className="alias-list">
<<<<<<< HEAD
                                {aliases.length === 0 ? (
                                    <p className="empty-text">No names added yet.</p>
=======
                                {Object.keys(aliases).length === 0 ? (
                                    <p className="empty-text">No name mappings defined yet.</p>
>>>>>>> 03f7540674afb827f90eaf7d4f54e5aaa69ff2c0
                                ) : (
                                    <table className="alias-table">
                                        <thead>
                                            <tr>
<<<<<<< HEAD
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
=======
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
>>>>>>> 03f7540674afb827f90eaf7d4f54e5aaa69ff2c0
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
