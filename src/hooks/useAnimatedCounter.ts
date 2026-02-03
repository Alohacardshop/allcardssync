import { useState, useEffect, useRef } from 'react';

/**
 * A hook that animates a number counting up/down when it changes.
 * Similar to Stripe's dashboard number animations.
 * 
 * @param targetValue - The final value to animate to
 * @param duration - Animation duration in milliseconds (default: 500)
 * @param enabled - Whether animation is enabled (default: true)
 * @returns The current animated display value
 */
export function useAnimatedCounter(
  targetValue: number,
  duration: number = 500,
  enabled: boolean = true
): number {
  const [displayValue, setDisplayValue] = useState(0);
  const previousValue = useRef(0);
  const animationFrame = useRef<number>();

  useEffect(() => {
    if (!enabled || targetValue === previousValue.current) return;

    const startValue = previousValue.current;
    const diff = targetValue - startValue;
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing function for smooth deceleration (ease-out cubic)
      const easeOutCubic = 1 - Math.pow(1 - progress, 3);
      
      const currentValue = Math.round(startValue + diff * easeOutCubic);
      setDisplayValue(currentValue);

      if (progress < 1) {
        animationFrame.current = requestAnimationFrame(animate);
      } else {
        previousValue.current = targetValue;
      }
    };

    animationFrame.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrame.current) {
        cancelAnimationFrame(animationFrame.current);
      }
    };
  }, [targetValue, duration, enabled]);

  return displayValue;
}
