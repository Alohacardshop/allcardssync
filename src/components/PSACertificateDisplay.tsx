import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PSACertificateData, PSA_GRADE_COLORS } from "@/types/psa";
import { ExternalLink, Shield, Calendar, Trophy, User, Hash, Tag } from "lucide-react";

interface PSACertificateDisplayProps {
  psaData: PSACertificateData;
  className?: string;
}

export function PSACertificateDisplay({ psaData, className }: PSACertificateDisplayProps) {
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
          <div className="flex justify-center">
            <Badge 
              style={{ backgroundColor: gradeColor, color: 'white' }}
              className="font-bold text-lg px-4 py-2"
            >
              <Trophy className="h-4 w-4 mr-2" />
              Grade {psaData.grade}
            </Badge>
          </div>
        )}

        {/* Image */}
        {psaData.imageUrl && (
          <div className="flex justify-center">
            <img 
              src={psaData.imageUrl} 
              alt={`PSA Certificate ${psaData.certNumber}`}
              className="max-w-full h-auto rounded border max-h-80 object-contain"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
              }}
            />
          </div>
        )}

        {/* Certificate Number */}
        <div className="flex justify-center">
          <div className="flex items-center gap-2">
            <Hash className="h-4 w-4 text-muted-foreground" />
            <span className="font-mono text-lg font-medium">{psaData.certNumber}</span>
          </div>
        </div>

        {/* Card Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          {psaData.brandTitle && (
            <div className="flex items-center gap-2">
              <Tag className="h-4 w-4 text-muted-foreground" />
              <div>
                <span className="text-muted-foreground">Brand: </span>
                <span className="font-medium">{psaData.brandTitle}</span>
              </div>
            </div>
          )}
          
          {psaData.subject && (
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <div>
                <span className="text-muted-foreground">Subject: </span>
                <span className="font-medium">{psaData.subject}</span>
              </div>
            </div>
          )}
          
          {psaData.year && (
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <div>
                <span className="text-muted-foreground">Year: </span>
                <span className="font-medium">{psaData.year}</span>
              </div>
            </div>
          )}
          
          {psaData.cardNumber && (
            <div className="flex items-center gap-2">
              <Hash className="h-4 w-4 text-muted-foreground" />
              <div>
                <span className="text-muted-foreground">Card #: </span>
                <span className="font-medium font-mono">{psaData.cardNumber}</span>
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