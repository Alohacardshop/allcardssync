import { toast } from 'sonner';

export interface ActionableError {
  message: string;
  suggestions: string[];
  actions?: Array<{ label: string; action: () => void }>;
}

// Enhanced error handler for production use
export class ProductionErrorHandler {
  static parseNetworkError(error: any): ActionableError {
    const errorMessage = error?.message || String(error);
    
    // Connection refused (printer offline or wrong IP)
    if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('Connection refused')) {
      return {
        message: 'Cannot connect to printer',
        suggestions: [
          'Check if the printer is powered on and connected to the network',
          'Verify the printer IP address in settings',
          'Ensure your computer is on the same network as the printer',
          'Try printing a test page from the printer directly'
        ]
      };
    }
    
    // Timeout errors
    if (errorMessage.includes('ETIMEDOUT') || errorMessage.includes('timeout') || errorMessage.includes('AbortError')) {
      return {
        message: 'Printer connection timed out',
        suggestions: [
          'The printer may be busy or processing another job',
          'Check network connectivity between your computer and printer',
          'Try reducing print quality or simplifying the label design',
          'Wait a moment and try again'
        ]
      };
    }
    
    // Host unreachable (network issues)
    if (errorMessage.includes('EHOSTUNREACH') || errorMessage.includes('Host unreachable')) {
      return {
        message: 'Cannot reach printer on network',
        suggestions: [
          'Verify the printer IP address is correct',
          'Check if your computer and printer are on the same network',
          'Try pinging the printer IP from command prompt/terminal',
          'Contact IT support if network issues persist'
        ]
      };
    }
    
    // Generic network errors
    if (errorMessage.includes('fetch') || errorMessage.includes('NetworkError')) {
      return {
        message: 'Network communication failed',
        suggestions: [
          'Check your internet connection',
          'Verify the print bridge service is running',
          'Try refreshing the page and attempting again',
          'Contact support if the issue persists'
        ]
      };
    }
    
    // Default error handler
    return {
      message: 'An unexpected error occurred',
      suggestions: [
        'Try refreshing the page and attempting the operation again',
        'Check console logs for more details (F12 → Console)',
        'Contact your system administrator if the problem persists',
        'Save your work before retrying'
      ]
    };
  }
  
  static showActionableToast(error: ActionableError, printerIp?: string) {
    // Show main error message
    toast.error(error.message, {
      description: 'Click for troubleshooting tips',
      duration: 8000,
      action: {
        label: 'Help',
        onClick: () => {
          // Show detailed suggestions
          const suggestionsList = error.suggestions
            .map((suggestion, index) => `${index + 1}. ${suggestion}`)
            .join('\n');
          
          toast.info('Troubleshooting Tips', {
            description: suggestionsList,
            duration: 15000,
            action: printerIp && this.shouldShowWebUIOption(error) ? {
              label: 'Open WebUI',
              onClick: () => window.open(`http://${printerIp}`, '_blank')
            } : undefined
          });
        }
      }
    });
  }
  
  private static shouldShowWebUIOption(error: ActionableError): boolean {
    const message = error.message.toLowerCase();
    return message.includes('connect') || 
           message.includes('network') || 
           message.includes('unreachable') ||
           message.includes('timeout');
  }
}

// Validation helpers for preventing costly mistakes
export class ValidationHelper {
  static validateLabelData(data: any): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // Check required fields
    if (!data.sku || data.sku.trim() === '') {
      errors.push('SKU is required for label printing');
    }
    
    if (!data.price || data.price <= 0) {
      errors.push('Valid price is required');
    }
    
    // Validate barcode data
    if (data.barcode && !this.isValidBarcode(data.barcode)) {
      errors.push('Invalid barcode format');
    }
    
    // Check text length limits (prevent printer memory issues)
    if (data.title && data.title.length > 50) {
      errors.push('Title too long (max 50 characters)');
    }
    
    if (data.description && data.description.length > 100) {
      errors.push('Description too long (max 100 characters)');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
  
  static isValidBarcode(barcode: string): boolean {
    // Basic barcode validation - adjust pattern as needed
    const barcodePattern = /^[0-9A-Z\-]{1,30}$/;
    return barcodePattern.test(barcode);
  }
  
  static validatePrinterConnection(ip: string, port: number): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // Validate IP address format
    const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipPattern.test(ip)) {
      errors.push('Invalid IP address format');
    } else {
      // Check IP range validity
      const parts = ip.split('.').map(Number);
      if (parts.some(part => part < 0 || part > 255)) {
        errors.push('IP address values must be between 0-255');
      }
    }
    
    // Validate port
    if (port < 1 || port > 65535) {
      errors.push('Port must be between 1-65535');
    }
    
    // Common printer port check
    if (port !== 9100 && port !== 515) {
      errors.push('Warning: Common printer ports are 9100 (ZPL) or 515 (LPD)');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

// Retry helper with exponential backoff for failed operations
export class RetryHelper {
  static async withRetry<T>(
    operation: () => Promise<T>,
    maxAttempts: number = 3,
    baseDelayMs: number = 1000,
    onRetry?: (attempt: number, error: any) => void
  ): Promise<T> {
    let lastError: any;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        if (attempt === maxAttempts) {
          break;
        }
        
        // Calculate delay with exponential backoff and jitter
        const delay = baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 1000;
        
        onRetry?.(attempt, error);
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  }
}

export default ProductionErrorHandler;