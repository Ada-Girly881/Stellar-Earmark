import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from './providers';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';

export const metadata: Metadata = {
  title: 'Earmark — Send money home, with strings attached',
  description:
    'Conditional remittances on Stellar. Attach conditions, stream support over time, or route funds straight to a verified school, clinic or landlord — settled in real USDC.',
  keywords: ['Stellar', 'Soroban', 'remittances', 'USDC', 'escrow', 'streaming', 'Earmark'],
  openGraph: {
    title: 'Earmark',
    description: 'Conditional remittances on Stellar, settled in USDC.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#070b12',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col antialiased">
        <Providers>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
