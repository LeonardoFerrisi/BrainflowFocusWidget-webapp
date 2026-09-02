/**
 * electron-builder afterPack hook.
 *
 * BrainFlow's Windows DLLs (onnxruntime, MLModule, simpleble, BrainFlowBluetooth,
 * ...) link against the Microsoft Visual C++ runtime. On a machine without the
 * VC++ Redistributable installed they fail to load, which surfaces as a BrainFlow
 * error on board connect / MLModel.prepare().
 *
 * Windows' loader searches a DLL's own directory for its dependencies, so we drop
 * the (redistributable) VC++ runtime DLLs next to BrainFlow's libraries. This
 * makes the portable build self-contained - no separate redistributable install.
 */
const fs = require('fs');
const path = require('path');

const RUNTIME_DLLS = [
  'msvcp140.dll',
  'msvcp140_1.dll',
  'msvcp140_2.dll',
  'vcruntime140.dll',
  'vcruntime140_1.dll',
  'concrt140.dll',
];

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;

  const sourceDir = path.join(process.env.WINDIR || 'C:\\Windows', 'System32');
  const brainflowLib = path.join(
    context.appOutDir,
    'resources',
    'app',
    'node_modules',
    'brainflow',
    'brainflow',
    'lib',
  );

  if (!fs.existsSync(brainflowLib)) {
    console.warn(`[afterPack] BrainFlow lib dir not found, skipping: ${brainflowLib}`);
    return;
  }

  const copied = [];
  const missing = [];
  for (const dll of RUNTIME_DLLS) {
    const src = path.join(sourceDir, dll);
    if (!fs.existsSync(src)) {
      missing.push(dll);
      continue;
    }
    fs.copyFileSync(src, path.join(brainflowLib, dll));
    copied.push(dll);
  }

  console.log(`[afterPack] VC++ runtime -> brainflow/lib: copied ${copied.join(', ') || 'none'}`);
  if (missing.length) {
    console.warn(
      `[afterPack] not found on build machine (end users may need the VC++ Redistributable): ${missing.join(', ')}`,
    );
  }
};
