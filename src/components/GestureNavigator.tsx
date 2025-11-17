"use client";

import { usePathname, useRouter } from "next/navigation";
import React, { useRef, useState, TouchEvent } from "react";

const ROUTES = ["/", "/transactions", "/banks"];

// Config do gesto
const SWIPE_THRESHOLD = 60; // mínimo de px pra considerar swipe
const EDGE_THRESHOLD = 40;  // começar perto da borda
const MAX_VERTICAL_DRIFT = 50; // se arrastar muito pra cima/baixo, ignora

export function GestureNavigator({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const [isSwiping, setIsSwiping] = useState(false);

  function handleTouchStart(e: TouchEvent<HTMLDivElement>) {
    if (e.touches.length !== 1) return;

    const touch = e.touches[0];
    touchStartX.current = touch.clientX;
    touchStartY.current = touch.clientY;
    setIsSwiping(false);
  }

  function handleTouchMove(e: TouchEvent<HTMLDivElement>) {
    if (touchStartX.current == null || touchStartY.current == null) return;
    if (e.touches.length !== 1) return;

    const touch = e.touches[0];
    const deltaX = touch.clientX - touchStartX.current;
    const deltaY = touch.clientY - touchStartY.current;

    // Se começou no meio da tela, ignora (evita conflito com scroll normal)
    const startX = touchStartX.current;
    const width = window.innerWidth;
    const startedAtEdge =
      startX <= EDGE_THRESHOLD || startX >= width - EDGE_THRESHOLD;

    if (!startedAtEdge) {
      return;
    }

    // Se arrastar mais vertical que horizontal, ignora
    if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > MAX_VERTICAL_DRIFT) {
      return;
    }

    if (Math.abs(deltaX) > SWIPE_THRESHOLD) {
      setIsSwiping(true);
    }
  }

  function handleTouchEnd(e: TouchEvent<HTMLDivElement>) {
    if (
      touchStartX.current == null ||
      touchStartY.current == null ||
      !isSwiping
    ) {
      touchStartX.current = null;
      touchStartY.current = null;
      setIsSwiping(false);
      return;
    }

    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStartX.current;

    // reset
    touchStartX.current = null;
    touchStartY.current = null;
    setIsSwiping(false);

    // Descobre página atual
    const currentIndex = ROUTES.indexOf(pathname || "/");
    const safeIndex = currentIndex === -1 ? 0 : currentIndex;

    // Swipe para a esquerda → próxima rota
    if (deltaX < -SWIPE_THRESHOLD) {
      const nextIndex = safeIndex + 1;
      if (nextIndex < ROUTES.length) {
        router.push(ROUTES[nextIndex]);
      }
    }

    // Swipe para a direita → rota anterior
    if (deltaX > SWIPE_THRESHOLD) {
      const prevIndex = safeIndex - 1;
      if (prevIndex >= 0) {
        router.push(ROUTES[prevIndex]);
      }
    }
  }

  return (
    <div
      className="min-h-screen"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {children}
    </div>
  );
}
