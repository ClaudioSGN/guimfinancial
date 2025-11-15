"use client";

import { useEffect } from "react";

export function PwaRegister() {
    useEffect(() => {
        if (
            typeof window === "undefined" ||
            !("serviceWorker" in navigator)
        ) {
            return;
        }

        if (process.env.NODE_ENV !== "production") {
            return;
        }

        const register = async () => {
            try {
                await navigator.serviceWorker.register("/sw.js");
            } catch (err) {
                console.error("Erro ao registrar o service worker", err);
            }
        };

        register();
    }, []);

    return null;
}