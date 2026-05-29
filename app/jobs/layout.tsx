import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Job Finder · ColdReach Intel',
  description:
    'Pull recent internship postings from LinkedIn via Apify and rank them against your CV with Claude.',
};

export default function JobsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
