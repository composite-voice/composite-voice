import React from 'react';
import {
  Navbar,
  BrandName,
  ThemeToggle,
  Badge,
  Alert,
} from '@lukeocodes/composite-voice-ui';
import '@lukeocodes/composite-voice-ui/theme.css';

interface ExampleShellProps {
  title: string;
  description?: string;
  number: string;
  children: React.ReactNode;
}

export function ExampleShell({ title, description, number, children }: ExampleShellProps) {
  return (
    <div className="min-h-screen bg-surface text-foreground">
      <Navbar>
        <BrandName />
        <Badge variant="neutral">{number}</Badge>
        <div style={{ marginLeft: 'auto' }}>
          <ThemeToggle />
        </div>
      </Navbar>
      <main className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-2">{title}</h1>
        {description && <p className="text-foreground-muted mb-8">{description}</p>}
        {children}
      </main>
    </div>
  );
}
