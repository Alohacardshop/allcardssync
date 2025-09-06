import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useExternalGames } from "@/hooks/useExternalTCG";
import { toast } from "sonner";
import { Loader2, Settings, Save } from "lucide-react";

export function RawIntakeSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [defaultGame, setDefaultGame] = useState<string>('pokemon');
  const [enabledGames, setEnabledGames] = useState<string[]>(['pokemon']);
  
  const { data: allGames = [], isLoading: gamesLoading } = useExternalGames();

  // Load current settings
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('key_name, key_value')
        .in('key_name', ['RAW_INTAKE_DEFAULT_GAME', 'RAW_INTAKE_ENABLED_GAMES']);

      if (error) throw error;

      const settings = data?.reduce((acc, setting) => {
        acc[setting.key_name] = setting.key_value;
        return acc;
      }, {} as Record<string, string>) || {};

      // Set default game (fallback to pokemon)
      setDefaultGame(settings.RAW_INTAKE_DEFAULT_GAME || 'pokemon');
      
      // Set enabled games (fallback to just pokemon)
      const enabledGamesValue = settings.RAW_INTAKE_ENABLED_GAMES;
      if (enabledGamesValue) {
        try {
          const parsed = JSON.parse(enabledGamesValue);
          setEnabledGames(Array.isArray(parsed) ? parsed : ['pokemon']);
        } catch {
          setEnabledGames(['pokemon']);
        }
      } else {
        setEnabledGames(['pokemon']);
      }
    } catch (error) {
      console.error('Error loading raw intake settings:', error);
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const updates = [
        {
          key_name: 'RAW_INTAKE_DEFAULT_GAME',
          key_value: defaultGame,
          description: 'Default game for raw card intake',
          category: 'raw_intake',
          is_encrypted: false
        },
        {
          key_name: 'RAW_INTAKE_ENABLED_GAMES',
          key_value: JSON.stringify(enabledGames),
          description: 'List of enabled games for raw card intake',
          category: 'raw_intake',
          is_encrypted: false
        }
      ];

      for (const update of updates) {
        const { error } = await supabase
          .from('system_settings')
          .upsert(update, { 
            onConflict: 'key_name',
            ignoreDuplicates: false 
          });
        
        if (error) throw error;
      }

      toast.success('Raw intake settings saved successfully');
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleGameToggle = (gameId: string, enabled: boolean) => {
    if (enabled) {
      setEnabledGames(prev => [...prev, gameId]);
    } else {
      const newEnabled = enabledGames.filter(id => id !== gameId);
      // Always keep at least one game enabled
      if (newEnabled.length === 0) {
        toast.error('At least one game must be enabled');
        return;
      }
      setEnabledGames(newEnabled);
      
      // If we're disabling the default game, switch to the first enabled game
      if (gameId === defaultGame) {
        setDefaultGame(newEnabled[0]);
      }
    }
  };

  if (loading || gamesLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Raw Intake Settings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Raw Intake Settings
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert>
          <AlertDescription>
            Configure which games are available for raw card intake and set the default selection.
          </AlertDescription>
        </Alert>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="default-game">Default Game</Label>
            <Select value={defaultGame} onValueChange={setDefaultGame}>
              <SelectTrigger>
                <SelectValue placeholder="Select default game" />
              </SelectTrigger>
              <SelectContent>
                {enabledGames.map(gameId => {
                  const game = allGames.find(g => g.id === gameId);
                  return game ? (
                    <SelectItem key={game.id} value={game.id}>
                      {game.name}
                    </SelectItem>
                  ) : null;
                })}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          <div className="space-y-3">
            <Label>Enabled Games</Label>
            <div className="space-y-3">
              {allGames.map(game => (
                <div key={game.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`game-${game.id}`}
                    checked={enabledGames.includes(game.id)}
                    onCheckedChange={(checked) => handleGameToggle(game.id, Boolean(checked))}
                  />
                  <Label htmlFor={`game-${game.id}`} className="text-sm font-normal">
                    {game.name}
                  </Label>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={saveSettings} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Settings
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
