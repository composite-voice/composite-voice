# Testing Guide

Comprehensive testing guide for CompositeVoice SDK development.

## Overview

CompositeVoice uses Jest for testing in a JSDOM environment with a focus on:

- **Unit tests** - Individual component testing with minimal dependencies
- **Integration tests** - Multi-component workflows and real usage patterns
- **Snapshot tests** - Structure validation for complex objects
- **Mock implementations** - Isolated testing without external dependencies

## Testing Philosophy

### What We Test

1. **Pure Logic** - Functions with deterministic inputs and outputs
2. **State Management** - State transitions and validations
3. **Error Handling** - Error cases and edge conditions
4. **API Contracts** - Public interfaces and type safety
5. **Integration Flows** - Real-world usage patterns

### What We Don't Test (or Test Differently)

1. **Complex Async Browser APIs** - WebSocket connections, MediaStream lifecycle
   - **Reason:** Require complex mocking that often tests the mock more than the code
   - **Alternative:** Focus on testable logic (state, config, error handling) in unit tests
   - **Alternative:** Use integration tests with real browser environment

2. **Browser-Specific Implementations** - Native APIs that can't be reliably mocked
   - **Reason:** JSDOM limitations and unpredictable behavior
   - **Alternative:** Manual testing in real browsers
   - **Alternative:** E2E tests with Playwright/Puppeteer (future consideration)

## Test Coverage

### ✅ Completed Tests

#### Utils (100% Core Coverage)

- **errors.test.ts** (196 assertions)
  - All 11 custom error classes
  - Error context and recovery flags
  - Stack trace capture
- **logger.test.ts** (150+ assertions)
  - Log levels (debug, info, warn, error)
  - Level filtering
  - Custom loggers
  - Child loggers with context
  - Message formatting

- **websocket.test.ts** (200+ assertions)
  - ✅ Initialization and configuration
  - ✅ State management (getState, isConnected)
  - ✅ Handler registration (setHandlers)
  - ✅ Send method validation
  - ✅ Protocol and timeout configuration
  - ✅ Reconnection configuration
  - ✅ Error handling and error types
  - ❌ Actual connection establishment (too complex to reliably mock)
  - ❌ Message receiving and dispatching (requires real WebSocket)
  - ❌ Reconnection logic execution (timing-dependent)

- **audio.test.ts** (90+ assertions)
  - PCM conversion
  - Resampling
  - Buffer concatenation
  - WAV header generation
  - Volume detection

#### Core (Comprehensive Coverage)

- **EventEmitter.test.ts** (120+ assertions)
  - Type-safe event emission
  - Wildcard listeners
  - One-time listeners
  - Event removal
  - Max listeners warning
  - Async event handling

- **EventEmitter.snapshot.test.ts** (Snapshots)
  - Event structure validation
  - Emitter state snapshots

- **AgentState.test.ts** (180+ assertions)
  - State transitions
  - Invalid transition prevention
  - Forced transitions
  - State history tracking
  - Callbacks
  - Time tracking
  - Statistics

- **AudioCapture.test.ts** (100+ assertions)
  - Microphone permissions
  - Audio capture lifecycle
  - Pause/resume
  - Configuration
  - Error handling

#### Providers

- **BaseProvider.test.ts** (80+ assertions)
  - Initialization lifecycle
  - Configuration management
  - Ready state checking
  - Logger integration

#### Integration

- **composite-mode.test.ts** (60+ assertions)
  - End-to-end workflow
  - Event flow
  - Error handling
  - Resource cleanup

### 📊 Coverage Statistics

```
Total Tests:     10 test suites
Total Assertions: 1000+ assertions
Estimated Coverage: ~75%
```

### 🚧 Pending Tests

- AudioPlayer tests
- Native STT/TTS provider tests
- All-in-one mode integration
- CompositeVoice main class tests
- Provider-specific integration tests

## Running Tests

### Quick Commands

```bash
# Run all tests
pnpm test

# Watch mode (auto-rerun on changes)
pnpm test:watch

# Coverage report
pnpm test:coverage

# Run specific test file
pnpm test errors.test

# Run tests matching pattern
pnpm test -t "EventEmitter"

# Update snapshots
pnpm test -u

# Verbose output
pnpm test --verbose

# Run with debugger
node --inspect-brk node_modules/.bin/jest --runInBand
```

### CI Commands

```bash
# Pre-commit checks
pnpm run format:check
pnpm run lint
pnpm run type-check
pnpm test:coverage

# Coverage report with threshold checking
pnpm test:coverage -- --coverageThreshold='{"global":{"statements":80}}'
```

## Test Structure

```
tests/
├── unit/                           # Unit tests
│   ├── core/
│   │   ├── audio/
│   │   │   └── AudioCapture.test.ts       ✅
│   │   ├── events/
│   │   │   ├── EventEmitter.test.ts       ✅
│   │   │   ├── EventEmitter.snapshot.test.ts ✅
│   │   │   └── __snapshots__/
│   │   │       └── EventEmitter.snapshot.test.ts.snap
│   │   └── state/
│   │       └── AgentState.test.ts         ✅
│   ├── providers/
│   │   └── base/
│   │       └── BaseProvider.test.ts       ✅
│   └── utils/
│       ├── audio.test.ts                  ✅
│       ├── errors.test.ts                 ✅
│       ├── logger.test.ts                 ✅
│       └── websocket.test.ts              ✅
├── integration/
│   └── composite-mode.test.ts             ✅
├── mocks/
│   └── MockProviders.ts                   ✅
├── __snapshots__/                         # Snapshot files
├── setup.ts                               # Jest setup
└── README.md                              # Test documentation

Legend: ✅ Completed | 🚧 Future consideration
```

## Writing Tests

### Test Template

```typescript
/**
 * Component tests
 */

import { Component } from '../../../src/path/to/Component';

describe('Component', () => {
  let component: Component;

  beforeEach(() => {
    component = new Component();
  });

  afterEach(() => {
    // Cleanup
    jest.clearAllMocks();
  });

  describe('feature', () => {
    it('should handle normal case', () => {
      const result = component.method();
      expect(result).toBe(expected);
    });

    it('should handle edge case', () => {
      // Test edge case
    });

    it('should handle error case', () => {
      expect(() => component.errorMethod()).toThrow();
    });
  });
});
```

### Async Tests

```typescript
it('should complete async operation', async () => {
  await expect(asyncOperation()).resolves.toBe(value);
});

it('should reject on error', async () => {
  await expect(asyncOperation()).rejects.toThrow(Error);
});

it('should handle promises', async () => {
  const result = await component.asyncMethod();
  expect(result).toBeDefined();
});
```

### Snapshot Tests

```typescript
it('should match structure snapshot', () => {
  const data = createComplexStructure();
  expect(data).toMatchSnapshot();
});

// Update snapshots when structure intentionally changes
// pnpm test -u
```

### Mock Usage

```typescript
import { MockLLMProvider } from '../../mocks/MockProviders';

it('should use mock provider', async () => {
  const provider = new MockLLMProvider();
  await provider.initialize();

  const result = await provider.generate('test');

  expect(provider.generateCalled).toBe(true);
});
```

## Best Practices

### ✅ DO

1. **Test behavior, not implementation**

   ```typescript
   // Good
   it('should emit ready event', () => {
     agent.initialize();
     expect(listener).toHaveBeenCalledWith('ready');
   });
   ```

2. **Use descriptive names**

   ```typescript
   it('should throw MicrophonePermissionError when permission denied', () => {});
   ```

3. **Test all code paths**

   ```typescript
   describe('method', () => {
     it('should handle success case', () => {});
     it('should handle failure case', () => {});
     it('should handle edge case', () => {});
   });
   ```

4. **Clean up resources**

   ```typescript
   afterEach(async () => {
     await component.dispose();
     jest.clearAllMocks();
   });
   ```

5. **Test async code properly**
   ```typescript
   it('should wait for completion', async () => {
     await component.asyncMethod();
     expect(component.isDone()).toBe(true);
   });
   ```

### ❌ DON'T

1. **Test implementation details**

   ```typescript
   // Bad
   it('should set _privateProperty', () => {
     expect(component['_privateProperty']).toBe(value);
   });
   ```

2. **Use vague test names**

   ```typescript
   // Bad
   it('works', () => {});
   it('test1', () => {});
   ```

3. **Skip error testing**

   ```typescript
   // Bad - only testing happy path
   it('should work', () => {
     expect(component.method()).toBe(value);
   });
   ```

4. **Forget cleanup**
   ```typescript
   // Bad - memory leaks
   it('test', async () => {
     await component.start();
     // Missing: await component.stop();
   });
   ```

## Mocking Browser APIs

Browser APIs are automatically mocked in `setup.ts`:

```typescript
// Available mocks:
-AudioContext - MediaStream - getUserMedia - SpeechRecognition - SpeechSynthesis - WebSocket;
```

### Custom Mocking

```typescript
beforeEach(() => {
  global.navigator.mediaDevices.getUserMedia = jest.fn().mockResolvedValue(mockStream);
});

afterEach(() => {
  jest.restoreAllMocks();
});
```

## Debugging Tests

### Failed Test

```bash
# Run only failing test
pnpm test -t "failing test name"

# Show full error details
pnpm test --verbose

# Run with coverage to see what's not tested
pnpm test:coverage
```

### Timeout Issues

```typescript
// Increase timeout for slow tests
it('slow test', async () => {
  // test code
}, 10000); // 10 second timeout
```

### Memory Leaks

```bash
# Run with leak detection
pnpm test --detectLeaks

# Clean up in afterEach
afterEach(() => {
  jest.clearAllMocks();
  jest.clearAllTimers();
});
```

## Coverage Goals

Focus on testing behavior and logic rather than achieving arbitrary coverage percentages.

**Target Coverage:**

- **Core functionality:** 90%+ coverage
- **Utilities:** 90%+ coverage
- **Providers:** 80%+ coverage (excluding browser API interactions)
- **Integration:** All critical user workflows covered

| Metric     | Target | Current |
| ---------- | ------ | ------- |
| Statements | 80%    | ~75%    |
| Branches   | 80%    | ~70%    |
| Functions  | 80%    | ~75%    |
| Lines      | 80%    | ~75%    |

### Viewing Coverage

```bash
# Generate coverage report
pnpm test:coverage

# Open HTML report
open coverage/lcov-report/index.html
```

### Coverage Configuration

```javascript
// jest.config.js
coverageThreshold: {
  global: {
    branches: 80,
    functions: 80,
    lines: 80,
    statements: 80,
  },
},
```

## Key Testing Decisions

### WebSocket Testing

**Decision:** Focus unit tests on WebSocketManager's testable surface area rather than full connection lifecycle.

**Rationale:**

- WebSocket connection lifecycle is highly asynchronous and timing-dependent
- Complex mocking often leads to flaky tests
- Real WebSocket behavior can't be accurately replicated in JSDOM
- Testing configuration, state, handlers, and error conditions provides adequate coverage

**Future consideration:** Set up a real WebSocket test server for integration tests.

### Audio Testing

**Decision:** Test audio processing logic separately from browser audio APIs.

**What we test:**

- ✅ Audio format conversion (downsample, int16 conversion)
- ✅ Configuration and setup
- ✅ State management (start, pause, stop)
- ✅ Error conditions

**What we mock minimally:**

- AudioContext and related Web Audio APIs
- MediaStream for input capture
- Audio buffer processing logic

### Provider Testing

**Decision:** Use mock providers for testing the SDK core, test real providers separately.

**Approach:**

- Mock providers in `tests/mocks/` for testing CompositeVoice core
- Separate tests for each real provider implementation
- Integration tests verify providers work together

## Test Environment

- **Framework:** Jest
- **Environment:** JSDOM (simulated browser)
- **TypeScript:** Tests written in TypeScript
- **Mocking:** Jest mocks for browser APIs

## Continuous Integration

Tests run on:

- Every commit to feature branches
- Pull requests
- Pre-publish hooks

### GitHub Actions Example

```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
      - run: pnpm install
      - run: pnpm test:coverage
      - run: pnpm run lint
      - run: pnpm run type-check
```

## Contributing Tests

When adding features:

1. ✅ Write tests first (TDD) when possible
2. ✅ Focus on behavior, not implementation
3. ✅ Include unit + integration tests
4. ✅ Test happy path + error cases
5. ✅ Aim for 80%+ coverage
6. ✅ Update documentation

### When Tests Fail

1. **Read the error carefully** - Often points to the exact issue
2. **Check if it's a mock issue** - Complex mocks can be the problem, not the code
3. **Consider if it's the right test** - Should this be an integration test instead?
4. **Verify in a real browser** - Sometimes JSDOM behavior differs from real browsers

## Future Improvements

- [ ] Add E2E tests with Playwright for real browser testing
- [ ] Set up WebSocket test server for integration tests
- [ ] Add performance benchmarks
- [ ] Add visual regression tests for examples
- [ ] Improve code coverage reporting and enforcement

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)
- [TypeScript Jest](https://kulshekhar.github.io/ts-jest/)
- [Jest Cheat Sheet](https://github.com/sapegin/jest-cheat-sheet)
