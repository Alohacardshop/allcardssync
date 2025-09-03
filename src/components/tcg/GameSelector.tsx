import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useGames } from '@/hooks/useTCGData';

interface GameSelectorProps {
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  includeAllOption?: boolean;
}

export function GameSelector({ 
  value, 
  onValueChange, 
  placeholder = "Select a game...",
  includeAllOption = true 
}: GameSelectorProps) {
  const { data: games = [], isLoading } = useGames();

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {includeAllOption && (
          <SelectItem value="all">All Games</SelectItem>
        )}
        {isLoading ? (
          <SelectItem value="" disabled>Loading games...</SelectItem>
        ) : (
          games.map((game) => (
            <SelectItem key={game.id} value={game.slug}>
              {game.name}
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
}