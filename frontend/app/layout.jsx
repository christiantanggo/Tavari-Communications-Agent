import './globals.css';

export const metadata = {
  title: 'Tavari AI Phone Agent',
  description: 'Self-serve AI phone answering service',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

