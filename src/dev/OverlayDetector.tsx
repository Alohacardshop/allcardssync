import { useEffect } from 'react';

/**
 * Temporary diagnostic tool to identify which element is actually receiving clicks.
 * Shows the FULL element stack at the click point.
 * Remove this after verifying the delete button is clickable.
 */
export default function OverlayDetector() {
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const chain = document.elementsFromPoint(e.clientX, e.clientY);
      console.log('[🎯 OverlayDetector] elementsFromPoint →', chain);
      console.log('[🎯 OverlayDetector] First element (topmost):', {
        element: chain[0],
        tagName: chain[0]?.tagName,
        className: chain[0]?.className,
        id: chain[0]?.id,
        dataset: (chain[0] as HTMLElement)?.dataset,
        ariaLabel: (chain[0] as HTMLElement)?.ariaLabel
      });
    };
    window.addEventListener('click', handler, true); // capture phase
    return () => window.removeEventListener('click', handler, true);
  }, []);
  
  return null;
}
