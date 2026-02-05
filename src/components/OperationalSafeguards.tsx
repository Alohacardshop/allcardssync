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
  Timer,
  LogOut,
  FileText,
  Trash2
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { cleanupAuthState } from '@/lib/auth';
import { navigateTo } from '@/lib/navigation';
import { PATHS } from '@/routes/paths';

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
        // Force logout using proper auth signout
        cleanupAuthState();
        supabase.auth.signOut().finally(() => {
          navigateTo(PATHS.auth);
        });
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

  const signOut = async () => {
    cleanupAuthState();
    await supabase.auth.signOut();
    navigateTo(PATHS.auth);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!showWarning) return null;

  const isUrgent = timeLeft < 60; // Less than 1 minute

  return (
    <Dialog open={showWarning} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <div className={`p-2 rounded-full ${isUrgent ? 'bg-destructive/10' : 'bg-amber-500/10'}`}>
              <Timer className={`h-5 w-5 ${isUrgent ? 'text-destructive animate-pulse' : 'text-amber-500'}`} />
            </div>
            Session Expiring Soon
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-2">
          <Alert variant={isUrgent ? "destructive" : "default"} className="border-2">
            <Clock className="h-4 w-4" />
            <AlertDescription className="text-base">
              Your session will expire in{' '}
              <span className={`font-bold text-lg ${isUrgent ? 'text-destructive' : ''}`}>
                {formatTime(timeLeft)}
              </span>
              {' '}due to inactivity.
            </AlertDescription>
          </Alert>
          
          <p className="text-sm text-muted-foreground text-center">
            Any unsaved work will be lost when your session expires.
          </p>
          
          <Progress 
            value={(timeLeft / 900) * 100} 
            className={`w-full h-2 ${isUrgent ? '[&>div]:bg-destructive' : ''}`}
          />
          
          <div className="flex flex-col gap-2 pt-2">
            <Button onClick={extendSession} size="lg" className="w-full gap-2">
              <RefreshCw className="h-4 w-4" />
              Stay Signed In
            </Button>
            <Button onClick={signOut} variant="outline" size="lg" className="w-full gap-2">
              <LogOut className="h-4 w-4" />
              Sign Out Now
            </Button>
          </div>
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

  const dismissAndClear = () => {
    clearPanicSave();
    setShowRecovery(false);
  };

  const dismissKeepData = () => {
    setShowRecovery(false);
  };

  if (!showRecovery || !savedData) return null;

  const savedCount = Object.keys(savedData).length;

  return (
    <Dialog open={showRecovery} onOpenChange={dismissKeepData}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <div className="p-2 rounded-full bg-blue-500/10">
              <Shield className="h-5 w-5 text-blue-500" />
            </div>
            Recover Unsaved Work
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-2">
          <Alert className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/50">
            <Save className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <AlertDescription className="text-blue-800 dark:text-blue-200">
              We found <strong>{savedCount} form{savedCount > 1 ? 's' : ''}</strong> with unsaved data from a previous session.
            </AlertDescription>
          </Alert>
          
          <div className="rounded-lg border bg-muted/30 p-3">
            <h4 className="text-sm font-medium mb-2">What would you like to do?</h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• <strong>Restore</strong> – Fill the form with your saved data</li>
              <li>• <strong>Clear All</strong> – Permanently delete saved data</li>
              <li>• <strong>Continue</strong> – Keep data saved for later</li>
            </ul>
          </div>
          
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {Object.entries(savedData).map(([key, data]: [string, any]) => (
              <Card key={key} className="p-3 hover:bg-accent/50 transition-colors">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      {data.url}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {new Date(data.timestamp).toLocaleString()} · {Object.keys(data.data).length} fields
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => restoreData(key)}
                    disabled={data.url !== window.location.pathname}
                    title={data.url !== window.location.pathname ? 'Navigate to this page to restore' : 'Restore form data'}
                  >
                    Restore
                  </Button>
                </div>
                {data.url !== window.location.pathname && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                    Navigate to {data.url} to restore this form
                  </p>
                )}
              </Card>
            ))}
          </div>
          
          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={dismissAndClear} className="flex-1 gap-2">
              <Trash2 className="h-4 w-4" />
              Clear All
            </Button>
            <Button onClick={dismissKeepData} className="flex-1 gap-2">
              Continue Without Restoring
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