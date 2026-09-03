/**
 * Editor.dc.html's own `.float-chrome` class, ported once:
 *
 *   .float-chrome { border: 1px solid var(--color-border);
 *                   background: rgba(255,255,255,.86);
 *                   box-shadow: var(--shadow-card);
 *                   backdrop-filter: blur(6px); }
 *
 * The design applies it to each floating canvas control INDIVIDUALLY (the tab
 * cluster, the size cluster, the details toggle, Exportar, the zoom cluster,
 * the status pill) sitting on a transparent positioning row -- not to one bar
 * spanning the canvas. Kept as a shared constant rather than a `components/ui`
 * variant because it is this screen's canvas chrome, not a general primitive,
 * and duplicating the string is exactly how the six chips would drift apart.
 */
/** Border + shadow + blur only. Exportar keeps its olive fill (the design
 *  gives that one chip `.float-chrome` AND `background: var(--color-olive)`),
 *  so it takes the edge without the translucent white. */
export const FLOAT_CHROME_EDGE =
  "border-border shadow-card border backdrop-blur-sm";

export const FLOAT_CHROME = `${FLOAT_CHROME_EDGE} bg-surface/86`;
