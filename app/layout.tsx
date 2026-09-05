import type { Metadata } from 'next';
import { Montserrat } from 'next/font/google';
import { Toaster } from '@/components/ui/toast';
import './globals.css';

const montserrat = Montserrat({
  variable: '--font-montserrat',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'SLearn — Learn Your Way',
  description: 'A focused learning space for teachers and students.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-MY" suppressHydrationWarning>
      <body
        className={`${montserrat.variable} antialiased`}
        suppressHydrationWarning
      >
        {children}
        <Toaster limit={4} />
      </body>
    </html>
  );
}

