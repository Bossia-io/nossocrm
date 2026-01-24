/**
 * WhatsApp Provider Factory
 * @file lib/whatsapp/provider.ts
 * @description Strategy pattern factory for WhatsApp providers (Baileys, Meta)
 * Server-only module
 */

import 'server-only';

import { createHmac, timingSafeEqual } from 'crypto';
import { createStaticAdminClient } from '@/lib/supabase/server';
import {
  WhatsAppProvider,
  WhatsAppProviderType,
  WhatsAppSettings,
} from '@/types/whatsapp';
import { logger } from '@/lib/logger';
import { getBaileysProvider } from '@/lib/whatsapp/client';
// import { getMetaProvider } from '@/lib/whatsapp/providers/meta'; // P2 future

/**
 * Get or initialize WhatsApp provider for organization
 * Implements strategy pattern - supports multiple providers with same interface
 *
 * @param organizationId - Organization UUID
 * @returns Provider instance (Baileys or Meta depending on org settings)
 */
export async function getProvider(
  organizationId: string
): Promise<WhatsAppProvider> {
  // Load provider settings from organization_settings
  const supabase = createStaticAdminClient();

  let settings: any = null;
  let error: any = null;

  try {
    const response = await supabase
      .from('organization_settings')
      .select('whatsapp_provider, whatsapp_config')
      .eq('organization_id', organizationId)
      .single();
    settings = response.data;
    error = response.error;
  } catch (e) {
    error = e;
  }

  if (error || !settings) {
    // Fallback to default provider (Baileys for MVP)
    logger.warn(
      `No WhatsApp settings found for org ${organizationId}, using default (baileys)`
    );
    const provider = getBaileysProvider();
    await provider.connect(organizationId);
    return provider;
  }

  const providerType: WhatsAppProviderType =
    (settings?.whatsapp_provider as WhatsAppProviderType) || 'baileys';

  switch (providerType) {
    case 'baileys':
      logger.info(`Loading Baileys provider for org ${organizationId}`);
      const baileysProvider = getBaileysProvider();
      await baileysProvider.connect(organizationId);
      return baileysProvider;

    case 'meta':
      // P2 future: Implement Meta Cloud API
      logger.info(`Loading Meta provider for org ${organizationId}`);
      // const metaProvider = getMetaProvider();
      // await metaProvider.connect(organizationId);
      // return metaProvider;

      // For now, fallback to Baileys
      const provider = getBaileysProvider();
      await provider.connect(organizationId);
      return provider;

    default:
      throw new Error(`Unknown WhatsApp provider type: ${providerType}`);
  }
}

/**
 * Verify webhook signature (HMAC)
 * Used to validate that webhook came from provider
 *
 * @param payload - Raw webhook payload body
 * @param signature - Signature header from webhook
 * @param secret - Organization's webhook secret
 * @returns true if signature is valid
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  // Use timingSafeEqual to prevent timing attacks
  const expectedSignature = createHmac('sha256', secret)
    .update(payload)
    .digest('base64');

  try {
    return timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (error) {
    // timingSafeEqual throws if lengths don't match
    logger.warn('Webhook signature length mismatch');
    return false;
  }
}

/**
 * Initialize all providers for organization
 * Called on app startup (or lazy-loaded per org)
 *
 * @param organizationId - Organization UUID
 */
export async function initializeProviders(
  organizationId: string
): Promise<void> {
  try {
    await getProvider(organizationId);
    logger.info(`Providers initialized for org ${organizationId}`);
  } catch (error) {
    logger.error(
      `Failed to initialize providers for org ${organizationId}`,
      error
    );
    throw error;
  }
}

/**
 * Disconnect all providers (graceful shutdown)
 *
 * @param organizationId - Organization UUID
 */
export async function disconnectProviders(
  organizationId: string
): Promise<void> {
  try {
    const provider = await getProvider(organizationId);
    await provider.disconnect();
    logger.info(`Providers disconnected for org ${organizationId}`);
  } catch (error) {
    logger.error(
      `Failed to disconnect providers for org ${organizationId}`,
      error
    );
  }
}
