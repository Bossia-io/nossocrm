/**
 * WhatsApp Conversations List Endpoint
 * @file app/api/whatsapp/conversations/route.ts
 * @description Fetch paginated list of conversations for organization
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import {
  WhatsAppConversation,
  ListResponse,
  PaginationMeta,
} from '@/types/whatsapp';

/**
 * GET /api/whatsapp/conversations
 *
 * Query parameters:
 * - limit: number (default 20, max 100)
 * - offset: number (default 0)
 * - search: string (optional, searches phone or contact name)
 * - status: 'active' | 'archived' | 'blocked' (optional)
 *
 * Response:
 * {
 *   "data": [ {...conversation}, ... ],
 *   "meta": {
 *     "offset": 0,
 *     "limit": 20,
 *     "total": 42,
 *     "hasMore": true
 *   }
 * }
 */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    // =========== Step 1: Extract Organization Context ===========
    const organizationId = request.headers.get('x-organization-id');

    if (!organizationId) {
      logger.warn('No organization context in conversations list request');
      return NextResponse.json(
        { error: 'Missing organization context' },
        { status: 400 }
      );
    }

    // =========== Step 2: Parse Query Parameters ===========
    const limit = Math.min(
      parseInt(request.nextUrl.searchParams.get('limit') || '20'),
      100
    ); // Cap at 100
    const offset = parseInt(request.nextUrl.searchParams.get('offset') || '0');
    const search = request.nextUrl.searchParams.get('search') || '';
    const status = request.nextUrl.searchParams.get('status') || '';

    if (limit < 1 || limit > 100 || offset < 0) {
      return NextResponse.json(
        { error: 'Invalid pagination parameters' },
        { status: 400 }
      );
    }

    // =========== Step 3: Build Query ===========
    const supabase = await createClient();

    let query = supabase
      .from('whatsapp_conversations')
      .select(
        `
        *,
        lead:leads(id, name, email, phone),
        whatsapp_messages(content, direction, created_at, id)
      `,
        { count: 'exact' }
      )
      .eq('organization_id', organizationId)
      .order('last_message_at', { ascending: false, nullsFirst: false });

    // Apply status filter
    if (status && ['active', 'archived', 'blocked'].includes(status)) {
      query = query.eq('status', status);
    }

    // Apply search filter (phone or contact name)
    if (search) {
      query = query.or(
        `phone.ilike.%${search}%,lead->name.ilike.%${search}%`
      );
    }

    // =========== Step 4: Execute Query ===========
    const { data, error, count } = await query.range(offset, offset + limit - 1);

    if (error) {
      logger.error('Error fetching conversations list', error);
      return NextResponse.json(
        { error: 'Failed to fetch conversations' },
        { status: 500 }
      );
    }

    // =========== Step 5: Format Response ===========
    const conversations = (data || []) as WhatsAppConversation[];
    const total = count || 0;
    const hasMore = offset + limit < total;

    const meta: PaginationMeta = {
      offset,
      limit,
      total,
      hasMore,
    };

    const response: ListResponse<WhatsAppConversation> = {
      data: conversations,
      meta,
    };

    logger.info(
      `Fetched ${conversations.length}/${total} conversations for org ${organizationId}`
    );

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    logger.error('Unexpected error in conversations list endpoint', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
