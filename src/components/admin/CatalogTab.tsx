import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Database, 
  RefreshCw, 
  Settings2, 
  ArrowLeft,
  Search,
  Plus,
  RotateCcw,
  AlertCircle,
  Info
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { GameCombobox } from '@/components/ui/game-combobox';
import { SetsList } from '@/components/admin/SetsList';
import { CardsView } from '@/components/admin/CardsView';
import { CatalogResetRebuild } from '@/components/admin/CatalogResetRebuild';
import { type GameMode } from '@/lib/api';

interface Game {
  id: string;
  name: string;
}

interface CatalogTabProps {
  selectedMode: GameMode;
}

export const CatalogTab: React.FC<CatalogTabProps> = ({ selectedMode }) => {
  const { toast } = useToast();
  const [activeView, setActiveView] = useState<'overview' | 'sets' | 'cards' | 'reset'>('overview');
  const [selectedGame, setSelectedGame] = useState('');
  const [selectedSetId, setSelectedSetId] = useState('');
  const [selectedSetName, setSelectedSetName] = useState('');

  // Fetch available games
  const { data: games = [], isLoading: gamesLoading } = useQuery({
    queryKey: ['discover-games'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('discover-games');
      if (error) throw error;
      return data.data as Game[];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const handleDiscoverSets = async () => {
    if (!selectedGame) {
      toast({
        title: "Error",
        description: "Please select a game first",
        variant: "destructive",
      });
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('discover-sets', {
        body: { game: selectedGame }
      });
      
      if (error) throw error;
      
      toast({
        title: "Success",
        description: `Discovered ${data.new_sets} new sets for ${selectedGame}`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || 'Failed to discover sets',
        variant: "destructive",
      });
    }
  };

  const handleBackfillProviderIds = async (force = false) => {
    if (!selectedGame) {
      toast({
        title: "Error", 
        description: "Please select a game first",
        variant: "destructive",
      });
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('backfill-provider-ids', {
        body: { game: selectedGame, force }
      });
      
      if (error) throw error;
      
      toast({
        title: "Success",
        description: `Backfilled ${data.updated} provider IDs for ${selectedGame}`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || 'Failed to backfill provider IDs',
        variant: "destructive",
      });
    }
  };

  const handleSyncGame = async () => {
    if (!selectedGame) {
      toast({
        title: "Error",
        description: "Please select a game first", 
        variant: "destructive",
      });
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('catalog-sync', {
        body: { game: selectedGame }
      });
      
      if (error) throw error;
      
      toast({
        title: "Success", 
        description: `Started full sync for ${selectedGame}`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || 'Failed to start sync',
        variant: "destructive",
      });
    }
  };

  const handleViewCards = (setId: string, setName: string) => {
    setSelectedSetId(setId);
    setSelectedSetName(setName);
    setActiveView('cards');
  };

  const handleBackToSets = () => {
    setActiveView('sets');
    setSelectedSetId('');
    setSelectedSetName('');
  };

  const handleBackToOverview = () => {
    setActiveView('overview');
    setSelectedGame('');
    setSelectedSetId('');
    setSelectedSetName('');
  };

  if (activeView === 'cards' && selectedSetId) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={handleBackToSets}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Sets
          </Button>
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            <h2 className="text-xl font-semibold">Cards in {selectedSetName}</h2>
          </div>
        </div>
        
        <CardsView
          game={selectedGame}
          gameName={games.find(g => g.id === selectedGame)?.name || selectedGame}
          setId={selectedSetId}
          setName={selectedSetName}
          onBack={handleBackToSets}
        />
      </div>
    );
  }

  if (activeView === 'sets' && selectedGame) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={handleBackToOverview}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Overview
          </Button>
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            <h2 className="text-xl font-semibold">
              Sets for {games.find(g => g.id === selectedGame)?.name || selectedGame}
            </h2>
          </div>
        </div>

        <div className="flex gap-2">
          <Button onClick={handleDiscoverSets} variant="outline">
            <Plus className="h-4 w-4 mr-2" />
            Discover New Sets
          </Button>
          <Button onClick={() => handleBackfillProviderIds(false)} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Backfill Provider IDs
          </Button>
          <Button onClick={() => handleBackfillProviderIds(true)} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Force Backfill
          </Button>
          <Button onClick={handleSyncGame} variant="default">
            <RotateCcw className="h-4 w-4 mr-2" />
            Sync Entire Game
          </Button>
        </div>
        
        <SetsList
          game={selectedGame}
          gameName={games.find(g => g.id === selectedGame)?.name || selectedGame}
          onViewCards={handleViewCards}
        />
      </div>
    );
  }

  if (activeView === 'reset') {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={handleBackToOverview}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Overview
          </Button>
          <div className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            <h2 className="text-xl font-semibold">Reset & Rebuild Catalog</h2>
          </div>
        </div>
        
        <CatalogResetRebuild />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Catalog Management
          </CardTitle>
          <CardDescription>
            Discover games, browse sets and cards, sync data, and manage the catalog database.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              This unified catalog interface replaces the previous separate JustTCG Sync page. 
              All catalog operations are now consolidated here.
            </AlertDescription>
          </Alert>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Select Game</label>
              <GameCombobox
                value={selectedGame}
                onChange={setSelectedGame}
                items={games}
                placeholder="Choose a game..."
                inputPlaceholder="Search games..."
                disabled={gamesLoading}
              />
            </div>

            {selectedGame && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Button 
                  onClick={() => setActiveView('sets')}
                  variant="outline"
                  className="h-24 flex flex-col gap-2"
                >
                  <Search className="h-6 w-6" />
                  <span>Browse Sets</span>
                </Button>
                
                <Button 
                  onClick={handleDiscoverSets}
                  variant="outline"
                  className="h-24 flex flex-col gap-2"
                >
                  <Plus className="h-6 w-6" />
                  <span>Discover Sets</span>
                </Button>
                
                <Button 
                  onClick={() => handleBackfillProviderIds(false)}
                  variant="outline"
                  className="h-24 flex flex-col gap-2"
                >
                  <RefreshCw className="h-6 w-6" />
                  <span>Backfill IDs</span>
                </Button>
                
                <Button 
                  onClick={handleSyncGame}
                  variant="default"
                  className="h-24 flex flex-col gap-2"
                >
                  <RotateCcw className="h-6 w-6" />
                  <span>Sync Game</span>
                </Button>
              </div>
            )}
          </div>

          <Separator />

          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Advanced Operations</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Button 
                onClick={() => setActiveView('reset')}
                variant="destructive"
                className="h-24 flex flex-col gap-2"
              >
                <Settings2 className="h-6 w-6" />
                <span>Reset & Rebuild</span>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};