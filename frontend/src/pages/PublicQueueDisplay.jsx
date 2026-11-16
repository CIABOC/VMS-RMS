import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import Crest from '../components/Crest.jsx';

/**
 * Public token display for the waiting-room screen (part of screen 06).
 * No sign-in needed. It shows token numbers only - never names - in three languages.
 */
export default function PublicQueueDisplay() {
  const [data, setData] = useState(null);
  const [offline, setOffline] = useState(false);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    document.title = 'Queue · CIABOC';
    let timer;
    const load = async () => {
      try {
        const d = await api.get('/public/queue');
        setData(d);
        setOffline(false);
        timer = setTimeout(load, (d.refreshSeconds || 10) * 1000);
      } catch {
        setOffline(true);
        timer = setTimeout(load, 15000);
      }
      setNow(new Date());
    };
    load();
    return () => clearTimeout(timer);
  }, []);

  const tokens = data?.tokens || [];
  const group = (state) => tokens.filter((t) => t.state === state);

  return (
    <div className="display">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <Crest size={52} />
          <h1>Visitor queue</h1>
        </div>
        <div style={{ fontSize: 28, fontFamily: 'var(--display)' }}>
          {now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
      {offline && <p style={{ color: 'var(--gold-hi)', marginTop: 12 }}>Reconnecting…</p>}
      <div className="cols" aria-live="polite">
        <section className="proceed">
          <h2>Please proceed to reception · කරුණාකර පිළිගැනීමේ කවුළුවට · வரவேற்புக்கு வரவும்</h2>
          {group('PROCEED').map((t) => <span key={t.tokenNo} className="tok">{t.tokenNo}</span>)}
        </section>
        <section>
          <h2>Waiting · රැඳී සිටින්න · காத்திருக்கவும்</h2>
          {group('WAITING').map((t) => <span key={t.tokenNo} className="tok">{t.tokenNo}</span>)}
        </section>
        <section>
          <h2>Delayed · ප්‍රමාදයි · தாமதம்</h2>
          {group('DELAYED').map((t) => <span key={t.tokenNo} className="tok">{t.tokenNo}</span>)}
        </section>
      </div>
    </div>
  );
}
