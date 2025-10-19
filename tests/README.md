# Test Suite

Comprehensive test coverage for CompositeVoice SDK.

## Test Structure

```
tests/
├── unit/                          # Unit tests
│   ├── core/
│   │   ├── audio/                 # Audio capture/playback tests
│   │   ├── events/                # Event system tests
│   │   └── state/                 # State machine tests
│   ├── providers/
│   │   └── base/                  # Base provider tests
│   └── utils/                     # Utility tests
├── integration/                   # Integration tests
├── mocks/                         # Mock implementations
├── __snapshots__/                 # Jest snapshots
├── setup.ts                       # Test setup
└── README.md                      # This file
```

## Running Tests

### All Tests

```bash
pnpm test
```

### Watch Mode

```bash
pnpm test:watch
```

### Coverage Report

```bash
pnpm test:coverage
```

### Specific Test File

```bash
pnpm test errors.test
```

### Integration Tests Only

```bash
pnpm test integration
```

## Test Coverage

### Core Functionality (✅ Complete)

#### Utils

- **errors.test.ts** - All custom error classes
- **logger.test.ts** - Logger with levels and filtering
- **websocket.test.ts** - WebSocket manager with reconnection
- **audio.test.ts** - Audio processing utilities

#### Core

- **EventEmitter.test.ts** - Type-safe event system
- **EventEmitter.snapshot.test.ts** - Event structure snapshots
- **AgentState.test.ts** - State machine and transitions
- **AudioCapture.test.ts** - Microphone capture
- **AudioPlayer.test.ts** - Audio playback (pending)

#### Providers

- **BaseProvider.test.ts** - Base provider implementation
- **BaseSTTProvider.test.ts** - STT provider base (pending)
- **BaseLLMProvider.test.ts** - LLM provider base (pending)
- **BaseTTSProvider.test.ts** - TTS provider base (pending)
- **NativeSTT.test.ts** - Native browser STT (pending)
- **NativeTTS.test.ts** - Native browser TTS (pending)

#### Integration

- **composite-mode.test.ts** - Composite mode end-to-end
- **all-in-one-mode.test.ts** - All-in-one mode (pending)

## Test Patterns

### Unit Tests

Test individual components in isolation:

```typescript
describe('ComponentName', () => {
  let component: ComponentName;

  beforeEach(() => {
    component = new ComponentName();
  });

  afterEach(() => {
    // Cleanup
  });

  describe('method', () => {
    it('should do something', () => {
      const result = component.method();
      expect(result).toBe(expected);
    });
  });
});
```

### Integration Tests

Test multiple components working together:

```typescript
describe('Feature Integration', () => {
  it('should work end-to-end', async () => {
    const agent = new CompositeVoice({
      // ... config
    });

    await agent.initialize();

    // Test interactions

    await agent.dispose();
  });
});
```

### Snapshot Tests

Capture and validate structure:

```typescript
it('should match structure snapshot', () => {
  const data = createComplexData();
  expect(data).toMatchSnapshot();
});
```

## Mocking

### Browser APIs

Browser APIs are mocked in `setup.ts`:

- AudioContext
- MediaStream
- getUserMedia
- Speech Recognition
- Speech Synthesis
- WebSocket

### Custom Mocks

Create mocks in `tests/mocks/`:

```typescript
// tests/mocks/MockProvider.ts
export class MockLLMProvider implements LLMProvider {
  // Implementation
}
```

## Coverage Goals

| Category   | Target | Current |
| ---------- | ------ | ------- |
| Statements | 80%    | -       |
| Branches   | 80%    | -       |
| Functions  | 80%    | -       |
| Lines      | 80%    | -       |

## Writing Tests

### Best Practices

1. **Test behavior, not implementation**

   ```typescript
   // Good
   it('should emit event when state changes', () => {
     agent.setReady();
     expect(listener).toHaveBeenCalledWith('ready');
   });

   // Bad
   it('should set internal state property', () => {
     agent.setReady();
     expect(agent['_state']).toBe('ready');
   });
   ```

2. **Use descriptive test names**

   ```typescript
   // Good
   it('should throw error when provider fails to initialize', () => {});

   // Bad
   it('should error', () => {});
   ```

3. **Test error cases**

   ```typescript
   it('should handle network errors gracefully', async () => {
     mockFetch.mockRejectedValueOnce(new Error('Network error'));

     await expect(provider.connect()).rejects.toThrow();
     expect(provider.getState()).toBe('error');
   });
   ```

4. **Clean up resources**

   ```typescript
   afterEach(async () => {
     await agent.dispose();
     jest.clearAllMocks();
   });
   ```

5. **Test async code properly**
   ```typescript
   it('should complete async operation', async () => {
     await expect(asyncOperation()).resolves.toBe(value);
   });
   ```

### Test Organization

Group related tests:

```typescript
describe('ComponentName', () => {
  describe('initialization', () => {
    // Init tests
  });

  describe('method', () => {
    it('should handle normal case', () => {});
    it('should handle edge case', () => {});
    it('should handle error case', () => {});
  });

  describe('disposal', () => {
    // Cleanup tests
  });
});
```

## Debugging Tests

### Run specific test

```bash
pnpm test -t "test name pattern"
```

### Run with debugger

```bash
node --inspect-brk node_modules/.bin/jest --runInBand
```

### Verbose output

```bash
pnpm test --verbose
```

### Update snapshots

```bash
pnpm test -u
```

## Continuous Integration

Tests run automatically on:

- Pull requests
- Push to main branch
- Pre-publish

### CI Configuration

```yaml
# .github/workflows/test.yml
- run: pnpm install
- run: pnpm test:coverage
- run: pnpm run lint
- run: pnpm run type-check
```

## Common Issues

### "Cannot find module"

```bash
# Rebuild the package
pnpm run build
```

### "Timeout exceeded"

Increase timeout for slow tests:

```typescript
it('should complete slow operation', async () => {
  // Test code
}, 10000); // 10 second timeout
```

### "Memory leak detected"

Clean up resources:

```typescript
afterEach(() => {
  jest.clearAllMocks();
  jest.clearAllTimers();
});
```

## Contributing Tests

When adding new features:

1. Write tests first (TDD)
2. Ensure 80%+ coverage
3. Include unit + integration tests
4. Test happy path + error cases
5. Update this README if needed

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Testing Library](https://testing-library.com/)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)
