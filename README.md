# BrainFlow Focus Widget (TypeScript)

A webapp clone of the OpenBCI GUI **Focus widget** (`W_Focus.pde`) that works with
**any board supported by BrainFlow** - Muse 2, Cyton, Ganglion, synthetic, etc.

@LeonardoFerrisi 2026

## Architecture

UDP sockets, serial ports, and the BrainFlow native library can't run inside a
browser tab, so the app is split in two:

```
brainflow-focus-widget/
├── server/index.ts          Node backend - BrainFlow pipeline, UDP, serial, WebSocket
├── src/                     React + TypeScript frontend
│   ├── App.tsx              Layout per spec (connect row, banner, EEG chart,
│   │                        metric/threshold + circle + prediction chart, output row)
│   └── components/
│       ├── EegChart.tsx         Raw EEG stacked time series (sanity check)
│       └── PredictionChart.tsx  Live metric history with threshold line
└── package.json
```

The prediction pipeline is the exact same one the OpenBCI GUI uses:

```
board buffer (10 s window)
  --> DataFilter.getAvgBandPowers()   [delta, theta, alpha, beta, gamma]
  --> MLModel.predict()               [BrainFlow pretrained model]
  --> 0.0–1.0 score (MINDFULNESS = Concentration, RESTFULNESS = Relaxation)
```

## Run it

```bash
npm install
npm run dev        # backend on :8080, frontend dev server on :5173
```

Open http://localhost:5173. For a production build:

```bash
npm run build
npm start          # serves the built frontend from :8080
```

## Usage

1. **Board row** - pick any BrainFlow board from the dropdown (`SYNTHETIC_BOARD`
   is preselected and works with no hardware - good for testing the pipeline).
   Add a serial port (Cyton/Ganglion) or MAC address (Muse) if your board needs one.
2. **Connect** - the banner reports success/failure.
3. **EEG chart** - raw per-channel traces as a signal sanity check.
4. **Metric / Threshold** - Concentration or Relaxation, threshold 0.5–0.9
   (0.8 = GUI default). The circle turns green when the score exceeds the threshold;
   the chart shows the score history with the threshold as a dashed line.
5. **Output** - None / UDP (enter a port; JSON datagrams go to `127.0.0.1:<port>`)
   / Serial (pick a detected port). Each prediction is sent as one JSON line:

```json
{"metric":"mindfulness","value":0.6231,"focused":false,"timestamp":1754572800000}
```

## UDP listener (test)

```python
import socket
s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
s.bind(("127.0.0.1", 8081))
while True:
    print(s.recvfrom(4096)[0].decode())
```

## Notes

- The 10 s analysis window means the first prediction arrives ~10 s after streaming
  starts (same behavior as the GUI - it waits for a full buffer).
- BrainFlow's `MINDFULNESS` model is known to be weaker than `RESTFULNESS`;
  if Concentration feels flat, lower the threshold or compare against Relaxation.
- On Windows, the Muse 2 uses **native Bluetooth - no BLED112 dongle needed**
  (`BoardIds.MUSE_2_BOARD`). Requirements: Windows 10.0.19041+ and a recent
  `brainflow` npm package (>= 5.22; older builds had broken BLE lib loading -
  symptom: `Failed to init dll_loader`, error code 17). The old `*_BLED_BOARD`
  ids are deprecated. Pair the headset in Windows Bluetooth settings first if
  discovery fails.
