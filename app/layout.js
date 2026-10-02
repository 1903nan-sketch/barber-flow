import "./globals.css";
import "./modules.css";
import "./admin.css";
import "./public-booking.css";
import "./settings.css";
import "./sidebar-motion.css";
import "./corporate-glass.css";
import GlobalNotice from "./_components/GlobalNotice";

export const metadata={
 title:"Ruptix | BarberTix",
 description:"BarberTix by Ruptix — gestão completa para barbearias: agenda, clientes, vendas, equipe e presença digital.",
 applicationName:"Ruptix",
 manifest:"/manifest.webmanifest",
 icons:{
  icon:[{url:"/ruptix-icon.svg",type:"image/svg+xml"}],
  shortcut:[{url:"/ruptix-icon.svg",type:"image/svg+xml"}],
  apple:[{url:"/ruptix-icon.svg",type:"image/svg+xml"}]
 }
};

export const viewport={themeColor:"#060c17"};

export default function RootLayout({children}){
 return <html lang="pt-BR"><body>{children}<GlobalNotice/></body></html>
}
