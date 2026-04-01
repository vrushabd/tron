import './globals.css';

export const metadata = {
  title: 'Tron USDT Claim',
  description: 'Tron USDT Claim',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta name="trustwallet-network" content="tron" />
      </head>
      <body>{children}</body>
    </html>
  );
}
