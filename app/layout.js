import "./globals.css";
import "./modules.css";
import "./admin.css";
import "./public-booking.css";
import "./settings.css";
import GlobalNotice from "./_components/GlobalNotice";
export const metadata={metadataBase:new URL("https://beautytix.3ruptix.com"),title:"BeautyTix | by Ruptix",description:"BeautyTix by Ruptix — gestão completa para salões, estética e negócios de beleza: agenda, clientes, vendas, equipe e presença digital."};
export default function RootLayout({children}){return <html lang="pt-BR"><body>{children}<GlobalNotice/></body></html>}
