/**
 * Tests for the built-in guardrails: PII/pattern redaction, pronunciation
 * fixes, blocklists, and the moderation adapter.
 */

import {
  createPatternRedactionGuardrail,
  createPIIRedactionGuardrail,
  createPronunciationGuardrail,
  createBlocklistGuardrail,
  createModerationGuardrail,
} from '../../../src/guardrails/index';
import type {
  Guardrail,
  GuardrailContext,
  GuardrailResult,
} from '../../../src/core/types/guardrails';

const CONTEXT: GuardrailContext = { stage: 'final', accumulated: '', messages: [] };

/** Run a guardrail and normalize the "no change" result to the input text. */
async function filter(guardrail: Guardrail, text: string): Promise<string> {
  const result = await guardrail.check(text, { ...CONTEXT, accumulated: text });
  if (!result) return text;
  if (result.block) return '';
  return result.text ?? text;
}

/** Run a guardrail and return the raw result. */
async function run(guardrail: Guardrail, text: string): Promise<GuardrailResult | void> {
  return guardrail.check(text, { ...CONTEXT, accumulated: text });
}

describe('createPIIRedactionGuardrail', () => {
  describe('email', () => {
    const guardrail = createPIIRedactionGuardrail({ types: ['email'] });

    it('redacts an address', async () => {
      expect(await filter(guardrail, 'Write to ada@example.com today')).toBe(
        'Write to [redacted] today'
      );
    });

    it('redacts every address in the text', async () => {
      expect(await filter(guardrail, 'a@b.com and c@d.org')).toBe('[redacted] and [redacted]');
    });

    it('handles plus-addressing and subdomains', async () => {
      expect(await filter(guardrail, 'ada+work@mail.example.co.uk')).toBe('[redacted]');
    });

    it('leaves ordinary prose alone', async () => {
      expect(await filter(guardrail, 'Meet me at 5pm sharp')).toBe('Meet me at 5pm sharp');
    });
  });

  describe('phone', () => {
    const guardrail = createPIIRedactionGuardrail({ types: ['phone'] });

    it.each(['555-123-4567', '(555) 123-4567', '555.123.4567', '+1 555 123 4567', '5551234567'])(
      'redacts %s',
      async (number) => {
        expect(await filter(guardrail, `Call ${number} now`)).toBe('Call [redacted] now');
      }
    );

    it('leaves a short number alone', async () => {
      expect(await filter(guardrail, 'Order 12345 shipped')).toBe('Order 12345 shipped');
    });
  });

  describe('ssn', () => {
    const guardrail = createPIIRedactionGuardrail({ types: ['ssn'] });

    it('redacts a formatted SSN', async () => {
      expect(await filter(guardrail, 'SSN 123-45-6789 on file')).toBe('SSN [redacted] on file');
    });
  });

  describe('creditCard', () => {
    const guardrail = createPIIRedactionGuardrail({ types: ['creditCard'] });

    it('redacts a number that passes the Luhn checksum', async () => {
      // 4242 4242 4242 4242 is the canonical Luhn-valid test card.
      expect(await filter(guardrail, 'Card 4242 4242 4242 4242 charged')).toBe(
        'Card [redacted] charged'
      );
    });

    it('redacts a hyphenated Luhn-valid number', async () => {
      expect(await filter(guardrail, '4242-4242-4242-4242')).toBe('[redacted]');
    });

    it('leaves a card-shaped number that fails the checksum alone', async () => {
      expect(await filter(guardrail, 'Reference 1234 5678 9012 3456')).toBe(
        'Reference 1234 5678 9012 3456'
      );
    });

    it('does not report a redaction it declined to make', async () => {
      expect(await run(guardrail, 'Reference 1234 5678 9012 3456')).toBeUndefined();
    });
  });

  describe('ipAddress', () => {
    const guardrail = createPIIRedactionGuardrail({ types: ['ipAddress'] });

    it('redacts an IPv4 address', async () => {
      expect(await filter(guardrail, 'Host 192.168.1.100 is up')).toBe('Host [redacted] is up');
    });

    it('leaves an out-of-range quad alone', async () => {
      expect(await filter(guardrail, 'Version 999.999.999.999')).toBe('Version 999.999.999.999');
    });
  });

  describe('configuration', () => {
    it('redacts every category by default', async () => {
      const guardrail = createPIIRedactionGuardrail();
      const text = 'Reach ada@example.com or 555-123-4567';
      expect(await filter(guardrail, text)).toBe('Reach [redacted] or [redacted]');
    });

    it('applies per-category replacements', async () => {
      const guardrail = createPIIRedactionGuardrail({
        types: ['email', 'phone'],
        replacements: { email: 'an email address', phone: 'a phone number' },
      });
      expect(await filter(guardrail, 'ada@example.com / 555-123-4567')).toBe(
        'an email address / a phone number'
      );
    });

    it('honours a global replacement override', async () => {
      const guardrail = createPIIRedactionGuardrail({ types: ['email'], replacement: '***' });
      expect(await filter(guardrail, 'ada@example.com')).toBe('***');
    });

    it('applies additional custom patterns', async () => {
      const guardrail = createPIIRedactionGuardrail({
        types: [],
        additionalPatterns: [
          { name: 'policy', pattern: /\bPOL-\d{6}\b/g, replacement: 'your policy' },
        ],
      });
      expect(await filter(guardrail, 'Policy POL-123456 renews')).toBe('Policy your policy renews');
    });

    it('reports what it redacted in the event metadata', async () => {
      const guardrail = createPIIRedactionGuardrail({ types: ['email'] });
      const result = await run(guardrail, 'a@b.com and c@d.com');
      expect(result).toMatchObject({ metadata: { redacted: { email: 2 } } });
      expect(result?.reason).toContain('email');
    });

    it('returns nothing when there is no PII', async () => {
      expect(await run(createPIIRedactionGuardrail(), 'Nothing sensitive here')).toBeUndefined();
    });

    it('is reusable across calls despite global regex state', async () => {
      const guardrail = createPIIRedactionGuardrail({ types: ['email'] });
      for (let i = 0; i < 3; i++) {
        expect(await filter(guardrail, 'ada@example.com')).toBe('[redacted]');
      }
    });

    it('runs at both stages by default', () => {
      expect(createPIIRedactionGuardrail().stages).toBeUndefined();
    });

    it('honours a stage restriction', () => {
      expect(createPIIRedactionGuardrail({ stages: ['final'] }).stages).toEqual(['final']);
    });
  });
});

describe('createPatternRedactionGuardrail', () => {
  it('supports a function replacement', async () => {
    const guardrail = createPatternRedactionGuardrail({
      patterns: [
        {
          name: 'account',
          pattern: /\b\d{10}\b/g,
          replacement: (match) => `account ending ${match.slice(-4)}`,
        },
      ],
    });
    expect(await filter(guardrail, 'Account 1234567890 is open')).toBe(
      'Account account ending 7890 is open'
    );
  });

  it('applies patterns in order, feeding each the previous result', async () => {
    const guardrail = createPatternRedactionGuardrail({
      patterns: [
        { name: 'first', pattern: /red/g, replacement: 'green' },
        { name: 'second', pattern: /green/g, replacement: 'blue' },
      ],
    });
    expect(await filter(guardrail, 'red')).toBe('blue');
  });

  it('uses the shared replacement for patterns without their own', async () => {
    const guardrail = createPatternRedactionGuardrail({
      patterns: [{ name: 'digits', pattern: /\d+/g }],
      replacement: '<number>',
    });
    expect(await filter(guardrail, 'value 42')).toBe('value <number>');
  });
});

describe('createPronunciationGuardrail', () => {
  it('substitutes the spoken form of a term', async () => {
    const guardrail = createPronunciationGuardrail({ replacements: { SQL: 'sequel' } });
    expect(await filter(guardrail, 'Run the SQL query')).toBe('Run the sequel query');
  });

  it('matches case-insensitively by default', async () => {
    const guardrail = createPronunciationGuardrail({ replacements: { sql: 'sequel' } });
    expect(await filter(guardrail, 'A SQL and a Sql')).toBe('A sequel and a sequel');
  });

  it('respects caseSensitive', async () => {
    const guardrail = createPronunciationGuardrail({
      replacements: { IT: 'I T' },
      caseSensitive: true,
    });
    expect(await filter(guardrail, 'IT says it works')).toBe('I T says it works');
  });

  it('matches whole words only by default', async () => {
    const guardrail = createPronunciationGuardrail({ replacements: { AI: 'A.I.' } });
    expect(await filter(guardrail, 'AI in a chain said')).toBe('A.I. in a chain said');
  });

  it('allows substring matching when wholeWord is off', async () => {
    const guardrail = createPronunciationGuardrail({
      replacements: { ai: 'AY' },
      wholeWord: false,
    });
    expect(await filter(guardrail, 'chain')).toBe('chAYn');
  });

  it('prefers the longest matching term', async () => {
    const guardrail = createPronunciationGuardrail({
      replacements: { AWS: 'A W S', 'AWS Lambda': 'A W S Lambda function' },
    });
    expect(await filter(guardrail, 'Deploy to AWS Lambda now')).toBe(
      'Deploy to A W S Lambda function now'
    );
  });

  it('handles terms containing regex metacharacters', async () => {
    const guardrail = createPronunciationGuardrail({
      replacements: { 'C++': 'C plus plus', '.NET': 'dot net' },
    });
    expect(await filter(guardrail, 'C++ and .NET')).toBe('C plus plus and dot net');
  });

  it('reports which terms it applied', async () => {
    const guardrail = createPronunciationGuardrail({
      replacements: { SQL: 'sequel', kubectl: 'kube control' },
    });
    expect(await run(guardrail, 'SQL only')).toMatchObject({ metadata: { terms: ['SQL'] } });
  });

  it('returns nothing when no term matches', async () => {
    const guardrail = createPronunciationGuardrail({ replacements: { SQL: 'sequel' } });
    expect(await run(guardrail, 'nothing here')).toBeUndefined();
  });

  it('inserts a spoken form containing $ tokens literally', async () => {
    const guardrail = createPronunciationGuardrail({
      replacements: { USD: 'dollars ($&, $1, $`)' },
    });
    expect(await filter(guardrail, 'Priced in USD today')).toBe(
      'Priced in dollars ($&, $1, $`) today'
    );
  });

  it('applies terms in sequence, so a spoken form can be rewritten again', async () => {
    const guardrail = createPronunciationGuardrail({
      replacements: { PostgreSQL: 'post gres SQL', SQL: 'sequel' },
    });
    expect(await filter(guardrail, 'Use PostgreSQL')).toBe('Use post gres sequel');
  });

  it('is reusable across calls', async () => {
    const guardrail = createPronunciationGuardrail({ replacements: { SQL: 'sequel' } });
    for (let i = 0; i < 3; i++) {
      expect(await filter(guardrail, 'SQL SQL')).toBe('sequel sequel');
    }
  });
});

describe('createBlocklistGuardrail', () => {
  it('blocks on a term match', async () => {
    const guardrail = createBlocklistGuardrail({ terms: ['Project Halcyon'] });
    const result = await run(guardrail, 'We are shipping Project Halcyon in June');
    expect(result).toMatchObject({ block: true, metadata: { matched: ['Project Halcyon'] } });
  });

  it('matches case-insensitively by default', async () => {
    const guardrail = createBlocklistGuardrail({ terms: ['halcyon'] });
    expect(await run(guardrail, 'HALCYON')).toMatchObject({ block: true });
  });

  it('matches whole words only by default', async () => {
    const guardrail = createBlocklistGuardrail({ terms: ['ass'] });
    expect(await run(guardrail, 'a thorough assessment')).toBeUndefined();
  });

  it('blocks on a pattern match', async () => {
    const guardrail = createBlocklistGuardrail({ patterns: [/\bINTERNAL-\d+\b/g] });
    expect(await run(guardrail, 'See INTERNAL-42')).toMatchObject({ block: true });
  });

  it('redacts instead of blocking when configured to', async () => {
    const guardrail = createBlocklistGuardrail({
      terms: ['damn'],
      action: 'redact',
      replacement: '—',
    });
    expect(await filter(guardrail, 'well damn that is damn fast')).toBe('well — that is — fast');
  });

  it('inserts a replacement containing $ tokens literally', async () => {
    const guardrail = createBlocklistGuardrail({
      terms: ['secret'],
      action: 'redact',
      replacement: '$&',
    });
    expect(await filter(guardrail, 'the secret sauce')).toBe('the $& sauce');
  });

  it('collects every matching term', async () => {
    const guardrail = createBlocklistGuardrail({ terms: ['alpha', 'beta'] });
    expect(await run(guardrail, 'alpha and beta')).toMatchObject({
      metadata: { matched: ['alpha', 'beta'] },
    });
  });

  it('returns nothing when nothing matches', async () => {
    const guardrail = createBlocklistGuardrail({ terms: ['alpha'] });
    expect(await run(guardrail, 'nothing to see')).toBeUndefined();
  });

  it('is reusable across calls despite global regex state', async () => {
    const guardrail = createBlocklistGuardrail({ terms: ['alpha'] });
    for (let i = 0; i < 3; i++) {
      expect(await run(guardrail, 'alpha')).toMatchObject({ block: true });
    }
  });
});

describe('createModerationGuardrail', () => {
  it('runs at the final stage only by default', () => {
    expect(createModerationGuardrail({ moderate: () => ({ flagged: false }) }).stages).toEqual([
      'final',
    ]);
  });

  it('passes clean text through', async () => {
    const guardrail = createModerationGuardrail({ moderate: () => ({ flagged: false }) });
    expect(await run(guardrail, 'perfectly fine')).toBeUndefined();
  });

  it('blocks flagged text', async () => {
    const guardrail = createModerationGuardrail({
      moderate: () => ({ flagged: true, categories: ['violence'], score: 0.9 }),
    });
    expect(await run(guardrail, 'bad')).toMatchObject({
      block: true,
      reason: 'flagged: violence',
      metadata: { categories: ['violence'], score: 0.9 },
    });
  });

  it('speaks the configured replacement instead of blocking', async () => {
    const guardrail = createModerationGuardrail({
      moderate: () => ({ flagged: true }),
      replacement: "I can't help with that.",
    });
    expect(await filter(guardrail, 'bad')).toBe("I can't help with that.");
  });

  it('prefers sanitized text from the verdict over the replacement', async () => {
    const guardrail = createModerationGuardrail({
      moderate: () => ({ flagged: true, text: 'cleaned up' }),
      replacement: 'fallback',
    });
    expect(await filter(guardrail, 'bad')).toBe('cleaned up');
  });

  it('awaits an async classifier', async () => {
    const guardrail = createModerationGuardrail({
      moderate: async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return { flagged: true };
      },
    });
    expect(await run(guardrail, 'bad')).toMatchObject({ block: true });
  });

  it('skips the classifier for whitespace-only text', async () => {
    const moderate = jest.fn(() => ({ flagged: true }));
    const guardrail = createModerationGuardrail({ moderate });
    expect(await run(guardrail, '   ')).toBeUndefined();
    expect(moderate).not.toHaveBeenCalled();
  });

  it('forwards the guardrail context to the classifier', async () => {
    const moderate = jest.fn(() => ({ flagged: false }));
    const guardrail = createModerationGuardrail({ moderate });
    await guardrail.check('text', { ...CONTEXT, accumulated: 'text' });
    expect(moderate).toHaveBeenCalledWith('text', expect.objectContaining({ stage: 'final' }));
  });
});
