import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { MapPin, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

interface Props {
  locationKey: string | null;
}

interface VerifyResult {
  success: boolean;
  location_key: string;
  location?: any;
  status?: number;
  error?: any;
}

export function EbayMerchantLocation({ locationKey }: Props) {
  const [verifying, setVerifying] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('');
  const [stateOrProvince, setStateOrProvince] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('US');

  const handleVerify = async () => {
    setVerifying(true);
    setVerifyResult(null);
    setShowForm(false);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const res = await supabase.functions.invoke('ebay-manage-location', {
        method: 'GET',
      });

      const result = res.data as VerifyResult;
      setVerifyResult(result);

      if (result?.success) {
        toast.success(`Location "${result.location_key}" is registered on eBay`);
      } else {
        toast.error(`Location "${result?.location_key}" not found on eBay`);
        setShowForm(true);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to verify location');
    } finally {
      setVerifying(false);
    }
  };

  const handleRegister = async () => {
    if (!addressLine1 || !city || !stateOrProvince || !postalCode || !country) {
      toast.error('Please fill all required address fields');
      return;
    }
    setRegistering(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const res = await supabase.functions.invoke('ebay-manage-location', {
        method: 'POST',
        body: { addressLine1, addressLine2: addressLine2 || undefined, city, stateOrProvince, postalCode, country },
      });

      const result = res.data;
      if (result?.success) {
        toast.success(result.message || 'Location registered on eBay');
        setShowForm(false);
        setVerifyResult({ success: true, location_key: result.location_key });
      } else {
        toast.error(result?.error?.message || result?.error || 'Failed to register location');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to register location');
    } finally {
      setRegistering(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          Merchant Location
        </CardTitle>
        <CardDescription>
          eBay requires a registered merchant location for inventory offers.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Label className="text-muted-foreground">Location Key:</Label>
          <Badge variant="outline">{locationKey || '(not set)'}</Badge>
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={handleVerify} disabled={verifying || !locationKey} variant="outline" size="sm">
            {verifying ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle className="h-4 w-4 mr-1" />}
            Verify Location
          </Button>

          {verifyResult && (
            <Badge variant={verifyResult.success ? 'default' : 'destructive'}>
              {verifyResult.success ? 'Registered' : 'Not Found'}
            </Badge>
          )}
        </div>

        {verifyResult?.success && verifyResult.location && (
          <div className="rounded-md border p-3 text-sm space-y-1 bg-muted/50">
            <p><span className="font-medium">Name:</span> {verifyResult.location.name || '—'}</p>
            {verifyResult.location.location?.address && (
              <p><span className="font-medium">Address:</span>{' '}
                {[
                  verifyResult.location.location.address.addressLine1,
                  verifyResult.location.location.address.city,
                  verifyResult.location.location.address.stateOrProvince,
                  verifyResult.location.location.address.postalCode,
                ].filter(Boolean).join(', ')}
              </p>
            )}
            <p><span className="font-medium">Status:</span> {verifyResult.location.merchantLocationStatus || '—'}</p>
          </div>
        )}

        {showForm && (
          <div className="space-y-3 border rounded-md p-4">
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              Location not registered. Fill in your address to register it on eBay.
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Address Line 1 *</Label>
                <Input value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} placeholder="123 Main St" />
              </div>
              <div>
                <Label>Address Line 2</Label>
                <Input value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} placeholder="Suite 100" />
              </div>
              <div>
                <Label>City *</Label>
                <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Honolulu" />
              </div>
              <div>
                <Label>State / Province *</Label>
                <Input value={stateOrProvince} onChange={(e) => setStateOrProvince(e.target.value)} placeholder="HI" />
              </div>
              <div>
                <Label>Postal Code *</Label>
                <Input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="96815" />
              </div>
              <div>
                <Label>Country *</Label>
                <Input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="US" />
              </div>
            </div>

            <Button onClick={handleRegister} disabled={registering} size="sm">
              {registering ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <MapPin className="h-4 w-4 mr-1" />}
              Register Location
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
