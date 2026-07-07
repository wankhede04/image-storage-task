import './imageProcessor';
import { config } from '../config';

console.log('[ValidationWorker] Starting...');

// Skip warming the face detector in LOAD_TEST_MODE: checkFaces() is never
// invoked in this mode (see validation/index.ts), and warming eagerly would
// force-load @tensorflow/tfjs-node, which has no prebuilt native addon for
// linux/arm64 and crashes the process on such hosts.
if (!config.LOAD_TEST_MODE) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { warmFaceDetector } = require('../validation/face');
  warmFaceDetector().catch((err: Error) => console.warn('[ValidationWorker] Face detector warm-up failed:', err.message));
}
