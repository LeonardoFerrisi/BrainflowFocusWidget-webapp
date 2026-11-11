/**
 * BrainFlow Focus Widget - backend
 *
 * Replicates the OpenBCI GUI Focus widget (W_Focus.pde) pipeline:
 *   window -> DataFilter.getAvgBandPowers (delta/theta/alpha/beta/gamma)
 *          -> MLModel.predict -> 0..1 mindfulness/restfulness score
 *
 * Serves the React frontend, streams EEG + predictions over WebSocket,
 * and optionally re-sends each prediction over UDP or a serial port.
 */
import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import dgram from 'dgram';
import { fileURLToPath } from 'url';
import { Worker } from 'worker_threads';
import { WebSocketServer, WebSocket } from 'ws';
import {
  BoardShim,
  BoardIds,
  DataFilter,
  LogLevels,
  MLModel,
  BrainFlowMetrics,
  BrainFlowClassifiers,
} from 'brainflow';
import { SerialPort } from 'serialport';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8081;

// Focus widget constants (from W_Focus.pde / FocusEnums.pde)
const PREDICT_MS = 250;         // prediction update rate
const EEG_PUSH_MS = 100;        // raw EEG push rate
const EEG_SHOW_SEC = 5;         // seconds of raw EEG shown in the sanity chart

type MetricName = 'mindfulness' | 'restfulness';
type OutputMode = 'none' | 'udp' | 'serial';

interface AppConfig {
  metric: MetricName;
  threshold: number;
  outputMode: OutputMode;
  udpPort: number;
  serialPath: string;
  inferenceWindowSec: number;
}

const config: AppConfig = {
  metric: 'mindfulness',
  threshold: 0.8, // GUI default (FocusThreshold.EIGHT_TENTHS)
  outputMode: 'none',
  udpPort: 8081,
  serialPath: '',
  inferenceWindowSec: 10, // GUI default window: 10 s
};

let board: BoardShim | null = null;
let activeBoardId: number | null = null;
let model: MLModel | null = null;
let serial: SerialPort | null = null;
const udp = dgram.createSocket('udp4');

// ---------------------------------------------------------------------------
// WebSocket plumbing
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json());
export const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
const clients = new Set<WebSocket>();

function broadcast(msg: object): void {
  const s = JSON.stringify(msg);
  for (const c of clients) if (c.readyState === WebSocket.OPEN) c.send(s);
}

function status(level: 'info' | 'success' | 'error', message: string): void {
  console.log(`[${level}] ${message}`);
  broadcast({ type: 'status', level, message });
}

// ---------------------------------------------------------------------------
// BrainFlow model (same pretrained models the GUI uses)
// ---------------------------------------------------------------------------
function prepareModel(): void {
  try { model?.release(); } catch { /* ignore */ }
  const metric =
    config.metric === 'mindfulness'
      ? BrainFlowMetrics.MINDFULNESS
      : BrainFlowMetrics.RESTFULNESS;
  // JS binding: MLModel takes the enums directly, not a BrainFlowModelParams object
  model = new MLModel(metric, BrainFlowClassifiers.DEFAULT_CLASSIFIER, {});
  model.prepare();
}

// ---------------------------------------------------------------------------
// Output routing (UDP / serial)
// ---------------------------------------------------------------------------
function openSerial(): void {
  try {
    serial = new SerialPort({ path: config.serialPath, baudRate: 115200 });
    serial.on('error', (e) => status('error', `Serial error: ${e.message}`));
    status('info', `Serial output open on ${config.serialPath}`);
  } catch (e) {
    status('error', `Could not open serial port: ${(e as Error).message}`);
  }
}

function applyOutputConfig(): void {
  const needsSerial = config.outputMode === 'serial' && !!config.serialPath;

  // Already correctly configured - avoid tearing down a healthy connection
  // just because an unrelated field (e.g. threshold) changed.
  if (needsSerial && serial?.isOpen && serial.path === config.serialPath) return;
  if (!needsSerial && !serial) return;

  if (serial) {
    const old = serial;
    serial = null;
    if (old.isOpen) {
      // Wait for the close to finish before reopening - opening the same
      // COM port before Windows releases the previous handle throws
      // "Access is denied".
      old.close(() => { if (needsSerial) openSerial(); });
      return;
    }
  }
  if (needsSerial) openSerial();
}

function sendOutput(value: number): void {
  const focused = value > config.threshold;
  if (config.outputMode === 'udp') {
    const payload =
      JSON.stringify({
        metric: config.metric,
        value: Math.round(value * 10000) / 10000,
        focused,
        timestamp: Date.now(),
      }) + '\n';
    udp.send(payload, config.udpPort, '127.0.0.1', (err) => {
      if (err) status('error', `UDP send error: ${err.message}`);
    });
  } else if (config.outputMode === 'serial' && serial?.isOpen) {
    serial.write(focused ? '1\n' : '0\n');
  }
}

// ---------------------------------------------------------------------------
// Board connect / disconnect
// ---------------------------------------------------------------------------
let connectWorker: Worker | null = null;

function disconnectBoard(): void {
  if (connectWorker) {
    connectWorker.terminate();
    connectWorker = null;
  }
  if (board) {
    try { board.stopStream(); } catch { /* ignore */ }
    try { board.releaseSession(); } catch { /* ignore */ }
    board = null;
    activeBoardId = null;
  }
}

// Resolve the worker script path for both dev (tsx) and production (bundled).
const workerExt = __dirname.includes('dist-electron') ? '.cjs' : '.ts';
const boardWorkerPath = path.join(__dirname, `board-worker${workerExt}`);

async function connectBoard(msg: {
  boardId: number;
  serialPort?: string;
  macAddress?: string;
  ipAddress?: string;
  file?: string;
}): Promise<void> {
  disconnectBoard();

  const inputParams: Record<string, unknown> = { timeout: 15 };
  if (msg.serialPort) inputParams.serialPort = msg.serialPort;
  if (msg.macAddress) inputParams.macAddress = msg.macAddress;
  if (msg.ipAddress) inputParams.ipAddress = msg.ipAddress;
  if (msg.file) inputParams.file = msg.file;

  activeBoardId = msg.boardId;
  status('info', `Connecting to board ${msg.boardId}...`);

  return new Promise<void>((resolve) => {
    const worker = new Worker(boardWorkerPath, {
      workerData: { boardId: msg.boardId, inputParams },
    });
    connectWorker = worker;

    worker.on('message', (result: { ok: boolean; error?: string }) => {
      connectWorker = null;
      if (result.ok) {
        // BrainFlow's C library keeps session state at the process level.
        // The worker established the session; this BoardShim instance lets
        // the main thread read data from it without blocking.
        board = new BoardShim(msg.boardId, inputParams as any);
        prepareModel();
        const sr = BoardShim.getSamplingRate(msg.boardId);
        const names = BoardShim.getEegNames(msg.boardId);
        status('success', `Connected - ${names.length} EEG channels @ ${sr} Hz`);
        broadcast({ type: 'boardInfo', samplingRate: sr, eegNames: names });
      } else {
        activeBoardId = null;
        status('error', `Connection failed: ${result.error}`);
      }
      broadcast({ type: 'connected', connected: board !== null });
      resolve();
    });

    worker.on('error', (err) => {
      connectWorker = null;
      activeBoardId = null;
      status('error', `Connection failed: ${err.message}`);
      broadcast({ type: 'connected', connected: false });
      resolve();
    });
  });
}

// ---------------------------------------------------------------------------
// Streaming loops
// ---------------------------------------------------------------------------
// Prediction loop - the W_Focus.updateFocusState() equivalent
setInterval(() => {
  if (!board || !model || activeBoardId === null) return;
  try {
    const sr = BoardShim.getSamplingRate(activeBoardId);
    const eegChannels = BoardShim.getEegChannels(activeBoardId);
    const n = sr * config.inferenceWindowSec;
    const data = board.getCurrentBoardData(n); // nchannels x npoints
    if (data.length === 0 || data[0].length < n) return; // buffer not full yet

    // JS binding: pass the full data matrix + the EEG channel row indices
    const [avgs] = DataFilter.getAvgBandPowers(data, eegChannels, sr, true);
    const value = model.predict(avgs)[0];

    broadcast({
      type: 'prediction',
      value,
      focused: value > config.threshold,
      metric: config.metric,
      threshold: config.threshold,
      bands: avgs,
      timestamp: Date.now(),
    });
    sendOutput(value);
  } catch {
    /* transient BrainFlow errors (buffer refills etc.) - skip tick */
  }
}, PREDICT_MS);

// Raw EEG push - sanity-check chart data
setInterval(() => {
  if (!board || activeBoardId === null) return;
  try {
    const sr = BoardShim.getSamplingRate(activeBoardId);
    const eegChannels = BoardShim.getEegChannels(activeBoardId);
    const n = sr * EEG_SHOW_SEC;
    const data = board.getCurrentBoardData(n);
    if (data.length === 0 || data[0].length === 0) return;
    broadcast({
      type: 'eeg',
      samplingRate: sr,
      channels: eegChannels.map((ch) => data[ch]),
    });
  } catch { /* skip tick */ }
}, EEG_PUSH_MS);

// ---------------------------------------------------------------------------
// HTTP API
// ---------------------------------------------------------------------------
app.get('/api/boards', (_req, res) => {
  const boards = Object.entries(BoardIds)
    .filter(([, v]) => typeof v === 'number')
    .map(([name, id]) => ({ name, id }))
    .sort((a, b) => a.name.localeCompare(b.name));
  res.json(boards);
});

app.get('/api/serial', async (_req, res) => {
  try {
    const ports = await SerialPort.list();
    res.json(ports.map((p) => ({ path: p.path, manufacturer: p.manufacturer ?? '' })));
  } catch {
    res.json([]);
  }
});

// ---------------------------------------------------------------------------
// WebSocket messages from the UI
// ---------------------------------------------------------------------------
wss.on('connection', (ws) => {
  clients.add(ws);
  ws.send(
    JSON.stringify({
      type: 'hello',
      connected: board !== null,
      config,
      activeBoardId,
    })
  );

  ws.on('message', async (raw) => {
    let msg: any;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    switch (msg.type) {
      case 'connect':
        await connectBoard(msg);
        break;

      case 'disconnect':
        disconnectBoard();
        status('info', 'Disconnected.');
        broadcast({ type: 'connected', connected: false });
        break;

      case 'config':
        if (msg.metric && msg.metric !== config.metric) {
          config.metric = msg.metric as MetricName;
          if (board) {
            try { prepareModel(); } catch (e) {
              status('error', `Model switch failed: ${(e as Error).message}`);
            }
          }
        }
        if (typeof msg.threshold === 'number') config.threshold = msg.threshold;
        if (typeof msg.inferenceWindowSec === 'number') config.inferenceWindowSec = msg.inferenceWindowSec;
        if (typeof msg.udpPort === 'number') config.udpPort = msg.udpPort;
        if (typeof msg.serialPath === 'string') config.serialPath = msg.serialPath;
        if (msg.outputMode && msg.outputMode !== config.outputMode) {
          config.outputMode = msg.outputMode as OutputMode;
        }
        applyOutputConfig();
        status('info', `Output: ${config.outputMode}` +
          (config.outputMode === 'udp' ? ` -> 127.0.0.1:${config.udpPort}` : '') +
          (config.outputMode === 'serial' ? ` -> ${config.serialPath}` : ''));
        break;
    }
  });

  ws.on('close', () => clients.delete(ws));
});

// ---------------------------------------------------------------------------
// Static frontend (production build)
// ---------------------------------------------------------------------------
// `npm start` runs this file from `server/`, one level below the project root.
// The Electron build bundles it into `dist-electron/server/`, two levels below
// the app root, and passes FOCUS_DIST explicitly. Serve whenever a build is
// found - dev (`npm run dev`) has no `dist/` so this is simply skipped.
{
  const distCandidates = [
    process.env.FOCUS_DIST,
    path.join(__dirname, '..', 'dist'),
    path.join(__dirname, '..', '..', 'dist'),
  ].filter((d): d is string => !!d);
  const dist = distCandidates.find((d) => fs.existsSync(path.join(d, 'index.html')));
  if (dist) {
    console.log(`[static] Serving frontend from ${dist}`);
    app.use(express.static(dist));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  } else {
    console.warn('[static] No dist/ directory found. Candidates checked:', distCandidates);
  }
}

BoardShim.setLogLevel(LogLevels.LEVEL_WARN);
server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Is another instance running?`);
  }
});
server.listen(PORT, () => {
  console.log(`Leonardo Telepathy Software backend on http://localhost:${PORT}`);
});

export async function shutdown(): Promise<void> {
  disconnectBoard();
  try { model?.release(); } catch { /* ignore */ }
  try { serial?.close(); } catch { /* ignore */ }
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

process.on('SIGINT', async () => {
  await shutdown();
  process.exit(0);
});