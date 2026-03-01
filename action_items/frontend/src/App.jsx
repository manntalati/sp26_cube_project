import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import LandingPage from './pages/LandingPage';
import ConnectTranscriptionPage from './pages/ConnectTranscriptionPage';
import ConnectCalendarPage from './pages/ConnectCalendarPage';
import DashboardPage from './pages/DashboardPage';
import './index.css';

function App() {
  const [connections, setConnections] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch initial connection status from backend
    fetch('/api/auth/status')
      .then((res) => res.json())
      .then((data) => {
        const initialConnections = {};
        if (data.fireflies?.connected) {
          initialConnections.transcription = {
            service: 'firefly',
            name: 'Fireflies.ai',
            email: data.fireflies.email || 'Connected User'
          };
        }
        if (data.calendar?.connected) {
          initialConnections.calendar = {
            service: 'google',
            name: 'Google Calendar',
            email: data.calendar.email || 'Google User'
          };
        }
        setConnections(initialConnections);
      })
      .catch((err) => console.error("Failed to load status", err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: '#fff' }}>Loading...</div>;
  }

  return (
    <BrowserRouter>
      <Navbar />
      <main style={{ flex: 1 }}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route
            path="/connect/transcription"
            element={
              <ConnectTranscriptionPage
                connections={connections}
                setConnections={setConnections}
              />
            }
          />
          <Route
            path="/connect/calendar"
            element={
              <ConnectCalendarPage
                connections={connections}
                setConnections={setConnections}
              />
            }
          />
          <Route
            path="/dashboard"
            element={
              <DashboardPage
                connections={connections}
                setConnections={setConnections}
              />
            }
          />
        </Routes>
      </main>
    </BrowserRouter>
  );
}

export default App;
