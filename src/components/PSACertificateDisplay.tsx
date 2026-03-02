import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PSACertificateData, PSA_GRADE_COLORS } from "@/types/psa";
import { ExternalLink, Shield, Calendar, Trophy, User, Hash, Tag, Globe, BookOpen, FileText } from "lucide-react";
import { formatGrade } from "@/lib/labelData";
import noImagePlaceholder from "@/assets/no-image-available.png";

interface PSACertificateDisplayProps {
  psaData: PSACertificateData;
  className?: string;
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

  const gradeColor = PSA_GRADE_COLORS[psaData.grade || ''] || 'hsl(var(--muted))';
  
  const handleImageError = (index: number) => {
    setImageErrors(prev => ({ ...prev, [index]: true }));
  };

  // Build image list
  const images: string[] = [];
  if (psaData.imageUrls && psaData.imageUrls.length > 0) {
    images.push(...psaData.imageUrls);
  } else if (psaData.imageUrl) {
    images.push(psaData.imageUrl);
  }

  return (
    <Card className={`p-4 border-success bg-success/5 ${className || ''}`}>
      <div className="space-y-3">
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

        {/* Grade Badge */}
        {psaData.grade && (
          <div className="flex flex-col items-center gap-1">
            <Badge 
              style={{ 
                backgroundColor: '#dc2626', 
                color: 'white' 
              }}
              className="font-bold text-lg px-4 py-2"
            >
              <Trophy className="h-4 w-4 mr-2" />
              {psaData.gradeLabel 
                ? psaData.gradeLabel.replace(/(\d+)\.0\b/g, '$1')
                : `Grade ${formatGrade(psaData.grade)}`}
            </Badge>
          </div>
        )}

        {/* Title / Card Name */}
        {(psaData.subject || psaData.brandTitle) && (
          <div className="text-center">
            <h3 className="font-bold text-base">
              {[psaData.brandTitle, psaData.subject, psaData.cardNumber && `#${psaData.cardNumber}`, psaData.year].filter(Boolean).join(' ')}
            </h3>
          </div>
        )}

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

        {/* Certificate Number */}
        <div className="flex justify-center">
          <div className="flex items-center gap-2">
            <Hash className="h-4 w-4 text-muted-foreground" />
            <span className="font-mono text-lg font-medium">{psaData.certNumber}</span>
          </div>
        </div>

        {/* Card Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          {psaData.subject && (
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <div>
                <span className="text-muted-foreground">Name: </span>
                <span className="font-medium">{psaData.subject}</span>
              </div>
            </div>
          )}

          {psaData.cardNumber && (
            <div className="flex items-center gap-2">
              <Hash className="h-4 w-4 text-muted-foreground" />
              <div>
                <span className="text-muted-foreground">{isComic ? 'Volume #' : 'Card #'}: </span>
                <span className="font-medium font-mono">{psaData.cardNumber}</span>
              </div>
            </div>
          )}

          {psaData.publicationDate && (
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <div>
                <span className="text-muted-foreground">Publication Date: </span>
                <span className="font-medium">{psaData.publicationDate}</span>
              </div>
            </div>
          )}

          {psaData.year && !psaData.publicationDate && (
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <div>
                <span className="text-muted-foreground">Year: </span>
                <span className="font-medium">{psaData.year}</span>
              </div>
            </div>
          )}

          {psaData.brandTitle && (
            <div className="flex items-center gap-2">
              <Tag className="h-4 w-4 text-muted-foreground" />
              <div>
                <span className="text-muted-foreground">{isComic ? 'Publisher' : 'Brand'}: </span>
                <span className="font-medium">{psaData.brandTitle}</span>
              </div>
            </div>
          )}

          {psaData.language && (
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <div>
                <span className="text-muted-foreground">Language: </span>
                <span className="font-medium uppercase">{psaData.language}</span>
              </div>
            </div>
          )}

          {psaData.country && (
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <div>
                <span className="text-muted-foreground">Country: </span>
                <span className="font-medium uppercase">{psaData.country}</span>
              </div>
            </div>
          )}

          {psaData.pageQuality && (
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              <div>
                <span className="text-muted-foreground">Page Quality: </span>
                <span className="font-medium capitalize">{psaData.pageQuality}</span>
              </div>
            </div>
          )}

          {psaData.category && (
            <div className="flex items-center gap-2">
              <Tag className="h-4 w-4 text-muted-foreground" />
              <div>
                <span className="text-muted-foreground">Category: </span>
                <span className="font-medium">{psaData.category}</span>
              </div>
            </div>
          )}

          {psaData.gameSport && (
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-muted-foreground" />
              <div>
                <span className="text-muted-foreground">Game: </span>
                <span className="font-medium capitalize">{psaData.gameSport}</span>
              </div>
            </div>
          )}
        </div>

        {psaData.varietyPedigree && (
          <div className="text-sm text-center">
            <span className="text-muted-foreground">Variety: </span>
            <span className="font-medium">{psaData.varietyPedigree}</span>
          </div>
        )}

        {psaData.graderNotes && (
          <div className="text-sm p-2 rounded bg-muted/50">
            <div className="flex items-center gap-1 text-muted-foreground mb-1">
              <FileText className="h-3 w-3" />
              <span className="font-medium">Grader Notes</span>
            </div>
            <p>{psaData.graderNotes}</p>
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
