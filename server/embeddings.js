// Local, free, offline sentence embeddings (no API key) -- runs a small
// ONNX model via @xenova/transformers. The model file (~90MB) downloads once
// on first use and is cached under server/.cache after that.
import { pipeline, env } from "@xenova/transformers";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
env.cacheDir = path.join(__dirname, ".cache");

const MODEL = "Xenova/all-MiniLM-L6-v2"; // 384-dim sentence embeddings

let extractorPromise = null;
function getExtractor() {
  if (!extractorPromise) extractorPromise = pipeline("feature-extraction", MODEL);
  return extractorPromise;
}

// Embeds a batch of texts, returning one L2-normalized Float32Array per
// text (normalized so cosine similarity reduces to a plain dot product).
export async function embedTexts(texts) {
  const extractor = await getExtractor();
  const output = await extractor(texts, { pooling: "mean", normalize: true });
  const dim = output.dims[output.dims.length - 1];
  const vectors = [];
  for (let i = 0; i < texts.length; i++) {
    vectors.push(Float32Array.from(output.data.slice(i * dim, (i + 1) * dim)));
  }
  return vectors;
}

export async function embedText(text) {
  const [vec] = await embedTexts([text]);
  return vec;
}

export function vectorToBlob(vec) {
  return Buffer.from(Float32Array.from(vec).buffer);
}

export function blobToVector(blob) {
  return new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4);
}

// Vectors are pre-normalized, so this dot product IS the cosine similarity.
export function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}
