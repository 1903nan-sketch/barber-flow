import "./globals.css";
import "./modules.css";
import "./admin.css";
import "./public-booking.css";
import "./settings.css";
import GlobalNotice from "./_components/GlobalNotice";
export const metadata={title:"Ruptix | BarberTix",description:"BarberTix by Ruptix — gestão completa para barbearias: agenda, clientes, vendas, equipe e presença digital."};
export default function RootLayout({children}){return <html lang="pt-BR"><body>{children}<GlobalNotice/></body></html>}
