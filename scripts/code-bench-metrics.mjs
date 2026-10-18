/** Shared descriptive statistics. No confidence or significance claim is inferred. */
export function summarize(samples) {
  if (!samples.length || samples.some(x => !Number.isFinite(x) || x < 0)) throw Error('Invalid timing samples');
  const sorted = [...samples].sort((a, b) => a - b);
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  const m = Math.floor(samples.length / 2);
  const median = sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
  const sampleSd = samples.length > 1 ? Math.sqrt(samples.reduce((s, x) => s + (x - mean) ** 2, 0) / (samples.length - 1)) : null;
  return { samples, count: samples.length, min: sorted[0], max: sorted.at(-1), mean, median, sampleSd,
    cv: sampleSd !== null && mean > 0 ? sampleSd / mean : null,
    assessment: samples.length < 5 ? 'descriptive only: fewer than 5 samples' : 'descriptive only; inspect raw samples and absolute spread' };
}

export function shuffled(values, seed) {
  const result = [...values]; let state = seed >>> 0;
  for (let n = result.length - 1; n > 0; n--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const i = state % (n + 1); [result[n], result[i]] = [result[i], result[n]];
  }
  return result;
}

/** Setup, GC, validation and release are explicitly outside each timer. */
export async function measureOperation(operation, { now, gc, verify = () => {}, warmups = 2, minBatchMs = 30, maxBatch = 1000 }) {
  const warmupMs = [];
  for (let n = 0; n < warmups; n++) {
    let value;
    const start = now(); value = await operation(); warmupMs.push(now() - start);
    verify(value); value = null;
  }
  const estimate = summarize(warmupMs).median;
  let iterations = Math.min(maxBatch, Math.max(1, Math.ceil(minBatchMs / Math.max(estimate, 0.001))));
  const calibration = [];
  // A single warmed invocation can overestimate the cost after loop/JIT warming.
  // Calibrate batches outside the reported sample, then collect exactly one batch.
  if (iterations > 1) for (let attempt = 0; attempt < 4; attempt++) {
    let output; const start = now();
    for (let n = 0; n < iterations; n++) { output = null; output = await operation(); }
    const ms = now() - start; verify(output); output = null;
    calibration.push({ iterations, ms });
    if (ms >= minBatchMs || iterations === maxBatch) break;
    iterations = Math.min(maxBatch, Math.ceil(iterations * minBatchMs / Math.max(ms, 0.001)));
  }
  gc();
  let value;
  const start = now();
  for (let n = 0; n < iterations; n++) { value = null; value = await operation(); }
  const batchMs = now() - start;
  verify(value); value = null;
  return { ms: batchMs / iterations, batchMs, iterations, warmupMs, calibration,
    shortBatch: batchMs < minBatchMs / 2, unit: 'milliseconds per operation; samples are independent processes, not batch iterations' };
}
