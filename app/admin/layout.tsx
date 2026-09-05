import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'SLearn Admin',
  description: 'SLearn administration portal.',
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
