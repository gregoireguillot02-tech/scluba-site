// Browser-side Supabase client + helpers to subscribe to a round's tables.
//
// Uses the public anon key (safe to ship to the browser). RLS policies on the
// rounds / round_players / scores tables (migration 0005) allow anon SELECT,
// which is what Realtime requires for the subscriber to receive change events.

import { createClient, type RealtimeChannel } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.PUBLIC_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string | undefined;

let _client: ReturnType<typeof createClient> | null = null;

export function browserClient() {
  if (_client) return _client;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Missing PUBLIC_SUPABASE_URL or PUBLIC_SUPABASE_ANON_KEY');
  }
  _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 10 } },
  });
  return _client;
}

export interface RoundSubscriptionCallbacks {
  onRoundUpdate?: (row: Record<string, unknown>) => void;
  onPlayersChange?: (event: 'INSERT' | 'UPDATE' | 'DELETE', row: Record<string, unknown>) => void;
  onScoresChange?: (event: 'INSERT' | 'UPDATE' | 'DELETE', row: Record<string, unknown>) => void;
}

export function subscribeToRound(
  roundId: string,
  cb: RoundSubscriptionCallbacks,
  // Optional suffix to distinguish multiple independent subscriptions
  // to the same round from the same page (e.g. live-board + score-entry
  // both want their own onScoresChange handler — Supabase channels need
  // unique names to avoid handler collisions).
  channelSuffix?: string,
): RealtimeChannel {
  const sb = browserClient();
  const channelName = channelSuffix ? `round:${roundId}:${channelSuffix}` : `round:${roundId}`;
  const channel = sb.channel(channelName);

  if (cb.onRoundUpdate) {
    channel.on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'rounds', filter: `id=eq.${roundId}` },
      (payload) => cb.onRoundUpdate!(payload.new as Record<string, unknown>),
    );
  }

  if (cb.onPlayersChange) {
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'round_players', filter: `round_id=eq.${roundId}` },
      (payload) => {
        const row = (payload.new ?? payload.old) as Record<string, unknown>;
        cb.onPlayersChange!(payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE', row);
      },
    );
  }

  if (cb.onScoresChange) {
    // scores doesn't have a round_id column; we filter client-side via the player_id list.
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'scores' },
      (payload) => {
        const row = (payload.new ?? payload.old) as Record<string, unknown>;
        cb.onScoresChange!(payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE', row);
      },
    );
  }

  channel.subscribe();
  return channel;
}

export function unsubscribeFromRound(channel: RealtimeChannel) {
  const sb = browserClient();
  sb.removeChannel(channel);
}
