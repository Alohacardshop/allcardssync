import { useEffect } from 'react';

/**
 * Temporary diagnostic tool to identify which element is actually receiving clicks.
 * Remove this after verifying the delete button is clickable.
 */
export default function OverlayDetector() {
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      console.log('[🎯 OverlayDetector] Element at click point:', {
        element: el,
        tagName: el?.tagName,
        className: el?.className,
        id: el?.id,
        dataset: (el as HTMLElement)?.dataset,
        ariaLabel: (el as HTMLElement)?.ariaLabel
      });
    };
    window.addEventListener('click', handler, true); // capture phase
    return () => window.removeEventListener('click', handler, true);
  }, []);
  
  return null;
}
