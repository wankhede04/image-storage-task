import '@tensorflow/tfjs-node';
import * as tf from '@tensorflow/tfjs-node';
import * as faceapi from '@vladmandic/face-api';
import sharp from 'sharp';
import { RejectionReason } from '../types';
import { config } from '../config';

// Promise-based lock prevents concurrent model loads under worker concurrency ≥2
let modelLoadPromise: Promise<void> | null = null;

function ensureModelsLoaded(): Promise<void> {
  if (!modelLoadPromise) {
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
  let detections: faceapi.FaceDetection[];

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
