import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "CRM Comercial", template: "%s · CRM Comercial" },
  description: "Gestión comercial: prospección, clientes, visitas, pedidos y comisiones.",
  applicationName: "CRM Comercial",
  appleWebApp: { capable: true, title: "CRM", statusBarStyle: "default" },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f3" },
    { media: "(prefers-color-scheme: dark)", color: "#141516" },
  ],
};

// Aplica el tema guardado antes del primer pintado (preferencia visual no crítica)
const themeScript = `try{var t=localStorage.getItem("crm-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh">
        {children}
        <Toaster
          position="top-center"
          toastOptions={{
            classNames: {
              toast: "!rounded-xl !border-line !bg-paper !text-ink !shadow-pop !font-sans",
              description: "!text-ink-muted",
            },
          }}
        />
      </body>
    </html>
  );
}
