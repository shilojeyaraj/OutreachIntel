import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ColdReach Intel',
  description: 'AI-ranked LinkedIn outreach targets for internship referrals and coffee chats.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background font-sans text-slate-200 antialiased">{children}</body>
    </html>
  );
}
