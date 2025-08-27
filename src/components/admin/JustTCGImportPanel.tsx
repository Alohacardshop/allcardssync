import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { 
  Database, 
  Download,
  Gamepad2,
  Package,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  BarChart3
} from 'lucide-react';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  importAllGames,
  importSingleGame, 
  importSpecificSet,
  getJustTCGStats,
  getAvailableGames,
  getGameSets
} from '@/lib/justtcg-api';

export default function JustTCGImportPanel() {
  const queryClient = useQueryClient();
  const [selectedGame, setSelectedGame] = useState<string>('');
  const [selectedSet, setSelectedSet] = useState<string>('');
  const [logs, setLogs] = useState<string[]>([]);

  // Queries
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['justtcg-stats'],
    queryFn: getJustTCGStats,
    refetchInterval: 30000
  });

  const { data: games } = useQuery({
    queryKey: ['justtcg-games'],
    queryFn: getAvailableGames,
    refetchInterval: 60000
  });

  const { data: sets } = useQuery({
    queryKey: ['justtcg-sets', selectedGame],
    queryFn: () => getGameSets(selectedGame),
    enabled: !!selectedGame
  });

  // Mutations
  const importAllMutation = useMutation({
    mutationFn: importAllGames,
    onSuccess: (data) => {
      const message = `Imported ${data.gamesProcessed} games, ${data.setsProcessed} sets, ${data.cardsProcessed} cards, ${data.variantsProcessed} variants`;
      toast.success('All games import completed', { description: message });
      addLog(`✅ ${message}`);
      queryClient.invalidateQueries({ queryKey: ['justtcg-stats'] });
    },
    onError: (error: any) => {
      toast.error('All games import failed', { description: error.message });
      addLog(`❌ Import failed: ${error.message}`);
    }
  });

  const importGameMutation = useMutation({
    mutationFn: importSingleGame,
    onSuccess: (data) => {
      const message = `Imported ${data.setsProcessed} sets, ${data.cardsProcessed} cards, ${data.variantsProcessed} variants for ${selectedGame}`;
      toast.success('Single game import completed', { description: message });
      addLog(`✅ ${message}`);
      queryClient.invalidateQueries({ queryKey: ['justtcg-stats'] });
    },
    onError: (error: any) => {
      toast.error('Single game import failed', { description: error.message });
      addLog(`❌ Import failed: ${error.message}`);
    }
  });

  const importSetMutation = useMutation({
    mutationFn: ({ gameId, setId }: { gameId: string; setId: string }) => 
      importSpecificSet(gameId, setId),
    onSuccess: (data) => {
      const detail = data.details[0];
      const message = `Imported ${detail?.cards || 0} cards, ${detail?.variants || 0} variants for ${selectedGame}/${selectedSet}`;
      toast.success('Specific set import completed', { description: message });
      addLog(`✅ ${message}`);
      queryClient.invalidateQueries({ queryKey: ['justtcg-stats'] });
    },
    onError: (error: any) => {
      toast.error('Specific set import failed', { description: error.message });
      addLog(`❌ Import failed: ${error.message}`);
    }
  });

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [`[${timestamp}] ${message}`, ...prev.slice(0, 49)]); // Keep last 50 logs
  };

  const handleImportAll = () => {
    addLog('🚀 Starting import of all games...');
    importAllMutation.mutate();
  };

  const handleImportGame = () => {
    if (!selectedGame) {
      toast.error('Please select a game first');
      return;
    }
    addLog(`🚀 Starting import of ${selectedGame}...`);
    importGameMutation.mutate(selectedGame);
  };

  const handleImportSet = () => {
    if (!selectedGame || !selectedSet) {
      toast.error('Please select both a game and set first');
      return;
    }
    addLog(`🚀 Starting import of ${selectedGame}/${selectedSet}...`);
    importSetMutation.mutate({ gameId: selectedGame, setId: selectedSet });
  };

  const formatLastSync = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleString();
  };

  const isLoading = importAllMutation.isPending || importGameMutation.isPending || importSetMutation.isPending;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold">JustTCG Fresh Import System</h2>
        <p className="text-muted-foreground mt-1">
          Complete reset and fresh sync from JustTCG API with 200 cards per page
        </p>
      </div>

      {/* Status Widget */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            System Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          {statsLoading ? (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading statistics...
            </div>
          ) : stats ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{stats.totalGames}</div>
                <div className="text-sm text-muted-foreground">Total Games</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{stats.totalSets.toLocaleString()}</div>
                <div className="text-sm text-muted-foreground">Total Sets</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">{stats.totalCards.toLocaleString()}</div>
                <div className="text-sm text-muted-foreground">Total Cards</div>
              </div>
              <div className="text-center">
                <div className="text-sm font-medium">Last Sync</div>
                <div className="text-xs text-muted-foreground">{formatLastSync(stats.lastSyncTime)}</div>
              </div>
            </div>
          ) : (
            <div className="text-center text-muted-foreground">
              Failed to load statistics
            </div>
          )}
        </CardContent>
      </Card>

      {/* Import Controls */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Import All Games */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Database className="h-5 w-5 text-blue-600" />
              Import All Games
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Discovers all games, fetches all sets, and imports all cards with pagination (200/page).
            </p>
            <Button
              onClick={handleImportAll}
              disabled={isLoading}
              className="w-full"
              size="lg"
            >
              {importAllMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importing All...
                </>
              ) : (
                <>
                  <Database className="h-4 w-4 mr-2" />
                  Import All Games
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Import Single Game */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Gamepad2 className="h-5 w-5 text-green-600" />
              Import Single Game
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Select Game</Label>
              <Select value={selectedGame} onValueChange={setSelectedGame}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a game..." />
                </SelectTrigger>
                <SelectContent>
                  {games?.map((game) => (
                    <SelectItem key={game.id} value={game.id}>
                      {game.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleImportGame}
              disabled={!selectedGame || isLoading}
              className="w-full"
              size="lg"
            >
              {importGameMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importing Game...
                </>
              ) : (
                <>
                  <Gamepad2 className="h-4 w-4 mr-2" />
                  Import Game
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Import Specific Set */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Package className="h-5 w-5 text-purple-600" />
              Import Specific Set
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Select Game</Label>
              <Select value={selectedGame} onValueChange={(value) => {
                setSelectedGame(value);
                setSelectedSet(''); // Reset set selection
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a game..." />
                </SelectTrigger>
                <SelectContent>
                  {games?.map((game) => (
                    <SelectItem key={game.id} value={game.id}>
                      {game.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Select Set</Label>
              <Select 
                value={selectedSet} 
                onValueChange={setSelectedSet}
                disabled={!selectedGame}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a set..." />
                </SelectTrigger>
                <SelectContent>
                  {sets?.map((set) => (
                    <SelectItem key={set.set_id} value={set.set_id}>
                      {set.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <Button
              onClick={handleImportSet}
              disabled={!selectedGame || !selectedSet || isLoading}
              className="w-full"
              size="lg"
            >
              {importSetMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importing Set...
                </>
              ) : (
                <>
                  <Package className="h-4 w-4 mr-2" />
                  Import Set
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Live Sync Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Live Sync Logs
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-slate-950 text-green-400 p-4 rounded-lg font-mono text-sm max-h-64 overflow-y-auto">
            {logs.length === 0 ? (
              <div className="text-slate-400">No sync activity yet...</div>
            ) : (
              logs.map((log, index) => (
                <div key={index} className="mb-1">
                  {log}
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Rate Limiting Info */}
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          <strong>Rate Limiting:</strong> The system respects JustTCG's 500 requests/minute limit with token bucket rate limiting.
          Imports use 200 cards per page for optimal speed within plan limits.
        </AlertDescription>
      </Alert>
    </div>
  );
}