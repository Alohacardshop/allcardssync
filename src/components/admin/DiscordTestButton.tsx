import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Send, Loader2, Clock } from 'lucide-react';
import { useRegionalDateTime } from '@/hooks/useRegionalDateTime';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const TEST_ORDER_PAYLOAD = {
  id: "9999999999999",
  name: "#TEST-001",
  created_at: new Date().toISOString(),
  financial_status: "paid",
  fulfillment_status: null,
  total_price: "221.00",
  customer: { first_name: "Test", last_name: "Customer" },
  line_items: [
    {
      title: "Pokemon SV10: Destined Rivals Ethan's Ho-Oh ex - 230/182",
      variant_title: "Holofoil / Near Mint",
      sku: "633030hoN",
      price: "150.00",
      quantity: 1,
      image: { src: "https://cdn.shopify.com/s/files/1/0570/3624/2843/files/633030hoN.png" }
    },
    {
      title: "Pokemon SWSH: Sword & Shield Promo Cards Charizard VMAX - SWSH261",
      variant_title: "Holofoil / Near Mint",
      sku: "285378hoN",
      price: "50.00",
      quantity: 1
    },
    {
      title: "Pokemon Miscellaneous Cards Bulbasaur - 133/132",
      variant_title: "Holofoil / Near Mint",
      sku: "654703hoN",
      price: "21.00",
      quantity: 1
    }
  ],
  tags: "pickup, ward",
  shop_domain: "alohacards-hi.myshopify.com"
};

interface DiscordTestButtonProps {
  regionId: string;
}

export function DiscordTestButton({ regionId }: DiscordTestButtonProps) {
  const [isSending, setIsSending] = useState(false);
  const { isStoreOpen, getNextOpenTime, businessHours } = useRegionalDateTime();
  
  const storeOpen = isStoreOpen();
  const startHour = businessHours?.start ?? 8;
  const endHour = businessHours?.end ?? 19;
  const formatHour = (h: number) => `${h > 12 ? h - 12 : h}${h >= 12 ? 'pm' : 'am'}`;

  const sendTestNotification = async () => {
    if (!storeOpen) {
      toast.error(`Notifications only sent during business hours (${formatHour(startHour)}-${formatHour(endHour)})`);
      return;
    }
    
    setIsSending(true);
    try {
      // Insert a test notification into pending_notifications
      const { error: insertError } = await supabase
        .from('pending_notifications')
        .insert({
          region_id: regionId,
          payload: TEST_ORDER_PAYLOAD,
          sent: false
        });

      if (insertError) {
        throw insertError;
      }

      // Immediately flush to send the notification
      const { data, error: flushError } = await supabase.functions.invoke('flush-pending-notifications', {
        method: 'POST',
        body: {}
      });

      if (flushError) {
        throw flushError;
      }

      if (data?.sent > 0) {
        toast.success(`Test notification sent to ${regionId} Discord channel!`);
      } else if (data?.skippedOutsideHours) {
        toast.warning('Notifications are only sent during business hours (8am-7pm)');
      } else if (data?.failed > 0) {
        toast.error('Notification queued but failed to send - check Discord webhook config');
      } else {
        toast.warning('No notifications were sent - check if Discord is enabled for this region');
      }
    } catch (error: any) {
      console.error('Error sending test notification:', error);
      toast.error(`Failed to send test: ${error.message}`);
    } finally {
      setIsSending(false);
    }
  };

  if (!storeOpen) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <Button
                variant="outline"
                size="sm"
                disabled
                className="gap-2 opacity-60"
              >
                <Clock className="h-4 w-4" />
                Store Closed
              </Button>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>Notifications only sent {formatHour(startHour)}-{formatHour(endHour)}</p>
            <p className="text-xs text-muted-foreground">Opens {getNextOpenTime()}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={sendTestNotification}
      disabled={isSending}
      className="gap-2"
    >
      {isSending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Send className="h-4 w-4" />
      )}
      Send Test Notification
    </Button>
  );
}
