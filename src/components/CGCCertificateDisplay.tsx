import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ExternalLink, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CGCCertificateData, CGC_GRADE_COLORS } from '@/types/cgc';

interface CGCCertificateDisplayProps {
  cgcData: CGCCertificateData;
  className?: string;
}

export const CGCCertificateDisplay = ({ cgcData, className }: CGCCertificateDisplayProps) => {
  const [imageError, setImageError] = useState({ front: false, rear: false });

  if (!cgcData.isValid) {
    return (
      <Card className={className}>
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <CardTitle>Invalid Certificate</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Certificate #{cgcData.certNumber} was not found in the CGC database.
          </p>
        </CardContent>
      </Card>
    );
  }

  const gradeColor = CGC_GRADE_COLORS[cgcData.grade || ''] || 'hsl(var(--muted))';

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-success" />
            <CardTitle>CGC Certified</CardTitle>
          </div>
          {cgcData.grade && (
            <Badge 
              style={{ backgroundColor: gradeColor }}
              className="text-white font-bold text-lg px-4 py-1"
            >
              {cgcData.grade}
            </Badge>
          )}
        </div>
        <CardDescription>Certificate #{cgcData.certNumber}</CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Images */}
        {(cgcData.images?.front || cgcData.images?.rear) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {cgcData.images.front && !imageError.front && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Front Image</p>
                <img
                  src={cgcData.images.front}
                  alt="CGC Front"
                  className="w-full rounded-lg border"
                  onError={() => setImageError(prev => ({ ...prev, front: true }))}
                />
              </div>
            )}
            {cgcData.images.rear && !imageError.rear && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Rear Image</p>
                <img
                  src={cgcData.images.rear}
                  alt="CGC Rear"
                  className="w-full rounded-lg border"
                  onError={() => setImageError(prev => ({ ...prev, rear: true }))}
                />
              </div>
            )}
          </div>
        )}

        <Separator />

        {/* Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {cgcData.title && (
            <div>
              <p className="text-sm text-muted-foreground">Title</p>
              <p className="font-medium">{cgcData.title}</p>
            </div>
          )}

          {cgcData.issueNumber && (
            <div>
              <p className="text-sm text-muted-foreground">Issue #</p>
              <p className="font-medium">{cgcData.issueNumber}</p>
            </div>
          )}

          {cgcData.cardName && (
            <div>
              <p className="text-sm text-muted-foreground">Card Name</p>
              <p className="font-medium">{cgcData.cardName}</p>
            </div>
          )}

          {cgcData.cardNumber && (
            <div>
              <p className="text-sm text-muted-foreground">Card #</p>
              <p className="font-medium">{cgcData.cardNumber}</p>
            </div>
          )}

          {cgcData.setName && (
            <div>
              <p className="text-sm text-muted-foreground">Set Name</p>
              <p className="font-medium">{cgcData.setName}</p>
            </div>
          )}

          {cgcData.seriesName && (
            <div>
              <p className="text-sm text-muted-foreground">Series</p>
              <p className="font-medium">{cgcData.seriesName}</p>
            </div>
          )}

          {cgcData.label && (
            <div>
              <p className="text-sm text-muted-foreground">Label</p>
              <p className="font-medium">{cgcData.label}</p>
            </div>
          )}

          {cgcData.autographGrade && (
            <div>
              <p className="text-sm text-muted-foreground">Autograph Grade</p>
              <p className="font-medium">{cgcData.autographGrade}</p>
            </div>
          )}

          {cgcData.barcode && (
            <div>
              <p className="text-sm text-muted-foreground">Barcode</p>
              <p className="font-mono text-sm">{cgcData.barcode}</p>
            </div>
          )}
        </div>

        {/* Key Comments */}
        {cgcData.keyComments && (
          <>
            <Separator />
            <div>
              <p className="text-sm text-muted-foreground mb-1">Key Comments</p>
              <p className="text-sm">{cgcData.keyComments}</p>
            </div>
          </>
        )}

        {/* Grader Signatures */}
        {cgcData.graderSignatures && cgcData.graderSignatures.length > 0 && (
          <>
            <Separator />
            <div>
              <p className="text-sm text-muted-foreground mb-2">Grader Signatures</p>
              <div className="flex flex-wrap gap-2">
                {cgcData.graderSignatures.map((signature, index) => (
                  <Badge key={index} variant="outline">{signature}</Badge>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Population Report */}
        {cgcData.populationReport && (
          <>
            <Separator />
            <div>
              <p className="text-sm text-muted-foreground mb-2">Population Report</p>
              <div className="grid grid-cols-3 gap-4 text-center">
                {cgcData.populationReport.higherGrades !== undefined && (
                  <div>
                    <p className="text-2xl font-bold">{cgcData.populationReport.higherGrades}</p>
                    <p className="text-xs text-muted-foreground">Higher Grades</p>
                  </div>
                )}
                {cgcData.populationReport.sameGrade !== undefined && (
                  <div>
                    <p className="text-2xl font-bold">{cgcData.populationReport.sameGrade}</p>
                    <p className="text-xs text-muted-foreground">Same Grade</p>
                  </div>
                )}
                {cgcData.populationReport.totalGraded !== undefined && (
                  <div>
                    <p className="text-2xl font-bold">{cgcData.populationReport.totalGraded}</p>
                    <p className="text-xs text-muted-foreground">Total Graded</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Verification Link */}
        {cgcData.certVerificationUrl && (
          <>
            <Separator />
            <Button
              variant="outline"
              className="w-full"
              asChild
            >
              <a
                href={cgcData.certVerificationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2"
              >
                <ExternalLink className="h-4 w-4" />
                View Certificate on CGC Website
              </a>
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
};
