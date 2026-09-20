import "./globals.css";

export const metadata = {
  title: "Barber Flow",
  description: "Gestão completa para barbearias"
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
