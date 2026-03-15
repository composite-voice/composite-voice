import React from 'react';
import { Badge } from '@lukeocodes/composite-voice-ui';
// Each example must import its own styles.css that includes:
// @import "tailwindcss";
// @import "@lukeocodes/composite-voice-ui/theme.css";

interface ExampleShellProps {
  title: string;
  description?: string;
  number: string;
  children: React.ReactNode;
}

export function ExampleShell({ title, description, number, children }: ExampleShellProps) {
  return (
    <div style={{ minHeight: '100vh', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <header style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '16px 24px',
        borderBottom: '1px solid #e5e7eb',
      }}>
        <strong>CompositeVoice</strong>
        <Badge variant="neutral">{number}</Badge>
      </header>
      <main style={{ maxWidth: '56rem', margin: '0 auto', padding: '32px 16px' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '8px' }}>{title}</h1>
        {description && <p style={{ color: '#6b7280', marginBottom: '32px' }}>{description}</p>}
        {children}
      </main>
    </div>
  );
}
