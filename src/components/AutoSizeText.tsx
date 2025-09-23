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
  minFontSize = 6, 
  maxFontSize = 100,
  className = '' 
}: AutoSizeTextProps) {
  const [fontSize, setFontSize] = useState(minFontSize);
  const measureRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!measureRef.current || !text) return;

    const calculateOptimalFontSize = () => {
      const measurer = measureRef.current!;
      let optimalSize = minFontSize;
      
      // Start from max and work down to find largest size that fits
      for (let size = maxFontSize; size >= minFontSize; size--) {
        measurer.style.fontSize = `${size}px`;
        measurer.style.lineHeight = '1.1';
        measurer.textContent = text;
        
        const rect = measurer.getBoundingClientRect();
        
        // Add small padding to ensure text doesn't touch edges
        const paddingX = 4;
        const paddingY = 2;
        
        if (rect.width <= (width - paddingX) && rect.height <= (height - paddingY)) {
          optimalSize = size;
          break;
        }
      }
      
      return optimalSize;
    };

    const optimalSize = calculateOptimalFontSize();
    setFontSize(optimalSize);
  }, [text, width, height, minFontSize, maxFontSize]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full flex items-center justify-center text-center overflow-hidden ${className}`}
      style={{
        width: `${width}px`,
        height: `${height}px`,
      }}
    >
      {/* Invisible measurer element */}
      <div
        ref={measureRef}
        className="absolute opacity-0 pointer-events-none whitespace-nowrap font-medium"
        style={{
          fontSize: `${fontSize}px`,
          lineHeight: '1.1',
          top: '-1000px'
        }}
      />
      
      {/* Actual displayed text */}
      <div
        className="font-medium leading-tight px-1"
        style={{
          fontSize: `${fontSize}px`,
          lineHeight: '1.1',
          wordBreak: 'break-word',
          hyphens: 'auto'
        }}
      >
        {text}
      </div>
    </div>
  );
}