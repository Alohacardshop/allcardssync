import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  getJustTCGApiKey,
  fetchGames,
  type GameDTO
} from "../_shared/providers/justtcg.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return new Response("Method Not Allowed", { 
      status: 405, 
      headers: corsHeaders 
    });
  }

  try {
    const apiKey = await getJustTCGApiKey();
    const games = await fetchGames(apiKey);
    
    // Transform to UI-friendly format
    const gameOptions = games.map((game: GameDTO) => ({
      value: game.id,
      label: game.name,
      active: game.active !== false
    }));

    return new Response(
      JSON.stringify({ 
        games: gameOptions,
        total: gameOptions.length
      }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );

  } catch (error: any) {
    console.error('Failed to fetch games:', error);
    
    // Fallback to default games if API fails
    const fallbackGames = [
      { value: 'pokemon', label: 'Pokémon', active: true },
      { value: 'pokemon-japan', label: 'Pokémon Japan', active: true },
      { value: 'mtg', label: 'Magic: The Gathering', active: true },
      { value: 'lorcana', label: 'Lorcana', active: true },
      { value: 'one-piece', label: 'One Piece', active: true },
      { value: 'dragon-ball-super', label: 'Dragon Ball Super', active: true },
      { value: 'flesh-and-blood', label: 'Flesh and Blood', active: true }
    ];
    
    return new Response(
      JSON.stringify({ 
        games: fallbackGames,
        total: fallbackGames.length,
        fallback: true,
        error: error?.message || String(error)
      }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );
  }
});