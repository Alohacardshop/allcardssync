import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { invokeCGCLookup } from "@/lib/cgcService";

export const TestCGCButton = () => {
  const testCGCConnection = async () => {
    console.log("[TEST:CGC] Starting connection test...");
    toast.info("Testing CGC connection...");
    
    try {
      // Test with a known-bad cert number to expect 404
      const result = await invokeCGCLookup({ 
        certNumber: "0000000001",
        include: 'pop,images'
      }, 8000);
      
      console.log("[TEST:CGC] Connection test result:", result);
      
      if (result.error && result.error.includes('404')) {
        toast.success("CGC API connection working (404 as expected for test cert)");
      } else if (result.ok) {
        toast.success("CGC API connection working (unexpected success!)");
      } else {
        toast.warning(`CGC API responded with: ${result.error}`);
      }
    } catch (error) {
      console.error("[TEST:CGC] Connection test failed:", error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`CGC connection test failed: ${errorMsg}`);
    }
  };

  return (
    <Button 
      onClick={testCGCConnection}
      variant="outline"
      size="sm"
      className="mb-4"
    >
      Test CGC Connection
    </Button>
  );
};