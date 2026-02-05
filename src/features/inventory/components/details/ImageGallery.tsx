import React from 'react';
import { ImageIcon } from 'lucide-react';

interface ImageGalleryProps {
  imageUrls?: string[] | Record<string, string> | null;
}

export const ImageGallery = React.memo(({ imageUrls }: ImageGalleryProps) => {
  // Normalize image URLs - could be array or object
  const images: string[] = React.useMemo(() => {
    if (!imageUrls) return [];
    if (Array.isArray(imageUrls)) return imageUrls;
    if (typeof imageUrls === 'object') return Object.values(imageUrls).filter(Boolean) as string[];
    return [];
  }, [imageUrls]);

  if (images.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 bg-muted/30 rounded-lg border-2 border-dashed border-muted">
        <ImageIcon className="h-10 w-10 text-muted-foreground/50 mb-2" />
        <p className="text-sm text-muted-foreground">No images available</p>
        <p className="text-xs text-muted-foreground/70 mt-0.5">Images will appear here when added</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Images</h3>
      <div className="grid grid-cols-2 gap-2">
        {images.slice(0, 4).map((url, index) => (
          <a
            key={index}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="relative aspect-square rounded-lg overflow-hidden bg-muted border hover:border-primary transition-colors"
          >
            <img
              src={url}
              alt={`Image ${index + 1}`}
              className="w-full h-full object-cover"
              loading="lazy"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </a>
        ))}
      </div>
      {images.length > 4 && (
        <p className="text-xs text-muted-foreground text-center">
          +{images.length - 4} more images
        </p>
      )}
    </div>
  );
});

ImageGallery.displayName = 'ImageGallery';
