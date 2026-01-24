/**
 * WhatsApp Single Conversation Endpoint
 * @file app/api/whatsapp/conversations/[id]/route.ts
 * @description Fetch single conversation with messages (paginated)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import {
  WhatsAppConversation,
  WhatsAppMessage,
  ListResponse,
  PaginationMeta,
} from '@/types/whatsapp';

interface ConversationResponse {
  conversation: WhatsAppConversation;
  messages: WhatsAppMessage[];
  meta: PaginationMeta;
}

/**
 * GET /api/whatsapp/conversations/[id]
 *
 * URL parameters:
 * - id: conversation UUID
 *
 * Query parameters:
 * - limit: number (default 50, max 200)
 * - offset: number (default 0)
 *
 * Response:
 * {
 *   "conversation": {...},
 *   "messages": [...],
 *   "meta": { "offset": 0, "limit": 50, "total": 120, "hasMore": true }
 * }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<Response> {
  try {
    const conversationId = params.id;

    // =========== Step 1: Extract Organization Context ===========
    const organizationId = request.headers.get('x-organization-id');

    if (!organizationId) {
      logger.warn(
        `No organization context in conversation detail request for ${conversationId}`
      );
      return NextResponse.json(
        { error: 'Missing organization context' },
        { status: 400 }
      );
    }

    // =========== Step 2: Parse Query Parameters ===========
    const limit = Math.min(
      parseInt(request.nextUrl.searchParams.get('limit') || '50'),
      200
    );
    const offset = parseInt(request.nextUrl.searchParams.get('offset') || '0');

    if (limit < 1 || limit > 200 || offset < 0) {
      return NextResponse.json(
        { error: 'Invalid pagination parameters' },
        { status: 400 }
      );
    }

    // =========== Step 3: Fetch Conversation ===========
    const supabase = await createClient();

    const { data: conversation, error: convError } = await supabase
      .from('whatsapp_conversations')
      .select(
        `
        *,
        lead:leads(id, name, email, phone)
      `
      )
      .eq('id', conversationId)
      .eq('organization_id', organizationId)
      .single();

    if (convError || !conversation) {
      logger.warn(
        `Conversation ${conversationId} not found in org ${organizationId}`
      );
      return NextResponse.json(
        { error: 'Conversation not found or unauthorized' },
        { status: 404 }
      );
    }

    // =========== Step 4: Fetch Messages ===========
    const { data: messages, error: msgError, count } = await supabase
      .from('whatsapp_messages')
      .select('*', { count: 'exact' })
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (msgError) {
      logger.error('Error fetching conversation messages', msgError);
      return NextResponse.json(
        { error: 'Failed to fetch messages' },
        { status: 500 }
      );
    }

    // =========== Step 5: Format Response ===========
    const total = count || 0;
    const hasMore = offset + limit < total;

    // Reverse message order to show oldest first (chronological)
    const reversedMessages = (messages || []).reverse();

    const meta: PaginationMeta = {
      offset,
      limit,
      total,
      hasMore,
    };

    const response: ConversationResponse = {
      conversation: conversation as WhatsAppConversation,
      messages: reversedMessages as WhatsAppMessage[],
      meta,
    };

    logger.info(
      `Fetched conversation ${conversationId} with ${reversedMessages.length}/${total} messages for org ${organizationId}`
    );

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    logger.error('Unexpected error in conversation detail endpoint', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/whatsapp/conversations/[id]
 * Update conversation status (archive/block)
 *
 * Request body:
 * {
 *   "status": "active" | "archived" | "blocked"
 * }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<Response> {
  try {
    const conversationId = params.id;

    const organizationId = request.headers.get('x-organization-id');

    if (!organizationId) {
      return NextResponse.json(
        { error: 'Missing organization context' },
        { status: 400 }
      );
    }

    const { status } = await request.json();

    if (!status || !['active', 'archived', 'blocked'].includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Verify conversation exists and belongs to org
    let existing: any = null;
    try {
      const response = await supabase
        .from('whatsapp_conversations')
        .select('id')
        .eq('id', conversationId)
        .eq('organization_id', organizationId)
        .single();
      existing = response.data;
    } catch (err) {
      // Record not found or error occurred
      logger.debug('Conversation lookup error', err);
    }

    if (!existing) {
      return NextResponse.json(
        { error: 'Conversation not found or unauthorized' },
        { status: 404 }
      );
    }

    // Update status
    const { data: updated, error } = await supabase
      .from('whatsapp_conversations')
      .update({ status })
      .eq('id', conversationId)
      .select()
      .single();

    if (error) {
      logger.error(`Error updating conversation ${conversationId}`, error);
      return NextResponse.json(
        { error: 'Failed to update conversation' },
        { status: 500 }
      );
    }

    logger.info(
      `Conversation ${conversationId} updated to status: ${status}`
    );

    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    logger.error('Unexpected error in conversation update endpoint', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
