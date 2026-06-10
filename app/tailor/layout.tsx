import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Tailor resume + cover letter',
  description: 'Tailor your LaTeX resume to a job and generate a cover letter.',
};

export default function TailorLayout({ children }: { children: React.ReactNode }) {
  return children;
}
