import './globals.css';

export const metadata = {
  title: 'Vitto Loan Repayment Service - MSME Lending',
  description: 'Enterprise MSME Loan Repayment Schedule and Payment Allocation Platform',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <div className="ambient-glow" />
        {children}
      </body>
    </html>
  );
}
