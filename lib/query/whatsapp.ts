/**
 * WhatsApp TanStack Query Hooks & Query Keys
 * @file lib/query/whatsapp.ts
 * @description Query hooks for WhatsApp conversations and messages
 * Implements Constitution IV (Cache Integrity) - single cache per entity
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  MutationOptions,
  QueryOptions,
  UseQueryResult,
  UseMutationResult,
} from '@tanstack/react-query';
import {
  WhatsAppConversation,
  WhatsAppMessage,
  ListResponse,
  PaginationMeta,
  WhatsAppSendRequest,
  WhatsAppSendResponse,
} from '@/types/whatsapp';

/**
 * Query key factory for WhatsApp entities
 * Follows TanStack Query conventions
 * Critical: ALL mutations on conversations use queryKeys.whatsapp.conversations.lists()
 * This ensures single cache source (Constitution IV)
 */
export const queryKeys = {
  whatsapp: {
    all: () => ['whatsapp'] as const,
    conversations: {
      all: () => [...queryKeys.whatsapp.all(), 'conversations'] as const,
      lists: () => [
        ...queryKeys.whatsapp.conversations.all(),
        'list',
      ] as const,
      detail: (id: string) =>
        [...queryKeys.whatsapp.conversations.all(), 'detail', id] as const,
      messages: (conversationId: string) =>
        [
          ...queryKeys.whatsapp.conversations.all(),
          'messages',
          conversationId,
        ] as const,
    },
  },
} as const;

/**
 * Fetch all conversations (paginated)
 * @param limit - Items per page (default 20)
 * @param offset - Page offset (default 0)
 * @param search - Optional search filter
 * @param status - Optional status filter
 */
export function useConversations(
  limit: number = 20,
  offset: number = 0,
  search: string = '',
  status: string = ''
): UseQueryResult<ListResponse<WhatsAppConversation>, Error> {
  return useQuery({
    queryKey: queryKeys.whatsapp.conversations.lists(),
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString(),
      });

      if (search) params.append('search', search);
      if (status) params.append('status', status);

      const response = await fetch(
        `/api/whatsapp/conversations?${params.toString()}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch conversations');
      }

      return response.json();
    },
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes (formerly cacheTime)
  });
}

/**
 * Fetch single conversation with messages
 * @param conversationId - Conversation UUID
 * @param messageLimit - Messages per page (default 50)
 * @param messageOffset - Message page offset (default 0)
 */
export function useConversation(
  conversationId: string | null,
  messageLimit: number = 50,
  messageOffset: number = 0
): UseQueryResult<
  { conversation: WhatsAppConversation; messages: WhatsAppMessage[]; meta: PaginationMeta },
  Error
> {
  return useQuery({
    queryKey: queryKeys.whatsapp.conversations.messages(conversationId || ''),
    queryFn: async () => {
      if (!conversationId) throw new Error('No conversation ID');

      const params = new URLSearchParams({
        limit: messageLimit.toString(),
        offset: messageOffset.toString(),
      });

      const response = await fetch(
        `/api/whatsapp/conversations/${conversationId}?${params.toString()}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch conversation');
      }

      return response.json();
    },
    enabled: !!conversationId, // Only run if conversationId is provided
    staleTime: 10 * 1000, // 10 seconds (messages more frequently updated)
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Send message mutation
 * Updates conversation list cache with optimistic update
 * Invalidates single conversation cache when needed
 *
 * Usage:
 * const mutation = useSendWhatsAppMessage();
 * mutation.mutate({ lead_id: "xxx", message: "Hi!" })
 */
export function useSendWhatsAppMessage(
  conversationId?: string
): UseMutationResult<WhatsAppSendResponse, Error, WhatsAppSendRequest> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (request: WhatsAppSendRequest) => {
      const response = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to send message');
      }

      return response.json();
    },

    // Optimistic update: add message to conversation immediately
    onMutate: async (variables: WhatsAppSendRequest) => {
      if (!conversationId) return;

      // Cancel pending queries to prevent race conditions
      await queryClient.cancelQueries({
        queryKey: queryKeys.whatsapp.conversations.messages(conversationId),
      });

      // Get current data
      const previous = queryClient.getQueryData(
        queryKeys.whatsapp.conversations.messages(conversationId)
      );

      // Optimistically add message
      if (previous) {
        queryClient.setQueryData(
          queryKeys.whatsapp.conversations.messages(conversationId),
          (old: any) => ({
            ...old,
            messages: [
              ...old.messages,
              {
                id: 'optimistic-' + Date.now(),
                conversation_id: conversationId,
                direction: 'outbound' as const,
                content: variables.message,
                type: 'text' as const,
                created_at: new Date(),
              },
            ],
            meta: { ...old.meta, total: old.meta.total + 1 },
          })
        );
      }

      return { previous };
    },

    // Rollback on error
    onError: (err, variables, context) => {
      if (context?.previous && conversationId) {
        queryClient.setQueryData(
          queryKeys.whatsapp.conversations.messages(conversationId),
          context.previous
        );
      }
    },

    // Invalidate relevant caches on success
    onSuccess: async (data, variables) => {
      // Invalidate conversation list (message count changed)
      await queryClient.invalidateQueries({
        queryKey: queryKeys.whatsapp.conversations.lists(),
      });

      // Refetch single conversation to get real message ID
      if (conversationId) {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.whatsapp.conversations.messages(conversationId),
        });
      }
    },
  });
}

/**
 * Update conversation status (archive/block)
 * Invalidates both list and detail caches
 */
export function useUpdateConversationStatus(
  conversationId: string
): UseMutationResult<WhatsAppConversation, Error, string> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (status: string) => {
      const response = await fetch(
        `/api/whatsapp/conversations/${conversationId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to update conversation');
      }

      return response.json();
    },

    onSuccess: async () => {
      // Invalidate list cache (status changed)
      await queryClient.invalidateQueries({
        queryKey: queryKeys.whatsapp.conversations.lists(),
      });

      // Invalidate detail cache
      await queryClient.invalidateQueries({
        queryKey: queryKeys.whatsapp.conversations.messages(conversationId),
      });
    },
  });
}

/**
 * Invalidate all conversation caches
 * Use when doing a hard refresh or after offline sync
 */
export function useInvalidateConversations() {
  const queryClient = useQueryClient();

  return () => {
    return queryClient.invalidateQueries({
      queryKey: queryKeys.whatsapp.conversations.all(),
    });
  };
}

/**
 * Prefetch conversation list (for optimized navigation)
 * Useful when user hovers over navigation link
 */
export function usePrefetchConversations(
  limit: number = 20,
  offset: number = 0
) {
  const queryClient = useQueryClient();

  return () => {
    return queryClient.prefetchQuery({
      queryKey: queryKeys.whatsapp.conversations.lists(),
      queryFn: async () => {
        const params = new URLSearchParams({
          limit: limit.toString(),
          offset: offset.toString(),
        });

        const response = await fetch(
          `/api/whatsapp/conversations?${params.toString()}`
        );

        if (!response.ok) {
          throw new Error('Failed to prefetch conversations');
        }

        return response.json();
      },
    });
  };
}
