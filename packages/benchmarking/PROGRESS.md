# Benchmarking Progress

Tracking the implementation status of `@lukeocodes/composite-voice-benchmarking`.

See [METHODOLOGY.md](./METHODOLOGY.md) for the full specification.

---

## Completed

### Methodology (METHODOLOGY.md)

Full 1,634-line specification covering 11 sections plus appendices:

1. Principles — measurability, proveability, repeatability, fairness
2. Measurement instrument — event-based timestamps, SDK-level constants
3. Feature alignment — per-layer config locking (language, encoding, temperature, etc.)
4. Datasets — LibriSpeech (STT), LJSpeech (TTS), standardised prompt set (LLM)
5. Protocols — per-layer benchmark procedures with warm-up and cooldown
6. Statistics — P50/P90/P95/P99, 3x IQR outlier detection, Welch's t-test, Cohen's d
7. Environment recording — CPU, RAM, network, Node version, SDK commit hash
8. Distributed execution — 10 Fly.io machines, Fisher-Yates assignment, rebase-retry
9. Git storage — branch-per-dataset, deterministic file naming, PR as review surface
10. Result schema — `ResultFile` JSON format with provenance hashing
11. Reproducibility contract — dataset pinning, config snapshots, archive hashes

### Type System (`src/types/`)

- **`schema.ts`** — `ResultFile`, `MetricSummary`, `OutlierInfo`, per-layer metric types (`STTMetrics`, `LLMMetrics`, `TTSMetrics`, `FullStackMetrics`), `EnvironmentInfo`, `RawLogInfo`, `DatasetManifest`
- **`config.ts`** — Provider name unions, `TestAssignment`, `DatasetConfig`, per-layer alignment configs, `FullStackAlignmentConfig`, `RunnerConfig`, `OrchestratorConfig`

### Statistics (`src/stats/`)

- **`summary.ts`** — `computeSummary()` with percentile calculation, mean, stdDev, 3x IQR outlier detection (outliers flagged, never silently removed)
- **`wer.ts`** — `computeWER()` using word-level Levenshtein distance with text normalisation

### Environment (`src/environment/`)

- **`collector.ts`** — `collectEnvironment()` auto-detecting CPU, RAM, network, Node version, SDK commit hash; `pingHost()` with 5-ping measurement

### Orchestrator (`src/orchestrator/`)

- **`machines.ts`** — 10-machine pool (`benchmark-01` through `benchmark-10`)
- **`assignment.ts`** — `planRun()`, `buildTestList()`, `assignMachines()` with Fisher-Yates shuffle via `crypto.getRandomValues()`; model tier mappings for all providers; `getFullStackTriples()` generating all STT x LLM x TTS combinations (40 at fast tier)
- **`dispatch.ts`** — Feature alignment defaults, `buildRunnerConfig()`, `dispatchToMachine()` via `fly ssh console` with base64-encoded config, `dispatchAll()` for parallel dispatch

### Runner (`src/runner/`)

- **`index.ts`** — `run()` main entry point: collects environment, runs layer benchmark, writes result, commits + pushes, flags >10% error rate
- **`stt-bench.ts`** — Real-time audio feeding (4096-byte chunks, 256ms intervals), measures TTFP, TTFT, transcription latency, WER, confidence
- **`llm-bench.ts`** — Streaming token measurement, TTFT, TGT, TPS, ITL; dynamic provider imports; 3 runs per prompt
- **`tts-bench.ts`** — Live (WebSocket) and REST provider handling, TTFA, TST, throughput, ICL; 3 runs per sample
- **`full-stack-bench.ts`** — Three-phase STT -> LLM -> TTS pipeline with streaming overlap; live TTS providers receive LLM chunks as they arrive; 8 metrics (E2E, PRT, per-segment, handoffs, overhead)

### Results (`src/results/`)

- **`writer.ts`** — `buildResultPath()` with deterministic naming (`{layer}-{provider}-{model}.json`), `writeResult()`, `commitAndPush()` with rebase-retry (5 attempts)
- **`raw-log.ts`** — `RawLogWriter` for NDJSON event logging with SHA-256 provenance hash

### CLI (`src/cli.ts`)

- `plan` — Show test assignments for a given tier/layer
- `orchestrate` — Distribute tests to Fly.io machines
- `run` — Execute benchmark on a machine (accepts `--config-b64`)

### Package Setup

- Workspace package with `workspace:*` dependency on `@lukeocodes/composite-voice`
- Scripts: `bench`, `bench:stt`, `bench:llm`, `bench:tts`, `bench:full-stack`

---

## Remaining Work

### High Priority

- [ ] **Standardised prompt set** — Replace the 5 placeholder prompts in `llm-bench.ts` with the 200-prompt standardised set (Section 4.2 of methodology)
- [ ] **LibriSpeech directory walker** — `stt-bench.ts` currently expects a `manifest.json`; needs a walker that discovers `.flac`/`.wav` files and paired transcripts from the LibriSpeech directory structure
- [ ] **TTS voice ID configuration** — ElevenLabs and Cartesia use hardcoded default voice IDs; these should be configurable per-provider or use documented defaults
- [ ] **Dataset provisioning** — Runtime dataset download/extraction and archive hash verification before benchmark starts

### Medium Priority

- [ ] **PR creation** — Automated PR creation after all machines complete (currently just commits to branch)
- [ ] **Orchestrator CLI wiring** — `bench orchestrate` command needs full end-to-end wiring with config file parsing and Fly.io app resolution
- [ ] **Result aggregation** — Post-run analysis that reads all result files from a branch and produces comparison tables
- [ ] **Infographic generation** — Visualisation of results for the website (bar charts, latency distributions, tier comparisons)

### Low Priority

- [ ] **LJSpeech dataset integration** — TTS benchmark currently uses inline sample sentences; integrate actual LJSpeech dataset
- [ ] **Retry / circuit breaker** — Per-trial retry logic for transient API failures (distinct from the >10% error rate flag)
- [ ] **Cost tracking** — Record API costs per trial where providers expose usage metadata
- [ ] **Historical comparison** — Query tooling to compare results across dates/branches

---

## Architecture Notes

```
packages/benchmarking/
  METHODOLOGY.md          # The specification (1,634 lines)
  PROGRESS.md             # This file
  package.json
  tsconfig.json
  src/
    index.ts              # Package exports
    cli.ts                # CLI entry point
    types/
      schema.ts           # Result file schema
      config.ts           # Runner/orchestrator config
    stats/
      summary.ts          # Percentile/outlier computation
      wer.ts              # Word Error Rate
    environment/
      collector.ts        # Machine environment metadata
    orchestrator/
      machines.ts         # Machine pool
      assignment.ts       # Test planning + Fisher-Yates assignment
      dispatch.ts         # Fly.io dispatch + alignment defaults
    runner/
      index.ts            # Main runner entry point
      stt-bench.ts        # STT benchmark
      llm-bench.ts        # LLM benchmark
      tts-bench.ts        # TTS benchmark
      full-stack-bench.ts # Full pipeline benchmark
    results/
      writer.ts           # Result file writing + git operations
      raw-log.ts          # NDJSON event log with SHA-256
```

## Key Design Decisions

1. **Event timestamps as measurement instrument** — The SDK emits timestamped events on every state transition. Any SDK overhead is a constant across all providers, so relative comparisons remain valid.

2. **Fisher-Yates shuffle for machine assignment** — Uses `crypto.getRandomValues()` for cryptographic randomness to prevent any systematic bias in which provider runs on which machine.

3. **Deterministic file naming** — `{layer}-{provider}-{model}.json` guarantees no merge conflicts when 10 machines push concurrently to the same branch.

4. **Streaming pipeline overlap** — In full-stack benchmarks, live TTS providers receive LLM tokens as they stream in. This is how real voice agents work, and it makes PRT (pipeline response time) meaningful as distinct from E2E latency.

5. **Outliers flagged, never removed** — Following the methodology's principle that all data points are reported. Outlier detection exists for analysis, not for exclusion.
