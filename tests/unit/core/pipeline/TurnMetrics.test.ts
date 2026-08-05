/**
 * Tests for TurnMetricsCollector — per-turn latency metrics.
 */

import {
  TurnMetricsCollector,
  type TurnMetricsSummary,
} from '../../../../src/core/pipeline/TurnMetrics';

/** Manually-advanced clock for deterministic durations. */
class FakeClock {
  private t = 1_000_000;

  now = (): number => this.t;

  advance(ms: number): number {
    this.t += ms;
    return this.t;
  }
}

function makeCollector(): {
  collector: TurnMetricsCollector;
  clock: FakeClock;
  summaries: TurnMetricsSummary[];
} {
  const clock = new FakeClock();
  const summaries: TurnMetricsSummary[] = [];
  const collector = new TurnMetricsCollector((s) => summaries.push(s), clock.now);
  return { collector, clock, summaries };
}

describe('TurnMetricsCollector', () => {
  it('captures a full turn with ordered timestamps and durations', () => {
    const { collector, clock, summaries } = makeCollector();

    collector.startTurn('hello', { modality: 'voice' });
    clock.advance(50);
    collector.markLLMStart();
    clock.advance(200);
    collector.markLLMFirstToken();
    clock.advance(100);
    collector.markTTSFirstAudio();
    clock.advance(30);
    collector.markPlaybackStart();
    clock.advance(400);
    collector.markLLMComplete();
    clock.advance(500);
    collector.markPlaybackEnd();
    clock.advance(10);
    collector.finishTurn();

    expect(summaries).toHaveLength(1);
    const s = summaries[0]!;
    expect(s.turnId).toBe(1);
    expect(s.transcript).toBe('hello');
    expect(s.modality).toBe('voice');
    expect(s.eagerUsed).toBe(false);
    expect(s.interrupted).toBe(false);

    expect(s.durations.sttFinalToFirstToken).toBe(250);
    expect(s.durations.firstTokenToFirstAudio).toBe(100);
    expect(s.durations.firstAudioToPlayback).toBe(30);
    expect(s.durations.voiceToVoice).toBe(380);
    expect(s.durations.llmTotal).toBe(730);
    expect(s.durations.turnTotal).toBe(1290);

    expect(s.timestamps.playbackEnd).toBe(s.timestamps.playbackStart! + 900);
  });

  it('adopts eager marks so first-token latency can go negative', () => {
    const { collector, clock, summaries } = makeCollector();

    collector.markPreflight();
    clock.advance(20);
    collector.markLLMStart(); // eager generation starts
    clock.advance(80);
    collector.markLLMFirstToken(); // first token before speech_final
    clock.advance(100);
    collector.startTurn('confirmed text', { modality: 'voice', adoptEager: true });
    clock.advance(10);
    collector.finishTurn();

    const s = summaries[0]!;
    expect(s.eagerUsed).toBe(true);
    expect(s.timestamps.preflight).toBeDefined();
    // First token arrived 100ms BEFORE the confirmed transcript
    expect(s.durations.sttFinalToFirstToken).toBe(-100);
  });

  it('discards eager marks when not adopted', () => {
    const { collector, clock, summaries } = makeCollector();

    collector.markPreflight();
    collector.markLLMStart();
    collector.markLLMFirstToken();
    clock.advance(100);
    collector.startTurn('different text', { modality: 'voice' });
    clock.advance(40);
    collector.markLLMStart(); // fresh generation
    clock.advance(60);
    collector.markLLMFirstToken();
    collector.finishTurn();

    const s = summaries[0]!;
    expect(s.eagerUsed).toBe(false);
    expect(s.timestamps.preflight).toBeUndefined();
    expect(s.durations.sttFinalToFirstToken).toBe(100);
  });

  it('finishes the previous turn as interrupted when a new one starts', () => {
    const { collector, summaries } = makeCollector();

    collector.startTurn('first', { modality: 'voice' });
    collector.markLLMStart();
    collector.startTurn('second', { modality: 'voice' });
    collector.finishTurn();

    expect(summaries).toHaveLength(2);
    expect(summaries[0]).toMatchObject({ turnId: 1, transcript: 'first', interrupted: true });
    expect(summaries[1]).toMatchObject({ turnId: 2, transcript: 'second', interrupted: false });
  });

  it('abortTurn emits an interrupted summary with partial marks', () => {
    const { collector, clock, summaries } = makeCollector();

    collector.startTurn('cut short', { modality: 'voice' });
    clock.advance(30);
    collector.markLLMStart();
    collector.abortTurn();

    const s = summaries[0]!;
    expect(s.interrupted).toBe(true);
    expect(s.timestamps.llmStart).toBeDefined();
    expect(s.timestamps.llmFirstToken).toBeUndefined();
    expect(s.durations.voiceToVoice).toBeUndefined();
    expect(s.durations.turnTotal).toBe(30);
  });

  it('ignores finish/abort/marks when no turn is active', () => {
    const { collector, summaries } = makeCollector();

    collector.finishTurn();
    collector.abortTurn();
    collector.markLLMStart();
    collector.markLLMFirstToken();
    collector.markTTSFirstAudio();
    collector.markPlaybackStart();
    collector.markPlaybackEnd();

    expect(summaries).toHaveLength(0);
  });

  it('first-marks win first, last-marks win last', () => {
    const { collector, clock, summaries } = makeCollector();

    collector.startTurn('hi', { modality: 'voice' });
    collector.markLLMFirstToken();
    const firstTokenAt = clock.now();
    clock.advance(100);
    collector.markLLMFirstToken(); // ignored — first-write-wins
    collector.markPlaybackEnd();
    clock.advance(100);
    collector.markPlaybackEnd(); // overwrites — last-write-wins
    const lastEndAt = clock.now();
    collector.finishTurn();

    const s = summaries[0]!;
    expect(s.timestamps.llmFirstToken).toBe(firstTokenAt);
    expect(s.timestamps.playbackEnd).toBe(lastEndAt);
  });

  it('supports text-modality turns', () => {
    const { collector, summaries } = makeCollector();

    collector.startTurn('typed message', { modality: 'text' });
    collector.finishTurn();

    expect(summaries[0]).toMatchObject({ modality: 'text', transcript: 'typed message' });
  });

  it('increments turnId across turns', () => {
    const { collector, summaries } = makeCollector();

    collector.startTurn('one', { modality: 'voice' });
    collector.finishTurn();
    collector.startTurn('two', { modality: 'voice' });
    collector.finishTurn();

    expect(summaries.map((s) => s.turnId)).toEqual([1, 2]);
  });
});
