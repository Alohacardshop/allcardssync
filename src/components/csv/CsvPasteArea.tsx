import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, AlertTriangle, CheckCircle, FileText, Zap } from 'lucide-react';
import { parseTcgplayerCsv, ParseResult } from '@/lib/csv/parseTcgplayerCsv';
import { NormalizedCard } from '@/lib/csv/normalize';
import { toast } from 'sonner';

interface CsvPasteAreaProps {
  onParsed: (cards: NormalizedCard[]) => void;
}

export const CsvPasteArea: React.FC<CsvPasteAreaProps> = ({ onParsed }) => {
  const [csvText, setCsvText] = useState('');
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  const handleParse = () => {
    if (!csvText.trim()) {
      toast.error('Please paste CSV data first');
      return;
    }

    const result = parseTcgplayerCsv(csvText);
    setParseResult(result);

    if (result.data.length === 0) {
      if (result.errors.length > 0) {
        toast.error(result.errors[0].reason);
      } else {
        toast.error('No rows parsed. Check headers or try our example.');
      }
      return;
    }

    if (result.errors.length > 0) {
      toast.error(`Parsed ${result.data.length} rows, skipped ${result.skippedRows} (see details)`);
    } else {
      toast.success(`Successfully parsed ${result.data.length} cards`);
    }

    onParsed(result.data);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault();
      handleParse();
    }
  };

  const calculateTotals = () => {
    if (!parseResult?.data.length) return { cards: 0, value: 0 };
    
    const cards = parseResult.data.reduce((sum, card) => sum + card.quantity, 0);
    const value = parseResult.data.reduce((sum, card) => {
      const price = card.marketPrice || 0;
      return sum + (price * card.quantity);
    }, 0);
    
    return { cards, value };
  };

  const totals = calculateTotals();
  const exampleCsv = `TCGplayer Id,Product Line,Set Name,Product Name,Title,Number,Rarity,Condition,TCG Market Price,TCG Low Price,Total Quantity,Photo URL
226594,Pokemon,SWSH04: Vivid Voltage,Rayquaza,,138/185,Amazing Rare,Near Mint,19.10,,2,https://tcgplayer-cdn.tcgplayer.com/product/226594_in_400x400.jpg
246719,Pokemon,SWSH07: Evolving Skies,Umbreon V (Alternate Full Art),,189/203,Ultra Rare,Near Mint,350.91,,1,https://tcgplayer-cdn.tcgplayer.com/product/246719_in_400x400.jpg`;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            TCGPlayer CSV Parser
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Textarea
              placeholder="Paste your TCGPlayer CSV data here..."
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={8}
              className="font-mono text-sm"
            />
            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-muted-foreground">
                Supports both 13-column and 16-column TCGPlayer formats. Press Ctrl+Enter to parse.
              </p>
              <Button
                variant="outline" 
                size="sm"
                onClick={() => setCsvText(exampleCsv)}
              >
                Load Example
              </Button>
            </div>
          </div>

          <Button 
            onClick={handleParse}
            disabled={!csvText.trim()}
            className="w-full"
          >
            <Zap className="h-4 w-4 mr-2" />
            Parse CSV
          </Button>
        </CardContent>
      </Card>

      {/* Parse Results */}
      {parseResult && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                {parseResult.data.length > 0 ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                )}
                Parse Results
              </CardTitle>
              <Badge variant={parseResult.schema === 'unknown' ? 'destructive' : 'secondary'}>
                {parseResult.schema} format
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Summary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 border rounded-lg">
                <div className="font-semibold text-lg">{parseResult.data.length}</div>
                <div className="text-sm text-muted-foreground">Parsed Cards</div>
              </div>
              <div className="text-center p-3 border rounded-lg">
                <div className="font-semibold text-lg">{totals.cards}</div>
                <div className="text-sm text-muted-foreground">Total Quantity</div>
              </div>
              <div className="text-center p-3 border rounded-lg">
                <div className="font-semibold text-lg">${totals.value.toFixed(2)}</div>
                <div className="text-sm text-muted-foreground">Market Value</div>
              </div>
              <div className="text-center p-3 border rounded-lg">
                <div className="font-semibold text-lg">{parseResult.skippedRows}</div>
                <div className="text-sm text-muted-foreground">Skipped Rows</div>
              </div>
            </div>

            {/* Error Details */}
            {parseResult.errors.length > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="flex items-center justify-between">
                  <span>
                    {parseResult.errors.length} error{parseResult.errors.length !== 1 ? 's' : ''} found
                  </span>
                  <Collapsible open={showErrors} onOpenChange={setShowErrors}>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm">
                        Details <ChevronDown className="h-4 w-4 ml-1" />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-2">
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {parseResult.errors.map((error, index) => (
                          <div key={index} className="text-xs p-2 bg-red-50 rounded">
                            <strong>Row {error.row}:</strong> {error.reason}
                          </div>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </AlertDescription>
              </Alert>
            )}

            {/* Success message with add to batch action */}
            {parseResult.data.length > 0 && (
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>
                  Ready to add {parseResult.data.length} cards to batch. Press Ctrl+Enter in the text area or use the Add to Batch button.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};