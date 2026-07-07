import './imageProcessor';
import { warmFaceDetector } from '../validation/face';

console.log('[ValidationWorker] Starting...');
warmFaceDetector().catch((err) => console.warn('[ValidationWorker] Face detector warm-up failed:', err.message));
