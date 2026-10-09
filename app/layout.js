import "./globals.css";
import "./modules.css";
import "./admin.css";
import "./booking-flow.css";
import "./settings.css";
import "./sidebar-motion.css";
import "./corporate-glass.css";
import "./legal.css";
import "./finance.css";
import "./dashboard-home.css";
import GlobalNotice from "./_components/GlobalNotice";

export const metadata={
 title:"Ruptix | RupControl",
 description:"RupControl by Ruptix — gestão completa para todo tipo de negócio: agenda, clientes, vendas, equipe e presença digital.",
 applicationName:"Ruptix",
 manifest:"/manifest.webmanifest",
 icons:{
  icon:[{url:"/ruptix-icon.svg",type:"image/svg+xml"}],
  shortcut:[{url:"/ruptix-icon.svg",type:"image/svg+xml"}],
  apple:[{url:"/ruptix-icon.svg",type:"image/svg+xml"}]
 }
};

export const viewport={themeColor:"#dadadd"};

export default function RootLayout({children}){
 return <html lang="pt-BR"><body>{children}<GlobalNotice/></body></html>
}
