import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "./styles/app.css";

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    let refreshing = false;
    let hadController = Boolean(navigator.serviceWorker.controller);

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      // Não recarrega na primeira instalação; recarrega quando uma versão substitui a ativa.
      if (!hadController) {
        hadController = true;
        return;
      }
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });

    void navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).then((registration) => {
      const checkForUpdate = () => {
        if (document.visibilityState === "visible" && navigator.onLine) {
          void registration.update().catch(() => undefined);
        }
      };

      // Confere ao abrir e sempre que o usuário retorna ao Safari/PWA.
      checkForUpdate();
      window.addEventListener("pageshow", checkForUpdate);
      window.addEventListener("focus", checkForUpdate);
      document.addEventListener("visibilitychange", checkForUpdate);

      registration.addEventListener("updatefound", () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          if (installing.state === "installed" && navigator.serviceWorker.controller) {
            // O novo worker usa skipWaiting/clients.claim e controllerchange cuida do reload.
            void registration.update().catch(() => undefined);
          }
        });
      });
    }).catch(() => undefined);
  }, { once: true });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode><App /></React.StrictMode>
);
