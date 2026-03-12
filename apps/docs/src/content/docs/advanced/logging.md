---
title: Logging
description: Configure SDK logging output — levels, custom loggers, and debug mode.
order: 8
---

### Enabling logging

Logging is disabled by default. Enable it through the `logging` option when creating a `CompositeVoice` instance:

```typescript
import { CompositeVoice } from '@lukeocodes/composite-voice';

const agent = new CompositeVoice({
  providers: [/* ...your providers */],
  logging: {
    enabled: true,
    level: 'info',
  },
});
```

### LoggingConfig reference

| Option    | Type       | Default   | Description                                                                 |
|-----------|------------|-----------|-----------------------------------------------------------------------------|
| `enabled` | `boolean`  | `false`   | Whether the SDK emits log messages.                                         |
| `level`   | `string`   | `'info'`  | Minimum severity to output: `'debug'`, `'info'`, `'warn'`, or `'error'`.    |
| `logger`  | `function` | *none*    | Custom logger function. When provided, replaces `console` output entirely.  |

The defaults are exported as `DEFAULT_LOGGING_CONFIG`:

```typescript
{
  enabled: false,
  level: 'info',
}
```

### Log levels

Levels are ordered by increasing severity. Messages below the configured level are suppressed.

| Level     | Output method    | Use case                                           |
|-----------|------------------|----------------------------------------------------|
| `'debug'` | `console.debug` | Detailed internal state, audio metadata, queue sizes |
| `'info'`  | `console.info`  | Lifecycle events (capture started, playback ended)  |
| `'warn'`  | `console.warn`  | Unexpected but non-fatal conditions                 |
| `'error'` | `console.error` | Failures that affect operation                      |

Setting the level to `'warn'` suppresses `debug` and `info` messages. Setting it to `'debug'` outputs everything.

### Log message format

Every log message follows this format:

```
[2026-02-26T14:30:00.000Z] [INFO] [CompositeVoice:AudioCapture] Audio capture started
```

The context label identifies the SDK component that produced the message. Internal components create child loggers with colon-separated names (e.g., `CompositeVoice:AudioCapture`, `CompositeVoice:AudioPlayer`, `CompositeVoice:DeepgramTTS`).

### Debug logging for development

During development, set the level to `'debug'` to see the full internal trace -- audio chunk sizes, buffer durations, metadata updates, state transitions, and provider lifecycle events:

```typescript
const agent = new CompositeVoice({
  providers: [/* ...your providers */],
  logging: {
    enabled: true,
    level: 'debug',
  },
});
```

This outputs messages from every SDK subsystem to the browser console. Disable debug logging in production to avoid console noise and potential performance overhead.

### Custom logger function

The `logger` option accepts a function with this signature:

```typescript
(level: string, message: string, ...args: unknown[]) => void
```

When provided, the SDK calls this function instead of `console.debug`, `console.info`, `console.warn`, or `console.error`. The `level` parameter is one of `'debug'`, `'info'`, `'warn'`, or `'error'`. The `message` parameter contains the pre-formatted string (with timestamp, level, and context). The `args` parameter carries any additional data associated with the log entry (objects, error instances, etc.).

### Structured logging

Route SDK logs into a structured logging library by mapping the level and parsing or forwarding the message:

```typescript
import { CompositeVoice } from '@lukeocodes/composite-voice';
import pino from 'pino';

const log = pino({ level: 'debug' });

const agent = new CompositeVoice({
  providers: [/* ...your providers */],
  logging: {
    enabled: true,
    level: 'debug',
    logger: (level, message, ...args) => {
      const data = args.length > 0 ? { detail: args } : {};
      log[level === 'debug' ? 'debug' : level]({ ...data, sdk: 'composite-voice' }, message);
    },
  },
});
```

### Remote logging service

Forward SDK logs to an external service for production observability:

```typescript
const agent = new CompositeVoice({
  providers: [/* ...your providers */],
  logging: {
    enabled: true,
    level: 'warn', // only capture warnings and errors in production
    logger: (level, message, ...args) => {
      fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          level,
          message,
          data: args,
          timestamp: new Date().toISOString(),
          source: 'composite-voice',
        }),
      }).catch(() => {
        // silently drop logging failures
      });
    },
  },
});
```

### Combining with application logging

A common pattern is to wrap SDK logging into your application's existing logger and add your own application-level logs alongside it:

```typescript
import { CompositeVoice } from '@lukeocodes/composite-voice';

function createSDKLogger() {
  return (level: string, message: string, ...args: unknown[]) => {
    const entry = {
      level,
      message,
      args: args.length > 0 ? args : undefined,
      service: 'voice-agent',
    };

    if (level === 'error') {
      console.error(JSON.stringify(entry));
    } else if (level === 'warn') {
      console.warn(JSON.stringify(entry));
    } else {
      console.log(JSON.stringify(entry));
    }
  };
}

const agent = new CompositeVoice({
  providers: [/* ...your providers */],
  logging: {
    enabled: true,
    level: 'info',
    logger: createSDKLogger(),
  },
});
```
