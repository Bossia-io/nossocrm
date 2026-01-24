/**
 * WhatsApp Webhook Receive Endpoint
 * @file app/api/whatsapp/receive/route.ts
 * @description Webhook endpoint for incoming WhatsApp messages
 * Accepts POST from Baileys or Meta, validates, and queues for processing
 */

import { NextRequest, NextResponse } from 'next/server';
import { whatsappService } from '@/lib/whatsapp/service';
import { verifyWebhookSignature, getProvider } from '@/lib/whatsapp/provider';
import { createServerClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';

/**
 * Webhook payload from Meta (example structure)
 * Baileys uses a different format but is normalized to similar structure
 */
interface WebhookBody {
  object: string; // "whatsapp_business_account"
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: string; // "whatsapp"
        metadata: {
          display_phone_number: string;
          phone_number_id: string;
        };
        messages?: Array<{
          from: string; // Sender's phone number
          id: string; // Unique message ID
          timestamp: string;
          text?: { body: string };
          type: string; // "text", "image", etc.
        }>;
        statuses?: Array<{
          id: string;
          status: string;
          timestamp: string;
          recipient_id: string;
        }>;
      };
    }>;
  }>;
}

/**
 * POST /api/whatsapp/receive
 * Webhook endpoint for incoming messages
 *
 * Accepts both Meta Cloud API and Baileys webhook formats
 * Returns 200 immediately (async processing via job queue)
 * Validates HMAC signature for security
 */
export async function POST(request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7);
  const timestamp = new Date().toISOString();

  logger.info(`[${requestId}] Webhook received at ${timestamp}`);

  try {
    // =========== Step 1: Extract Organization Context ===========
    // For now, we assume webhook includes org ID (Phase 2 enhancement)
    // In production, this would be extracted from:
    // - Query parameter: ?organization_id=xxx
    // - Custom header: X-Organization-ID
    // - Webhook configuration with per-org webhook URLs

    const organizationId = request.nextUrl.searchParams.get('organization_id');
    if (!organizationId) {
      logger.warn(
        `[${requestId}] No organization_id in webhook query parameters`
      );
      return NextResponse.json(
        { error: 'Missing organization_id' },
        { status: 400 }
      );
    }

    // =========== Step 2: Parse Request Body ===========
    const rawBody = await request.text();
    let body: WebhookBody;

    try {
      body = JSON.parse(rawBody);
    } catch (error) {
      logger.error(`[${requestId}] Failed to parse webhook body`, error);
      return NextResponse.json(
        { error: 'Invalid JSON' },
        { status: 400 }
      );
    }

    logger.debug(`[${requestId}] Webhook body parsed`, {
      messageCount: body.entry?.[0]?.changes?.[0]?.value?.messages?.length || 0,
    });

    // =========== Step 3: Verify Webhook Signature (Meta) ===========
    // Get webhook secret from org settings
    const supabase = createServerClient();
    const { data: settings } = await supabase
      .from('organization_settings')
      .select('whatsapp_webhook_secret')
      .eq('organization_id', organizationId)
      .single()
      .catch(() => ({ data: null }));

    const webhookSecret = settings?.whatsapp_webhook_secret;

    if (webhookSecret) {
      // Verify signature if secret is configured
      const signature = request.headers.get('x-hub-signature-256');

      if (!signature) {
        logger.warn(`[${requestId}] Missing webhook signature header`);
        return NextResponse.json(
          { error: 'Missing signature' },
          { status: 401 }
        );
      }

      const isValid = verifyWebhookSignature(rawBody, signature, webhookSecret);

      if (!isValid) {
        logger.error(
          `[${requestId}] Webhook signature verification failed`,
        );
        return NextResponse.json(
          { error: 'Invalid signature' },
          { status: 401 }
        );
      }

      logger.debug(`[${requestId}] Webhook signature verified`);
    } else {
      logger.warn(
        `[${requestId}] No webhook secret configured for org, skipping signature verification`
      );
    }

    // =========== Step 4: Return 200 Immediately ===========
    // All webhook processing happens asynchronously
    // Return 200 to acknowledge receipt (don't hold connection open)

    // Queue response early - don't wait for processing
    const response = NextResponse.json(
      { success: true, request_id: requestId },
      { status: 200 }
    );

    // =========== Step 5: Process Webhook Asynchronously ===========
    // Use Promise.catch() to handle errors without blocking response
    (async () => {
      try {
        await processWebhookAsync(body, organizationId, requestId);
        logger.info(`[${requestId}] Webhook processing completed successfully`);
      } catch (error) {
        logger.error(`[${requestId}] Webhook processing failed`, error);
        // Error is logged but not returned to client (webhook already returned 200)
      }
    })();

    return response;
  } catch (error) {
    logger.error(`[${requestId}] Unexpected error in webhook endpoint`, error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Process webhook asynchronously (after returning 200 to caller)
 * @param body - Parsed webhook body
 * @param organizationId - Organization context
 * @param requestId - Unique request identifier for logging
 */
async function processWebhookAsync(
  body: WebhookBody,
  organizationId: string,
  requestId: string
): Promise<void> {
  try {
    // Extract messages from webhook payload
    const messages = body.entry?.[0]?.changes?.[0]?.value?.messages || [];

    if (!messages.length) {
      logger.debug(`[${requestId}] No messages in webhook payload`);
      return;
    }

    logger.info(`[${requestId}] Processing ${messages.length} message(s)`);

    // Process each message
    for (const msg of messages) {
      try {
        await whatsappService.receiveMessage(
          msg.from, // sender's phone number
          msg.text?.body || '[Non-text message]', // message content
          msg.id, // unique message ID (for idempotency)
          organizationId
        );

        logger.debug(
          `[${requestId}] Message ${msg.id} processed successfully`
        );
      } catch (error) {
        logger.error(
          `[${requestId}] Failed to process message ${msg.id}`,
          error
        );
        // Continue processing other messages even if one fails
      }
    }
  } catch (error) {
    logger.error(`[${requestId}] Error in processWebhookAsync`, error);
    throw error;
  }
}

/**
 * GET /api/whatsapp/receive
 * Webhook verification endpoint (Meta requires this for webhook configuration)
 * Meta sends: ?hub.mode=subscribe&hub.challenge=xxx&hub.verify_token=yyy
 */
export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get('hub.mode');
  const challenge = request.nextUrl.searchParams.get('hub.challenge');
  const verifyToken = request.nextUrl.searchParams.get('hub.verify_token');

  // TODO: Store verify token in organization settings and compare
  const expectedVerifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

  if (mode === 'subscribe' && verifyToken === expectedVerifyToken) {
    logger.info('Webhook verification successful');
    return new Response(challenge, { status: 200 });
  } else {
    logger.warn('Webhook verification failed - invalid token');
    return NextResponse.json(
      { error: 'Webhook verification failed' },
      { status: 403 }
    );
  }
}
