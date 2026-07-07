import sharp from 'sharp';
import { RejectionReason } from '../types';
import { config } from '../config';

// @tensorflow/tfjs-node and @vladmandic/face-api are required lazily (inside
// ensureModelsLoaded) rather than statically imported at module load time.
// tfjs-node ships a native NAPI addon with no prebuilt binary for
// linux/arm64 (only linux/x86_64, darwin, windows) — on an arm64 host/container
// this throws ERR_DLOPEN_FAILED the instant the module is required, which
// would crash the whole process before LOAD_TEST_MODE is ever checked.
// Deferring the require to first real use means LOAD_TEST_MODE=true (which
// skips calling checkFaces/warmFaceDetector) lets the process boot cleanly
// on such hosts; the crash still surfaces (unchanged) if face-checking is
// actually invoked on an unsupported platform.
let tf: typeof import('@tensorflow/tfjs-node');
let faceapi: typeof import('@vladmandic/face-api');

// Promise-based lock prevents concurrent model loads under worker concurrency ≥2
let modelLoadPromise: Promise<void> | null = null;

function ensureModelsLoaded(): Promise<void> {
  if (!modelLoadPromise) {
    tf = require('@tensorflow/tfjs-node');
    faceapi = require('@vladmandic/face-api');
    const faceApiPkg = require.resolve('@vladmandic/face-api/package.json');
    const modelPath = faceApiPkg.replace('package.json', 'model');
    modelLoadPromise = faceapi.nets.tinyFaceDetector.loadFromDisk(modelPath);
  }
  return modelLoadPromise;
}

export function warmFaceDetector(): Promise<void> {
  return ensureModelsLoaded();
}

export async function checkFaces(buffer: Buffer): Promise<RejectionReason[]> {
  await ensureModelsLoaded();

  const { data, info } = await sharp(buffer)
    .resize({ width: 640, withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const tensor = tf.tensor3d(new Uint8Array(data), [info.height, info.width, 3]);
  let detections: import('@vladmandic/face-api').FaceDetection[];

  try {
    detections = await faceapi.detectAllFaces(
      tensor as any,
      new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 }),
    );
  } finally {
    // Always dispose — even if detectAllFaces throws
    tensor.dispose();
  }

  const reasons: RejectionReason[] = [];

  if (detections.length === 0) {
    reasons.push('NO_FACE');
    return reasons;
  }
  if (detections.length > 1) {
    reasons.push('MULTIPLE_FACES');
    return reasons;
  }

  // Face area ratio must use the same resized coordinate space as the detections
  const resizedImageArea = info.width * info.height;
  const face = detections[0].box;
  const faceArea = face.width * face.height;

  if (faceArea / resizedImageArea < config.FACE_AREA_MIN_RATIO) {
    reasons.push('FACE_TOO_SMALL');
  }

  return reasons;
}
