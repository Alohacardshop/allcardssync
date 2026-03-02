import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PSACertificateData, PSA_GRADE_COLORS } from "@/types/psa";
import { ExternalLink, Shield } from "lucide-react";
import { formatGrade } from "@/lib/labelData";
import noImagePlaceholder from "@/assets/no-image-available.png";

interface PSACertificateDisplayProps {
  psaData: PSACertificateData;
  className?: string;
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex border-b border-border/50 py-2.5">
      <span className="text-muted-foreground w-40 shrink-0 text-sm">{label}</span>
      <span className={`font-semibold text-sm ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

export function PSACertificateDisplay({ psaData, className }: PSACertificateDisplayProps) {
  const [imageErrors, setImageErrors] = useState<Record<number, boolean>>({});
  
  const isComic = psaData.category?.toUpperCase().includes('COMIC') ?? false;

  if (!psaData.isValid) {
    return (
      <Card className={`p-4 border-destructive bg-destructive/5 ${className || ''}`}>
        <div className="flex items-center gap-2 text-destructive">
          <Shield className="h-5 w-5" />
          <span className="font-medium">Invalid PSA Certificate</span>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Certificate #{psaData.certNumber} could not be verified
        </p>
      </Card>
    );
  }

  const handleImageError = (index: number) => {
    setImageErrors(prev => ({ ...prev, [index]: true }));
  };

  const images: string[] = [];
  if (psaData.imageUrls && psaData.imageUrls.length > 0) {
    images.push(...psaData.imageUrls);
  } else if (psaData.imageUrl) {
    images.push(psaData.imageUrl);
  }

  const gradeDisplay = psaData.gradeLabel 
    ? psaData.gradeLabel.replace(/(\d+)\.0\b/g, '$1')
    : psaData.grade ? `Grade ${formatGrade(psaData.grade)}` : null;

  return (
    <Card className={`p-5 ${className || ''}`}>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-success" />
            <span className="font-semibold text-success">PSA Verified</span>
          </div>
          <Badge variant="outline" className="text-xs">
            {psaData.source === 'database_cache' ? 'Cached' : 'Fresh'}
          </Badge>
        </div>

        {/* Images */}
        <div className={`flex justify-center ${images.length >= 2 ? 'gap-2' : ''}`}>
          {images.length >= 2 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 w-full">
              {images.slice(0, 2).map((url, i) => (
                <img
                  key={i}
                  src={imageErrors[i] ? noImagePlaceholder : url}
                  alt={`PSA Certificate ${psaData.certNumber} - ${i === 0 ? 'Front' : 'Back'}`}
                  className="w-full h-auto rounded border max-h-80 object-contain"
                  onError={() => handleImageError(i)}
                />
              ))}
            </div>
          ) : (
            <img 
              src={imageErrors[0] || images.length === 0 ? noImagePlaceholder : images[0]}
              alt={`PSA Certificate ${psaData.certNumber}`}
              className="max-w-full h-auto rounded border max-h-80 object-contain"
              onError={() => handleImageError(0)}
            />
          )}
        </div>

        {/* Item Information - Table Layout */}
        <div>
          <h3 className="font-semibold text-base mb-2 text-foreground">Item Information</h3>
          <div className="flex flex-col">
            <InfoRow label="Cert Number" value={psaData.certNumber} mono />
            <InfoRow label="SKU / Barcode" value={psaData.certNumber} mono />
            {gradeDisplay && <InfoRow label="Item Grade" value={gradeDisplay} />}
            {psaData.subject && <InfoRow label="Name" value={psaData.subject} />}
            {psaData.cardNumber && (
              <InfoRow label={isComic ? "Volume Number" : "Card Number"} value={psaData.cardNumber} />
            )}
            {psaData.publicationDate && <InfoRow label="Publication Date" value={psaData.publicationDate} />}
            {psaData.year && !psaData.publicationDate && <InfoRow label="Year" value={psaData.year} />}
            {psaData.brandTitle && (
              <InfoRow label={isComic ? "Publisher" : "Brand"} value={psaData.brandTitle} />
            )}
            {psaData.varietyPedigree && <InfoRow label="Variant" value={psaData.varietyPedigree} />}
            {psaData.language && <InfoRow label="Language" value={psaData.language.toUpperCase()} />}
            {psaData.country && <InfoRow label="Country" value={psaData.country.toUpperCase()} />}
            {psaData.pageQuality && <InfoRow label="Page Quality" value={psaData.pageQuality.toUpperCase()} />}
            {psaData.category && <InfoRow label="Category" value={psaData.category} />}
            {psaData.gameSport && <InfoRow label="Game / Sport" value={psaData.gameSport} />}
          </div>
        </div>

        {/* Grader Notes */}
        {psaData.graderNotes && (
          <div className="text-sm p-2 rounded bg-muted/50">
            <span className="font-medium text-muted-foreground">Grader Notes: </span>
            <span>{psaData.graderNotes}</span>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t">
          <a
            href={psaData.psaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            View on PSA
          </a>
          {psaData.diagnostics?.totalMs && (
            <span className="text-xs text-muted-foreground">
              {psaData.diagnostics.totalMs}ms
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}
