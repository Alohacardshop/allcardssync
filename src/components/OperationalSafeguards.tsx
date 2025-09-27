import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Lock, 
  Unlock, 
  Clock, 
  Shield, 
  AlertTriangle, 
  Save,
  RefreshCw,
  Timer
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// Lock Screen Component
export function LockScreen({ isLocked, onUnlock }: { isLocked: boolean; onUnlock: () => void }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const handleUnlock = () => {
    const savedPin = localStorage.getItem('lockScreenPin') || '1234';
    if (pin === savedPin) {
      onUnlock();
      setPin('');
      setError('');
    } else {
      setError('Incorrect PIN');
      setPin('');
    }
  };

  if (!isLocked) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
      <Card className="w-96">
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2">
            <Lock className="h-5 w-5" />
            Screen Locked
          </CardTitle>
          <CardDescription>Enter your PIN to continue</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pin">PIN</Label>
            <Input
              id="pin"
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
              placeholder="Enter 4-digit PIN"
              maxLength={4}
              className="text-center text-lg tracking-widest"
            />
          </div>
          
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          
          <Button onClick={handleUnlock} className="w-full" disabled={pin.length !== 4}>
            <Unlock className="h-4 w-4 mr-2" />
            Unlock
          </Button>
          
          <div className="text-xs text-center text-muted-foreground">
            Default PIN: 1234 (change in settings)
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Session Timeout Warning
export function SessionTimeoutWarning() {
  const [timeLeft, setTimeLeft] = useState(900); // 15 minutes warning
  const [showWarning, setShowWarning] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    let lastActivity = Date.now();
    const TIMEOUT_DURATION = 8 * 60 * 60 * 1000; // 8 hours
    const WARNING_DURATION = 15 * 60 * 1000; // 15 minutes before timeout

    const resetTimer = () => {
      lastActivity = Date.now();
      if (showWarning) {
        setShowWarning(false);
        setTimeLeft(900);
      }
    };

    const checkSession = () => {
      const timeSinceActivity = Date.now() - lastActivity;
      
      if (timeSinceActivity >= TIMEOUT_DURATION) {
        // Force logout
        localStorage.clear();
        window.location.href = '/auth';
        return;
      }
      
      if (timeSinceActivity >= TIMEOUT_DURATION - WARNING_DURATION && !showWarning) {
        setShowWarning(true);
        setTimeLeft(Math.floor((TIMEOUT_DURATION - timeSinceActivity) / 1000));
        toast({
          title: "Session Timeout Warning",
          description: "Your session will expire soon due to inactivity",
          variant: "destructive"
        });
      }
      
      if (showWarning) {
        const remaining = Math.floor((TIMEOUT_DURATION - timeSinceActivity) / 1000);
        setTimeLeft(Math.max(0, remaining));
      }
    };

    // Listen for user activity
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    events.forEach(event => {
      document.addEventListener(event, resetTimer, true);
    });

    const interval = setInterval(checkSession, 1000);

    return () => {
      clearInterval(interval);
      events.forEach(event => {
        document.removeEventListener(event, resetTimer, true);
      });
    };
  }, [showWarning, toast]);

  const extendSession = () => {
    setShowWarning(false);
    setTimeLeft(900);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!showWarning) return null;

  return (
    <Dialog open={showWarning} onOpenChange={() => {}}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Timer className="h-5 w-5 text-amber-500" />
            Session Timeout Warning
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <Alert>
            <Clock className="h-4 w-4" />
            <AlertDescription>
              Your session will expire in <strong>{formatTime(timeLeft)}</strong> due to inactivity.
              All unsaved changes will be lost.
            </AlertDescription>
          </Alert>
          
          <Progress value={(timeLeft / 900) * 100} className="w-full" />
          
          <Button onClick={extendSession} className="w-full">
            <RefreshCw className="h-4 w-4 mr-2" />
            Extend Session
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Panic Save - saves all form data to localStorage
export function usePanicSave() {
  const { toast } = useToast();

  const panicSave = () => {
    try {
      const forms = document.querySelectorAll('form');
      const savedData: any = {};
      
      forms.forEach((form, index) => {
        const formData = new FormData(form);
        const data: any = {};
        
        for (const [key, value] of formData.entries()) {
          data[key] = value;
        }
        
        if (Object.keys(data).length > 0) {
          savedData[`form_${index}_${Date.now()}`] = {
            data,
            url: window.location.pathname,
            timestamp: new Date().toISOString()
          };
        }
      });
      
      if (Object.keys(savedData).length > 0) {
        localStorage.setItem('panicSave', JSON.stringify(savedData));
        toast({
          title: "Emergency Save Complete",
          description: `Saved ${Object.keys(savedData).length} form(s) to localStorage`
        });
      } else {
        toast({
          title: "No Data to Save",
          description: "No form data found to save"
        });
      }
    } catch (error) {
      toast({
        title: "Emergency Save Failed",
        description: "Unable to save form data",
        variant: "destructive"
      });
    }
  };

  const loadPanicSave = () => {
    try {
      const saved = localStorage.getItem('panicSave');
      if (saved) {
        const data = JSON.parse(saved);
        return data;
      }
      return null;
    } catch (error) {
      console.error('Error loading panic save data:', error);
      return null;
    }
  };

  const clearPanicSave = () => {
    localStorage.removeItem('panicSave');
    toast({
      title: "Emergency Save Cleared",
      description: "Saved form data has been cleared"
    });
  };

  // Set up global panic save shortcut (Ctrl+Shift+S)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key === 'S') {
        event.preventDefault();
        panicSave();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return { panicSave, loadPanicSave, clearPanicSave };
}

// Recovery Mode Component
export function RecoveryMode() {
  const [savedData, setSavedData] = useState<any>(null);
  const [showRecovery, setShowRecovery] = useState(false);
  const { loadPanicSave, clearPanicSave } = usePanicSave();

  useEffect(() => {
    const data = loadPanicSave();
    if (data && Object.keys(data).length > 0) {
      setSavedData(data);
      setShowRecovery(true);
    }
  }, []);

  const restoreData = (formKey: string) => {
    const formData = savedData[formKey];
    if (formData) {
      // Try to restore data to current form if on same page
      if (formData.url === window.location.pathname) {
        Object.entries(formData.data).forEach(([key, value]) => {
          const input = document.querySelector(`[name="${key}"]`) as HTMLInputElement;
          if (input) {
            input.value = value as string;
          }
        });
      }
      
      // Remove this saved form
      const updatedData = { ...savedData };
      delete updatedData[formKey];
      setSavedData(updatedData);
      
      if (Object.keys(updatedData).length === 0) {
        setShowRecovery(false);
        clearPanicSave();
      }
    }
  };

  if (!showRecovery || !savedData) return null;

  return (
    <Dialog open={showRecovery} onOpenChange={setShowRecovery}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-500" />
            Recovery Mode
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <Alert>
            <Save className="h-4 w-4" />
            <AlertDescription>
              We found unsaved form data from a previous session. Would you like to restore it?
            </AlertDescription>
          </Alert>
          
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {Object.entries(savedData).map(([key, data]: [string, any]) => (
              <Card key={key} className="p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">
                      Form from {data.url}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Saved: {new Date(data.timestamp).toLocaleString()}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {Object.keys(data.data).length} fields
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => restoreData(key)}
                  >
                    Restore
                  </Button>
                </div>
              </Card>
            ))}
          </div>
          
          <div className="flex gap-2">
            <Button variant="outline" onClick={clearPanicSave} className="flex-1">
              Clear All
            </Button>
            <Button onClick={() => setShowRecovery(false)} className="flex-1">
              Continue Without Recovery
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Training Mode Hook
export function useTrainingMode() {
  const [trainingMode, setTrainingMode] = useState(() => {
    return localStorage.getItem('trainingMode') === 'true';
  });

  const toggleTrainingMode = () => {
    const newMode = !trainingMode;
    setTrainingMode(newMode);
    localStorage.setItem('trainingMode', newMode.toString());
  };

  return { trainingMode, toggleTrainingMode };
}