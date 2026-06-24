// Must be imported before face-api to register the Node.js backend
import '@tensorflow/tfjs-node';
import * as faceapi from '@vladmandic/face-api';
import sharp from 'sharp';
import { RejectionReason } from '../types';
import { config } from '../config';

let modelsLoaded = false;

async function loadModels(): Promise<void> {
  if (modelsLoaded) return;

  const faceApiPkg = require.resolve('@vladmandic/face-api/package.json');
  const modelPath = faceApiPkg.replace('package.json', 'model');

  await faceapi.nets.tinyFaceDetector.loadFromDisk(modelPath);
  modelsLoaded = true;
}

export async function checkFaces(
  buffer: Buffer,
  imageWidth: number,
  imageHeight: number,
): Promise<RejectionReason[]> {
  await loadModels();

  // Decode image to Tensor3D via sharp → raw RGB
  const { data, info } = await sharp(buffer)
    .resize({ width: 640, withoutEnlargement: true }) // cap for perf
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { default: tf } = await import('@tensorflow/tfjs-node') as any;
  const tensor = tf.tensor3d(new Uint8Array(data), [info.height, info.width, 3]);

  const detections = await faceapi.detectAllFaces(
    tensor,
    new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 }),
  );

  tensor.dispose();

  const reasons: RejectionReason[] = [];
  const imageArea = imageWidth * imageHeight;

  if (detections.length === 0) {
    reasons.push('NO_FACE');
    return reasons;
  }

  if (detections.length > 1) {
    reasons.push('MULTIPLE_FACES');
    return reasons;
  }

  const face = detections[0].box;
  const faceArea = face.width * face.height;
  const ratio = faceArea / imageArea;

  if (ratio < config.FACE_AREA_MIN_RATIO) {
    reasons.push('FACE_TOO_SMALL');
  }

  return reasons;
}
