// Re-mounts on every navigation inside the app (the layout/shell does not), giving each page a short
// GPU-only enter: 220 ms opacity + translate. Reduced-motion users get it instantly (globals.css).
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="om-page">{children}</div>;
}
