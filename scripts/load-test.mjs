#!/usr/bin/env node
// Load test for the image processing pipeline.
//
// Generates N unique synthetic (noise) JPEGs in memory, submits them
// concurrently to POST /api/images, polls each until it reaches a terminal
// state, and reports throughput/latency.
//
// IMPORTANT: requires the server stack to be started with
// LOAD_TEST_MODE=true in .env — see README. This script does NOT set that
// env var itself; it's a server-side setting the operator enables before
// running the test. Without it, uploads will be REJECTED for NO_FACE since
// synthetic noise images have no face for the validation stage to detect.
//
// Usage:
//   node scripts/load-test.mjs [count] [--concurrency=N] [--base-url=http://localhost:3001] [--poll-interval=1000] [--poll-timeout=120000]
//
// Requires: server stack running with LOAD_TEST_MODE=true (see above).

import sharp from 'sharp';

const HELP_TEXT = `
Load test for the image processing pipeline.

Requires the server stack to be started with LOAD_TEST_MODE=true in .env
(see README) — otherwise synthetic images will be REJECTED for NO_FACE
since they contain no detectable face. This script does not set that env
var itself; it must be configured server-side before running.

Usage:
  node scripts/load-test.mjs [count] [--concurrency=N] [--base-url=URL] [--poll-interval=MS] [--poll-timeout=MS]

Arguments:
  count                 Number of images to submit (default: 50)

Options:
  --concurrency=N       Max in-flight requests at once, for both uploads
                         and polling (default: 20)
  --base-url=URL        API base URL (default: http://localhost:3001)
  --poll-interval=MS    How often to re-check each image's status, in ms
                         (default: 1000)
  --poll-timeout=MS     Give up waiting on a single image after this many ms
                         and count it as TIMED_OUT (default: 120000)
  -h, --help            Print this help text and exit

Example:
  node scripts/load-test.mjs 30 --concurrency=10
`;

function parseArgs(argv) {
  const args = {
    count: 50,
    concurrency: 20,
    baseUrl: 'http://localhost:3001',
    pollInterval: 1000,
    pollTimeout: 120000,
    help: false,
  };

  const positional = [];
  for (const arg of argv) {
    if (arg === '-h' || arg === '--help') {
      args.help = true;
    } else if (arg.startsWith('--concurrency=')) {
      args.concurrency = parseInt(arg.slice('--concurrency='.length), 10);
    } else if (arg.startsWith('--base-url=')) {
      args.baseUrl = arg.slice('--base-url='.length);
    } else if (arg.startsWith('--poll-interval=')) {
      args.pollInterval = parseInt(arg.slice('--poll-interval='.length), 10);
    } else if (arg.startsWith('--poll-timeout=')) {
      args.pollTimeout = parseInt(arg.slice('--poll-timeout='.length), 10);
    } else if (!arg.startsWith('--')) {
      positional.push(arg);
    }
  }

  if (positional.length > 0) {
    const n = parseInt(positional[0], 10);
    if (!Number.isNaN(n)) args.count = n;
  }

  return args;
}

// Deterministic-but-unique PRNG seeded by index, so runs are reproducible
// and no two generated images are byte-identical. Pure per-pixel noise
// comfortably clears the blur-variance (Laplacian) check that a flat/solid
// color image would fail.
function makeUniqueImageBuffer(seedIndex, width = 512, height = 512) {
  const raw = Buffer.alloc(width * height * 3);
  let state = (seedIndex * 2654435761 + 1) & 0xffffffff;
  for (let i = 0; i < raw.length; i++) {
    state = (state * 1103515245 + 12345) & 0xffffffff;
    raw[i] = state & 0xff;
  }
  return sharp(raw, { raw: { width, height, channels: 3 } }).jpeg({ quality: 90 }).toBuffer();
}

// Bounded-concurrency async pool: runs `worker` over `items` with at most
// `concurrency` in flight at once. Does not fire everything at literally
// the same instant.
async function asyncPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runNext() {
    while (true) {
      const i = nextIndex++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  }

  const runners = [];
  const poolSize = Math.max(1, Math.min(concurrency, items.length));
  for (let p = 0; p < poolSize; p++) runners.push(runNext());
  await Promise.all(runners);
  return results;
}

async function submitImage(baseUrl, index) {
  const buffer = await makeUniqueImageBuffer(index);
  const form = new FormData();
  form.append('image', new Blob([buffer], { type: 'image/jpeg' }), `load-test-${index}.jpg`);

  try {
    const res = await fetch(`${baseUrl}/api/images`, { method: 'POST', body: form });
    if (res.status !== 202) {
      let bodyText;
      try {
        bodyText = await res.text();
      } catch {
        bodyText = '<unreadable body>';
      }
      return {
        index,
        ok: false,
        error: `HTTP ${res.status}: ${bodyText.slice(0, 200)}`,
      };
    }
    const body = await res.json();
    return {
      index,
      ok: true,
      id: body.id,
      submittedAt: performance.now(),
    };
  } catch (err) {
    return {
      index,
      ok: false,
      error: err && err.message ? err.message : String(err),
    };
  }
}

async function pollImage(baseUrl, submission, pollInterval, pollTimeout) {
  const { index, id, submittedAt } = submission;
  const deadline = performance.now() + pollTimeout;

  while (true) {
    let body;
    try {
      const res = await fetch(`${baseUrl}/api/images/${id}`);
      if (res.ok) {
        body = await res.json();
      }
    } catch {
      // transient fetch error while polling — treat as "not terminal yet", retry
    }

    if (body) {
      if (body.status === 'REJECTED') {
        return {
          index,
          id,
          terminalState: 'REJECTED',
          completedAt: performance.now(),
          submittedAt,
          pipelineError: null,
          rejectionReasons: body.rejectionReasons ?? [],
        };
      }
      if (body.pipelineStatus === 'COMPLETE') {
        return {
          index,
          id,
          terminalState: 'COMPLETE',
          completedAt: performance.now(),
          submittedAt,
          pipelineError: null,
          rejectionReasons: body.rejectionReasons ?? [],
        };
      }
      if (body.pipelineStatus === 'FAILED') {
        return {
          index,
          id,
          terminalState: 'FAILED',
          completedAt: performance.now(),
          submittedAt,
          pipelineError: body.pipelineError ?? null,
          rejectionReasons: body.rejectionReasons ?? [],
        };
      }
    }

    if (performance.now() >= deadline) {
      return {
        index,
        id,
        terminalState: 'TIMED_OUT',
        completedAt: performance.now(),
        submittedAt,
        pipelineError: null,
        rejectionReasons: [],
      };
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }
}

function percentile(sortedValues, p) {
  if (sortedValues.length === 0) return null;
  const idx = Math.min(sortedValues.length - 1, Math.ceil((p / 100) * sortedValues.length) - 1);
  return sortedValues[Math.max(0, idx)];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  if (!Number.isFinite(args.count) || args.count <= 0) {
    console.error(`Invalid count: ${process.argv[2]}`);
    process.exit(1);
  }

  console.log(`Load test starting: count=${args.count} concurrency=${args.concurrency} baseUrl=${args.baseUrl}`);
  console.log(`(requires LOAD_TEST_MODE=true on the server — see README)\n`);

  // Sanity check the server is reachable before doing real work.
  try {
    await fetch(`${args.baseUrl}/api/images?limit=1`);
  } catch (err) {
    console.error(`Could not reach server at ${args.baseUrl}: ${err.message}`);
    process.exit(1);
  }

  const indices = Array.from({ length: args.count }, (_, i) => i);

  // Step 2 — submit all N concurrently (bounded by --concurrency)
  const submissionResults = await asyncPool(indices, args.concurrency, (i) => submitImage(args.baseUrl, i));

  const succeeded = submissionResults.filter((r) => r.ok);
  const failed = submissionResults.filter((r) => !r.ok);

  // Step 3 — poll each submitted image until terminal, bounded by --concurrency
  const terminalResults = await asyncPool(succeeded, args.concurrency, (submission) =>
    pollImage(args.baseUrl, submission, args.pollInterval, args.pollTimeout),
  );

  // Step 4 — report
  const counts = { COMPLETE: 0, FAILED: 0, REJECTED: 0, TIMED_OUT: 0 };
  for (const r of terminalResults) counts[r.terminalState]++;

  const allSubmittedAt = succeeded.map((s) => s.submittedAt);
  const allCompletedAt = terminalResults.map((r) => r.completedAt);
  const wallClockStart = allSubmittedAt.length > 0 ? Math.min(...allSubmittedAt) : null;
  const wallClockEnd = allCompletedAt.length > 0 ? Math.max(...allCompletedAt) : null;
  const totalWallClockMs = wallClockStart !== null && wallClockEnd !== null ? wallClockEnd - wallClockStart : 0;
  const totalWallClockSeconds = totalWallClockMs / 1000;

  const throughput = totalWallClockSeconds > 0 ? counts.COMPLETE / totalWallClockSeconds : 0;

  const completeLatencies = terminalResults
    .filter((r) => r.terminalState === 'COMPLETE')
    .map((r) => r.completedAt - r.submittedAt)
    .sort((a, b) => a - b);

  const latencyStats =
    completeLatencies.length > 0
      ? {
          p50: percentile(completeLatencies, 50),
          p95: percentile(completeLatencies, 95),
          min: completeLatencies[0],
          max: completeLatencies[completeLatencies.length - 1],
        }
      : null;

  console.log('='.repeat(60));
  console.log('LOAD TEST REPORT');
  console.log('='.repeat(60));

  console.log(`\nSubmitted: ${args.count} attempted, ${succeeded.length} succeeded, ${failed.length} failed`);
  if (failed.length > 0) {
    console.log('  Example errors:');
    for (const f of failed.slice(0, 5)) {
      console.log(`    [${f.index}] ${f.error}`);
    }
  }

  console.log(`\nTerminal breakdown:`);
  console.log(`  COMPLETE:   ${counts.COMPLETE}`);
  console.log(`  FAILED:     ${counts.FAILED}`);
  console.log(`  REJECTED:   ${counts.REJECTED}`);
  console.log(`  TIMED_OUT:  ${counts.TIMED_OUT}`);

  console.log(`\nWall-clock: ${totalWallClockMs.toFixed(0)} ms (${totalWallClockSeconds.toFixed(2)} s)`);
  console.log(`Throughput: ${throughput.toFixed(3)} images/sec (COMPLETE count / total wall-clock seconds)`);

  console.log(`\nEnd-to-end latency (submit -> COMPLETE), ms:`);
  if (latencyStats) {
    console.log(`  p50: ${latencyStats.p50.toFixed(0)}`);
    console.log(`  p95: ${latencyStats.p95.toFixed(0)}`);
    console.log(`  min: ${latencyStats.min.toFixed(0)}`);
    console.log(`  max: ${latencyStats.max.toFixed(0)}`);
  } else {
    console.log('  (no COMPLETE images to compute latency from)');
  }

  const allRejectionReasons = terminalResults.flatMap((r) => r.rejectionReasons ?? []);
  const hasRejectionsOrFailures = counts.REJECTED > 0 || counts.FAILED > 0;
  const looksLikeLoadTestModeOff = allRejectionReasons.includes('NO_FACE');

  if (hasRejectionsOrFailures && looksLikeLoadTestModeOff) {
    console.log('\nHint: set LOAD_TEST_MODE=true on the server and restart it — see README.');
  }

  console.log('');

  // Exit code 0 if throughput was computed (i.e. the run completed), non-zero
  // only on a hard failure (couldn't reach the server at all — handled above).
  process.exit(0);
}

main().catch((err) => {
  console.error('Load test failed with an unexpected error:', err);
  process.exit(1);
});
