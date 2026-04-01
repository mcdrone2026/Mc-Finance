import type {Metadata} from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Mc Finance',
  description: 'Aplicativo de finanças pessoais para controle de receitas, despesas e divisões de custos.',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="pt-BR">
      <body className={inter.className} suppressHydrationWarning>{children}</body>
    </html>
  );
}
