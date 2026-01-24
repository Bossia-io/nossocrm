/**
 * WhatsApp Send Message Endpoint
 * @file app/api/whatsapp/send/route.ts
 * @description Send message to WhatsApp contact
 * Accepts POST with leadId and message content
 */

import { NextRequest, NextResponse } from 'next/server';
import { whatsappService } from '@/lib/whatsapp/service';
import { createServerClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';

interface SendRequest {
  lead_id: string;
  message: string;
}

interface SendResponse {
  success: boolean;
  message_id?: string;
  error?: string;
}

/**
 * POST /api/whatsapp/send
 * Send message to WhatsApp contact associated with a lead
 *
 * Request body:
 * {
 *   "lead_id": "uuid",
 *   "message": "Hello!"
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "message_id": "wamid.xxxxx"
 * }
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    // =========== Step 1: Extract Organization Context ===========
    const supabase = createServerClient();

    // Get organization from auth context (assumes auth middleware sets this)
    // In a real scenario, this would be extracted from user session or header
    const organizationIdHeader = request.headers.get('x-organization-id');

    if (!organizationIdHeader) {
      logger.warn('No X-Organization-ID header in send request');
      return NextResponse.json(
        { error: 'Missing organization context' },
        { status: 400 }
      );
    }

    // =========== Step 2: Parse Request Body ===========
    let payload: SendRequest;

    try {
      payload = await request.json();
    } catch (error) {
      logger.error('Failed to parse send request body', error);
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    const { lead_id, message } = payload;

    // =========== Step 3: Validate Input ===========
    if (!lead_id || !message) {
      logger.warn('Missing required fields in send request', {
        lead_id: !!lead_id,
        message: !!message,
      });

      return NextResponse.json(
        {
          error: 'Missing required fields',
          details: { lead_id: !lead_id, message: !message },
        },
        { status: 400 }
      );
    }

    if (typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json(
        { error: 'Message must be non-empty string' },
        { status: 400 }
      );
    }

    if (message.length > 1000) {
      return NextResponse.json(
        { error: 'Message exceeds 1000 character limit' },
        { status: 400 }
      );
    }

    // =========== Step 4: Verify Lead Exists and Belongs to Org ===========
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('id, wa_id')
      .eq('id', lead_id)
      .eq('organization_id', organizationIdHeader)
      .single()
      .catch(() => ({ data: null }));

    if (leadError || !lead) {
      logger.warn(`Lead ${lead_id} not found in org ${organizationIdHeader}`);
      return NextResponse.json(
        { error: 'Lead not found or unauthorized' },
        { status: 404 }
      );
    }

    if (!lead.wa_id) {
      logger.warn(`Lead ${lead_id} does not have WhatsApp ID`);
      return NextResponse.json(
        { error: 'Lead does not have WhatsApp contact' },
        { status: 400 }
      );
    }

    // =========== Step 5: Send Message via Service ===========
    let messageId: string;

    try {
      messageId = await whatsappService.sendMessage(
        lead_id,
        message.trim(),
        organizationIdHeader
      );

      logger.info(
        `Message sent to lead ${lead_id} in org ${organizationIdHeader}. Message ID: ${messageId}`
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      logger.error(
        `Failed to send message to lead ${lead_id}`,
        error
      );

      return NextResponse.json(
        { error: 'Failed to send message', details: errorMessage },
        { status: 500 }
      );
    }

    // =========== Step 6: Return Success ===========
    const response: SendResponse = {
      success: true,
      message_id: messageId,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    logger.error('Unexpected error in send endpoint', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
