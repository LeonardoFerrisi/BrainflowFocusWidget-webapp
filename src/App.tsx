import { useEffect, useRef, useState, useCallback } from 'react';
import EegChart from './components/EegChart';
import PredictionChart from './components/PredictionChart';

interface BoardInfo { name: string; id: number; }
interface SerialInfo { path: string; manufacturer: string; }
interface StatusMsg { level: 'info' | 'success' | 'error'; message: string; }

const THRESHOLDS = [0.5, 0.6, 0.7, 0.8, 0.9]; // FocusThreshold enum values
const INFERENCE_WINDOWS = [5, 10]; // backend inference window options (seconds)

export default function App() {
  // --- theme ---
  const [dark, setDark] = useState<boolean>(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'dark') return true;
    if (saved === 'light') return false;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  });

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }, [dark]);

  // --- connection row ---
  const [boards, setBoards] = useState<BoardInfo[]>([]);
  const [boardId, setBoardId] = useState<string>('');
  const [boardSerialPort, setBoardSerialPort] = useState('');
  const [macAddress, setMacAddress] = useState('');
  const [connected, setConnected] = useState(false);
  const [eegNames, setEegNames] = useState<string[]>([]);

  // --- banner ---
  const [status, setStatus] = useState<StatusMsg>({ level: 'info', message: 'Not connected.' });

  // --- EEG sanity chart ---
  const [eegData, setEegData] = useState<number[][]>([]);

  // --- metric / threshold ---
  const [metric, setMetric] = useState<'mindfulness' | 'restfulness'>('mindfulness');
  const [threshold, setThreshold] = useState(0.8);
  const [inferenceWindowSec, setInferenceWindowSec] = useState(10);
  const [prediction, setPrediction] = useState<number | null>(null);
  const [history, setHistory] = useState<{ t: number; v: number }[]>([]);

  // --- output row ---
  const [outputMode, setOutputMode] = useState<'none' | 'udp' | 'serial'>('none');
  const [udpPort, setUdpPort] = useState(8081);
  const [serialPorts, setSerialPorts] = useState<SerialInfo[]>([]);
  const [serialPath, setSerialPath] = useState('');

  const wsRef = useRef<WebSocket | null>(null);

  const send = useCallback((msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  // --- load board + serial lists ---
  useEffect(() => {
    fetch('/api/boards').then(r => r.json()).then((b: BoardInfo[]) => {
      setBoards(b);
      const synthetic = b.find(x => x.name.includes('SYNTHETIC'));
      setBoardId(String((synthetic ?? b[0])?.id ?? ''));
    });
    fetch('/api/serial').then(r => r.json()).then(setSerialPorts);
  }, []);

  // --- websocket ---
  useEffect(() => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    wsRef.current = ws;

    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      switch (msg.type) {
        case 'hello':
          setConnected(msg.connected);
          setMetric(msg.config.metric);
          setThreshold(msg.config.threshold);
          setInferenceWindowSec(msg.config.inferenceWindowSec);
          break;
        case 'status':
          setStatus({ level: msg.level, message: msg.message });
          break;
        case 'connected':
          setConnected(msg.connected);
          if (!msg.connected) { setEegData([]); setPrediction(null); }
          break;
        case 'boardInfo':
          setEegNames(msg.eegNames);
          break;
        case 'eeg':
          setEegData(msg.channels);
          break;
        case 'prediction':
          setPrediction(msg.value);
          setHistory(h => {
            const next = [...h, { t: msg.timestamp, v: msg.value }];
            const cutoff = msg.timestamp - 120_000;
            return next.filter(p => p.t >= cutoff);
          });
          break;
      }
    };
    return () => ws.close();
  }, []);

  // --- push config changes to backend ---
  useEffect(() => {
    send({ type: 'config', metric, threshold, inferenceWindowSec, outputMode, udpPort, serialPath });
  }, [metric, threshold, inferenceWindowSec, outputMode, udpPort, serialPath, send]);

  const focused = prediction !== null && prediction > threshold;

  return (
    <>
      <div className="header-row">
        <h1>Leonardo Telepathy Software</h1>
        <button className="theme-toggle" onClick={() => setDark(d => !d)}>
          {dark ? 'Light' : 'Dark'}
        </button>
      </div>

      {/* Row 1: board connect */}
      <div className="panel row">
        <div className="field">
          <label>Board</label>
          <select value={boardId} onChange={e => setBoardId(e.target.value)} disabled={connected}>
            {boards.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Serial port (Cyton/Ganglion - optional)</label>
          <input value={boardSerialPort} onChange={e => setBoardSerialPort(e.target.value)}
            placeholder="COM3 / /dev/ttyUSB0" disabled={connected} />
        </div>
        <div className="field">
          <label>MAC address (Muse - optional)</label>
          <input value={macAddress} onChange={e => setMacAddress(e.target.value)}
            placeholder="00:55:DA:B..." disabled={connected} />
        </div>
        <div className="field">
          <label>&nbsp;</label>
          {connected ? (
            <button className="danger" onClick={() => send({ type: 'disconnect' })}>Disconnect</button>
          ) : (
            <button onClick={() => send({
              type: 'connect',
              boardId: Number(boardId),
              serialPort: boardSerialPort,
              macAddress,
            })}>Connect</button>
          )}
        </div>
      </div>

      {/* Row 2: system banner */}
      <div className={`banner ${status.level}`}>{status.message}</div>

      {/* Row 3: raw EEG sanity chart */}
      <div className="panel">
        <EegChart data={eegData} names={eegNames} dark={dark} />
        {eegData.length === 0 && (
          <p className="hint">
            EEG traces appear here once a board is streaming.
          </p>
        )}
      </div>

      {/* Row 4: metric/threshold dropdowns + circle + prediction graph */}
      <div className="panel">
        <div className="row">
          <div className="field">
            <label>Metric</label>
            <select value={metric} onChange={e => setMetric(e.target.value as any)}>
              <option value="mindfulness">Concentration</option>
              <option value="restfulness">Relaxation</option>
            </select>
          </div>
          <div className="field">
            <label>Threshold</label>
            <select value={threshold} onChange={e => setThreshold(Number(e.target.value))}>
              {THRESHOLDS.map(t => <option key={t} value={t}>{t.toFixed(1)}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Inference window</label>
            <select value={inferenceWindowSec} onChange={e => setInferenceWindowSec(Number(e.target.value))}>
              {INFERENCE_WINDOWS.map(s => <option key={s} value={s}>{s}s</option>)}
            </select>
          </div>
          <div className="metric-value">
            Current value: {prediction === null ? '-' : prediction.toFixed(4)}
          </div>
        </div>
        <div className="split">
          <div className="status-circle-wrap">
            <div className={`status-circle ${focused ? 'focused' : ''}`} />
            <div className="status-label">
              {prediction === null
                ? 'Waiting for data…'
                : focused
                  ? (metric === 'mindfulness' ? 'Concentrating' : 'Relaxing')
                  : (metric === 'mindfulness' ? 'Not Concentrating' : 'Not Relaxing')}
            </div>
          </div>
          <PredictionChart history={history} threshold={threshold} windowSec={30} dark={dark} />
        </div>
      </div>

      {/* Row 5: output routing */}
      <div className="panel row">
        <div className="field">
          <label>Send prediction out via</label>
          <select value={outputMode} onChange={e => setOutputMode(e.target.value as any)}>
            <option value="none">None</option>
            <option value="udp">UDP</option>
            <option value="serial">Serial</option>
          </select>
        </div>
        {outputMode === 'udp' && (
          <div className="field">
            <label>UDP port (sent to 127.0.0.1)</label>
            <input type="number" value={udpPort}
              onChange={e => setUdpPort(Number(e.target.value))} />
          </div>
        )}
        {outputMode === 'serial' && (
          <div className="field">
            <label>Serial port</label>
            <select value={serialPath} onChange={e => setSerialPath(e.target.value)}>
              <option value="">- select -</option>
              {serialPorts.map(p => (
                <option key={p.path} value={p.path}>
                  {p.path}{p.manufacturer ? ` (${p.manufacturer})` : ''}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </>
  );
}