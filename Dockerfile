FROM node:20-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Install Claude Code globally
RUN npm install -g @anthropic-ai/claude-code

# Create non-root user for safety
RUN groupadd -r claude && useradd -r -g claude -m -s /bin/bash claude

# Set up working directory
WORKDIR /workspace

# Copy project files (used for initial install; volume mount overrides at runtime)
COPY --chown=claude:claude . .

# Install dependencies as root (before switching user) so native builds work
RUN pnpm install --frozen-lockfile || pnpm install

# Set ownership
RUN chown -R claude:claude /workspace

# Switch to non-root user
USER claude

# Configure Claude Code to accept permissions inside container
RUN mkdir -p /home/claude/.claude && \
    echo '{"permissions":{"allow":[],"deny":[]},"autoUpdaterStatus":"disabled"}' \
    > /home/claude/.claude/settings.json

# Set entrypoint to Claude Code with --dangerously-skip-permissions
ENTRYPOINT ["claude", "--dangerously-skip-permissions"]
