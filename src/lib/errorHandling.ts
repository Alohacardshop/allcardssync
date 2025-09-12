// Enhanced error handling utilities for ZPL printing
import { toast } from "sonner";

export interface ActionableError {
  message: string;
  suggestions: string[];
  actions?: Array<{
    label: string;
    action: () => void;
  }>;
}

export class ZPLErrorHandler {
  static parseNetworkError(error: any): ActionableError {
    const errorStr = error instanceof Error ? error.message : String(error);
    
    if (errorStr.includes('ECONNREFUSED')) {
      return {
        message: 'Printer not reachable - connection refused',
        suggestions: [
          'Check if printer is powered on',
          'Verify printer is connected to network', 
          'Ensure printer IP address is correct',
          'Try opening printer WebUI in browser'
        ]
      };
    }
    
    if (errorStr.includes('ETIMEDOUT') || errorStr.includes('timeout')) {
      return {
        message: 'Network timeout - check Wi-Fi signal',
        suggestions: [
          'Check Wi-Fi signal strength',
          'Move closer to wireless access point',
          'Restart printer network connection',
          'Try ping test to verify connectivity'
        ]
      };
    }
    
    if (errorStr.includes('EHOSTUNREACH') || errorStr.includes('ENOTFOUND')) {
      return {
        message: 'Bad IP address or hostname',
        suggestions: [
          'Verify IP address is correct',
          'Check network subnet (e.g., 192.168.1.x)',
          'Try printer auto-discovery',
          'Check router DHCP assignments'
        ]
      };
    }
    
    if (errorStr.includes('ENETUNREACH')) {
      return {
        message: 'Network unreachable - routing issue',
        suggestions: [
          'Check if on same network as printer',
          'Disable VPN if active',
          'Verify network routing configuration',
          'Check firewall settings'
        ]
      };
    }
    
    return {
      message: errorStr,
      suggestions: [
        'Try printing again',
        'Check printer status',
        'Verify network connection'
      ]
    };
  }
  
  static showActionableToast(error: ActionableError, printerIp?: string) {
    // Show main error
    toast.error(error.message);
    
    // Show suggestions as info toasts with delay
    error.suggestions.forEach((suggestion, index) => {
      setTimeout(() => {
        toast.info(suggestion, {
          duration: 4000,
        });
      }, (index + 1) * 1200);
    });
    
    // Add action buttons if printer IP is available
    if (printerIp && error.suggestions.some(s => s.includes('WebUI'))) {
      setTimeout(() => {
        toast.info(`💡 Quick actions available`, {
          duration: 6000,
          action: {
            label: 'Open WebUI',
            onClick: () => window.open(`http://${printerIp}`, '_blank')
          }
        });
      }, error.suggestions.length * 1200 + 500);
    }
  }
}

// Common error scenarios and solutions
export const ERROR_SOLUTIONS = {
  ECONNREFUSED: {
    title: 'Printer Not Reachable',
    description: 'The printer is not responding on the specified IP and port.',
    quickFixes: [
      'Check printer power and network status',
      'Verify IP address in printer settings',
      'Test with ping or open WebUI'
    ],
    technicalSteps: [
      'Print network configuration from printer',
      'Check DHCP reservations in router',
      'Verify port 9100 is not blocked by firewall'
    ]
  },
  
  ETIMEDOUT: {
    title: 'Network Timeout',
    description: 'The connection to the printer timed out.',
    quickFixes: [
      'Check Wi-Fi signal strength',
      'Move closer to wireless access point',
      'Restart printer network connection'
    ],
    technicalSteps: [
      'Check for network congestion',
      'Verify MTU settings',
      'Test with different timeout values'
    ]
  },
  
  EHOSTUNREACH: {
    title: 'Host Unreachable',
    description: 'The specified IP address cannot be reached.',
    quickFixes: [
      'Verify IP address is correct',
      'Check network subnet configuration',
      'Ensure printer and computer are on same network'
    ],
    technicalSteps: [
      'Check routing tables',
      'Verify subnet mask configuration',
      'Test connectivity with traceroute'
    ]
  }
} as const;