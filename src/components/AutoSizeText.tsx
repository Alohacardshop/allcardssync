import React, { useEffect, useRef, useState } from 'react';

interface AutoSizeTextProps {
  text: string;
  width: number;
  height: number;
  minFontSize?: number;
  maxFontSize?: number;
  className?: string;
}

export function AutoSizeText({ 
  text, 
  width, 
  height, 
  minFontSize = 8, 
  maxFontSize = 72,
  className = '' 
}: AutoSizeTextProps) {
  const [fontSize, setFontSize] = useState(minFontSize);
  const textRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!textRef.current) return;

    const calculateOptimalFontSize = () => {
      const element = textRef.current!;
      let low = minFontSize;
      let high = maxFontSize;
      let bestSize = minFontSize;

      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        element.style.fontSize = `${mid}px`;
        
        const rect = element.getBoundingClientRect();
        
        if (rect.width <= width && rect.height <= height) {
          bestSize = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }

      return bestSize;
    };

    const optimalSize = calculateOptimalFontSize();
    setFontSize(optimalSize);
  }, [text, width, height, minFontSize, maxFontSize]);

  return (
    <div
      ref={textRef}
      className={`flex items-center justify-center text-center font-medium leading-tight overflow-hidden ${className}`}
      style={{
        fontSize: `${fontSize}px`,
        width: `${width}px`,
        height: `${height}px`,
        lineHeight: '0.9'
      }}
    >
      {text}
    </div>
  );
}