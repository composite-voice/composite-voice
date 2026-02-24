export const metadata = {
  title: 'CompositeVoice — 11 Next.js Proxy',
  description: 'Next.js App Router proxy for CompositeVoice',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
