import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'VA Chat Service API',
  description: 'API Backend for VA Chat Service',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}
