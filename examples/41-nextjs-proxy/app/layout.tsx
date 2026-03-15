export const metadata = {
  title: 'CompositeVoice — 41 Next.js Proxy',
  description: 'Next.js App Router proxy with createNextJsProxy and security config',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
