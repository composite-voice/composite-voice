# OpenAI LLM Provider

The OpenAI LLM provider integrates OpenAI's GPT models with CompositeVoice, enabling advanced language understanding and generation capabilities.

## Installation

The OpenAI SDK is a peer dependency and must be installed separately:

```bash
npm install openai
# or
pnpm add openai
# or
yarn add openai
```

## Basic Usage

```typescript
import { OpenAILLM } from '@lukeocodes/composite-voice/providers/llm';

const llm = new OpenAILLM({
  apiKey: 'your-openai-api-key',
  model: 'gpt-4',
  temperature: 0.7,
  maxTokens: 1000,
  systemPrompt: 'You are a helpful voice assistant.',
});

// Initialize the provider
await llm.initialize();

// Generate a response
const response = await llm.generate('What is the weather like?');

// Stream the response
for await (const chunk of response) {
  console.log(chunk);
}

// Clean up
await llm.dispose();
```

## Configuration Options

### Required Options

- **`apiKey`** (string): Your OpenAI API key
- **`model`** (string): The GPT model to use (e.g., `'gpt-4'`, `'gpt-3.5-turbo'`, `'gpt-4-turbo'`)

### Optional Options

- **`temperature`** (number, 0-2): Controls randomness. Higher values make output more random. Default: not set
- **`maxTokens`** (number): Maximum number of tokens to generate. Default: not set
- **`topP`** (number, 0-1): Nucleus sampling parameter. Default: not set
- **`systemPrompt`** (string): System message to guide the model's behavior
- **`stream`** (boolean): Enable streaming responses. Default: `true`
- **`stopSequences`** (string[]): Sequences where the API will stop generating
- **`organizationId`** (string): OpenAI organization ID (for organization accounts)
- **`baseURL`** (string): Custom API endpoint (for proxies or custom deployments)
- **`maxRetries`** (number): Maximum number of retries for failed requests. Default: `3`
- **`timeout`** (number): Request timeout in milliseconds. Default: `60000`
- **`debug`** (boolean): Enable debug logging. Default: `false`

## Advanced Usage

### Using with Conversation History

```typescript
const messages = [
  { role: 'system', content: 'You are a helpful assistant.' },
  { role: 'user', content: 'Hello!' },
  { role: 'assistant', content: 'Hi! How can I help you?' },
  { role: 'user', content: 'What is 2+2?' },
];

const response = await llm.generateFromMessages(messages);

for await (const chunk of response) {
  process.stdout.write(chunk);
}
```

### Non-Streaming Mode

```typescript
const llm = new OpenAILLM({
  apiKey: 'your-api-key',
  model: 'gpt-3.5-turbo',
  stream: false, // Disable streaming
});

await llm.initialize();

const response = await llm.generate('Tell me a joke');

// With streaming disabled, you get the complete response at once
for await (const text of response) {
  console.log(text); // Prints the full response
}
```

### Custom Options Per Request

```typescript
// Override configuration for specific requests
const response = await llm.generate('Write a haiku', {
  temperature: 0.9, // More creative
  maxTokens: 50,
  stopSequences: ['\n\n'],
});
```

### Using Extra OpenAI Parameters

```typescript
const response = await llm.generate('Generate a list', {
  extra: {
    presence_penalty: 0.6,
    frequency_penalty: 0.5,
    logit_bias: { '50256': -100 }, // Prevent specific tokens
    user: 'user-123', // Track usage per user
  },
});
```

### Integration with CompositeVoice

```typescript
import { CompositeVoice } from '@lukeocodes/composite-voice';
import { OpenAILLM } from '@lukeocodes/composite-voice/providers/llm';
import { NativeSTT } from '@lukeocodes/composite-voice/providers/stt';
import { NativeTTS } from '@lukeocodes/composite-voice/providers/tts';

const agent = new CompositeVoice({
  stt: new NativeSTT(),
  llm: new OpenAILLM({
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4',
    systemPrompt: 'You are a helpful voice assistant.',
  }),
  tts: new NativeTTS(),
});

await agent.initialize();
```

## Available Models

### GPT-4 Models

- **`gpt-4`**: Most capable, best for complex tasks
- **`gpt-4-turbo`**: Faster and cheaper than gpt-4
- **`gpt-4-turbo-preview`**: Latest preview version

### GPT-3.5 Models

- **`gpt-3.5-turbo`**: Fast and cost-effective for most tasks
- **`gpt-3.5-turbo-16k`**: Extended context window (16k tokens)

> **Note:** Model availability and pricing vary. Check [OpenAI's documentation](https://platform.openai.com/docs/models) for the latest information.

## Error Handling

```typescript
import { ProviderInitializationError } from '@lukeocodes/composite-voice';

try {
  await llm.initialize();
} catch (error) {
  if (error instanceof ProviderInitializationError) {
    console.error('Failed to initialize OpenAI provider:', error.message);
  }
}

// Handle generation errors
try {
  const response = await llm.generate('Hello');
  for await (const chunk of response) {
    console.log(chunk);
  }
} catch (error) {
  console.error('Generation failed:', error);
}
```

## Best Practices

### 1. Environment Variables

Store API keys securely:

```typescript
const llm = new OpenAILLM({
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4',
});
```

### 2. Token Management

Monitor token usage to control costs:

```typescript
const response = await llm.generate('Your prompt', {
  maxTokens: 500, // Limit response length
});
```

### 3. System Prompts

Use system prompts to guide behavior consistently:

```typescript
const llm = new OpenAILLM({
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4',
  systemPrompt: `You are a voice assistant. Keep responses concise and conversational.
Always speak in complete sentences.`,
});
```

### 4. Rate Limiting

Implement rate limiting for production:

```typescript
// Use a rate limiting library or implement custom logic
const responses = [];
for (const prompt of prompts) {
  const response = await llm.generate(prompt);
  responses.push(response);
  await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second
}
```

### 5. Proper Cleanup

Always dispose of providers when done:

```typescript
try {
  // Use the provider
  const response = await llm.generate('Hello');
  // ...
} finally {
  await llm.dispose();
}
```

## Browser Usage

The OpenAI SDK supports browser usage with the `dangerouslyAllowBrowser` flag (enabled by default in this provider):

```typescript
// Works in browsers!
const llm = new OpenAILLM({
  apiKey: 'your-api-key', // Consider using a backend proxy in production
  model: 'gpt-3.5-turbo',
});
```

> **Security Warning:** Don't expose API keys in client-side code in production. Use a backend proxy to protect your keys.

## Troubleshooting

### SDK Not Found Error

```
Error: Cannot find module 'openai'
```

**Solution:** Install the OpenAI SDK:

```bash
npm install openai
```

### API Key Errors

```
Error: 401 Unauthorized
```

**Solution:** Verify your API key is correct and has the necessary permissions.

### Rate Limit Errors

```
Error: 429 Too Many Requests
```

**Solution:** Implement rate limiting or upgrade your OpenAI plan.

### Timeout Errors

**Solution:** Increase the timeout value:

```typescript
const llm = new OpenAILLM({
  apiKey: 'your-api-key',
  model: 'gpt-4',
  timeout: 120000, // 2 minutes
});
```

## Related Documentation

- **[Getting Started](./Getting%20Started.md)** - Learn the basics of CompositeVoice
- **[Architecture](./Architecture.md)** - Understand the provider system
- **[Provider Implementation Guide](./Provider%20Implementation%20Guide.md)** - Create custom providers
- **[Examples](./Examples.md)** - See working examples
- **[OpenAI API Documentation](https://platform.openai.com/docs)** - Official OpenAI docs

## Performance Tips

1. **Use GPT-3.5 for Simple Tasks**: It's faster and cheaper than GPT-4
2. **Enable Streaming**: Provides better user experience with incremental responses
3. **Set maxTokens**: Prevents unnecessarily long (and expensive) responses
4. **Cache Responses**: Cache common queries to reduce API calls
5. **Batch Requests**: Group similar requests when possible

## Pricing Considerations

Token usage affects costs:

- **Input tokens**: Tokens in your prompts
- **Output tokens**: Tokens in the model's responses

Monitor usage:

```typescript
// Non-streaming mode provides token counts in metadata
// (requires custom implementation to capture)
```

Check [OpenAI's pricing page](https://openai.com/pricing) for current rates.
