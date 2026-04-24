import { useState, useCallback, useEffect } from 'react';
import { supabaseApi } from '@/lib/supabaseApi';

interface UsePinnedChatsReturn {
  pinnedChats: Set<string>;
  isLoading: boolean;
  togglePin: (sessionId: string, e?: React.MouseEvent) => Promise<void>;
  isPinned: (sessionId: string) => boolean;
}

/**
 * Hook to manage pinned chats using the database (favorite_chats table)
 * This replaces the localStorage-based implementation for cross-device sync
 */
export const usePinnedChats = (
  userId: string | undefined,
  accessToken: string | undefined
): UsePinnedChatsReturn => {
  const [pinnedChats, setPinnedChats] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);

  // Load pinned chats from database on mount
  useEffect(() => {
    const loadPinnedChats = async () => {
      if (!userId || !accessToken) {
        setIsLoading(false);
        return;
      }

      try {
        const data = await supabaseApi.get<Array<{ session_id: string }>>(
          `favorite_chats?user_id=eq.${userId}&select=session_id`,
          accessToken
        );

        if (data && data.length > 0) {
          setPinnedChats(new Set(data.map(item => item.session_id)));
        }
      } catch (error) {
        console.error('[usePinnedChats] Error loading pinned chats:', error);
        // Fallback to localStorage for migration
        const stored = localStorage.getItem('pinnedChats');
        if (stored) {
          try {
            setPinnedChats(new Set(JSON.parse(stored)));
          } catch {
            // Invalid localStorage data
          }
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadPinnedChats();
  }, [userId, accessToken]);

  // Migrate localStorage pins to database on first load
  useEffect(() => {
    const migrateLocalStoragePins = async () => {
      if (!userId || !accessToken || isLoading) return;

      const stored = localStorage.getItem('pinnedChats');
      if (!stored) return;

      try {
        const localPins: string[] = JSON.parse(stored);
        if (localPins.length === 0) return;

        // Only migrate pins that aren't already in the database
        const pinsToMigrate = localPins.filter(pin => !pinnedChats.has(pin));
        
        if (pinsToMigrate.length > 0) {
          // Insert missing pins into database
          await Promise.all(
            pinsToMigrate.map(sessionId =>
              supabaseApi.post(
                'favorite_chats',
                accessToken,
                {
                  user_id: userId,
                  session_id: sessionId,
                  chat_title: 'Pinned Chat',
                  chat_data: {}
                }
              )
            )
          );

          // Update local state
          setPinnedChats(prev => {
            const newSet = new Set(prev);
            pinsToMigrate.forEach(pin => newSet.add(pin));
            return newSet;
          });
        }

        // Clear localStorage after successful migration
        localStorage.removeItem('pinnedChats');
      } catch (error) {
        console.error('[usePinnedChats] Migration error:', error);
        // Keep localStorage as fallback if migration fails
      }
    };

    migrateLocalStoragePins();
  }, [userId, accessToken, isLoading, pinnedChats]);

  // Toggle pin status for a chat session
  const togglePin = useCallback(async (sessionId: string, e?: React.MouseEvent) => {
    // Stop event propagation if called from a click handler
    e?.stopPropagation();
    
    if (!userId || !accessToken) return;

    const currentlyPinned = pinnedChats.has(sessionId);

    // Optimistic update
    setPinnedChats(prev => {
      const newSet = new Set(prev);
      if (currentlyPinned) {
        newSet.delete(sessionId);
      } else {
        newSet.add(sessionId);
      }
      return newSet;
    });

    try {
      if (currentlyPinned) {
        // Remove from database
        await supabaseApi.delete(
          `favorite_chats?user_id=eq.${userId}&session_id=eq.${sessionId}`,
          accessToken
        );
      } else {
        // Add to database
        await supabaseApi.post(
          'favorite_chats',
          accessToken,
          {
            user_id: userId,
            session_id: sessionId,
            chat_title: 'Pinned Chat',
            chat_data: {}
          }
        );
      }
    } catch (error) {
      console.error('[usePinnedChats] Toggle error:', error);
      // Revert optimistic update on failure
      setPinnedChats(prev => {
        const newSet = new Set(prev);
        if (currentlyPinned) {
          newSet.add(sessionId);
        } else {
          newSet.delete(sessionId);
        }
        return newSet;
      });
    }
  }, [userId, accessToken, pinnedChats]);

  // Check if a session is pinned
  const isPinned = useCallback((sessionId: string) => {
    return pinnedChats.has(sessionId);
  }, [pinnedChats]);

  return {
    pinnedChats,
    isLoading,
    togglePin,
    isPinned
  };
};
