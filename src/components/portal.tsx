"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/** Renders children into <body>, so position:fixed overlays are never trapped by a transformed/animated ancestor. */
export function Portal({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return ready ? createPortal(children, document.body) : null;
}
