'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { MessageSquare, Loader2, AlertCircle, CheckCircle, QrCode, Trash2, RefreshCw } from 'lucide-react';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/context/AuthContext';
import { createClient } from '@/lib/supabase/client';

interface WhatsAppConfig {
  whatsapp_provider: 'baileys' | 'meta' | null;
  whatsapp_config: {
    meta_token?: string;
    meta_phone_id?: string;
    baileys_connected?: boolean;
    baileys_session?: string;
  };
}

export function WhatsAppSection() {
  const { profile } = useAuth();
  const { addToast } = useToast();
  const supabase = createClient();

  const [config, setConfig] = useState<WhatsAppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [provider, setProvider] = useState<'baileys' | 'meta'>('baileys');
  const [metaToken, setMetaToken] = useState('');
  const [metaPhoneId, setMetaPhoneId] = useState('');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    if (!supabase || !profile?.id) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('organization_settings')
        .select('whatsapp_provider, whatsapp_config')
        .eq('organization_id', profile.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        setConfig(data as WhatsAppConfig);
        setProvider(data.whatsapp_provider || 'baileys');
        if (data.whatsapp_config?.meta_token) {
          setMetaToken(data.whatsapp_config.meta_token);
        }
        if (data.whatsapp_config?.meta_phone_id) {
          setMetaPhoneId(data.whatsapp_config.meta_phone_id);
        }
      }
    } catch (error) {
      console.error('Error loading WhatsApp config:', error);
      addToast('Erro ao carregar configurações do WhatsApp', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleConnectBaileys = async () => {
    setIsConnecting(true);
    try {
      const response = await fetch('/api/whatsapp/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'baileys',
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Falha ao conectar');
      }

      const { qr_code } = await response.json();
      setQrCode(qr_code);
      addToast('Escaneie o QR Code com seu WhatsApp', 'info');
    } catch (error) {
      console.error('Error connecting Baileys:', error);
      addToast('Erro ao conectar WhatsApp', 'error');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleSaveMeta = async () => {
    if (!metaToken || !metaPhoneId) {
      addToast('Token e ID de telefone são obrigatórios', 'error');
      return;
    }

    setSaving(true);
    try {
      if (!supabase || !profile?.id) {
        throw new Error('Supabase client not available');
      }

      const { error } = await supabase
        .from('organization_settings')
        .upsert({
          organization_id: profile.id,
          whatsapp_provider: 'meta',
          whatsapp_config: {
            meta_token: metaToken,
            meta_phone_id: metaPhoneId,
          },
        })
        .eq('organization_id', profile.id);

      if (error) throw error;

      setConfig({
        whatsapp_provider: 'meta',
        whatsapp_config: {
          meta_token: metaToken,
          meta_phone_id: metaPhoneId,
        },
      });

      addToast('Configuração do Meta WhatsApp salva com sucesso', 'success');
    } catch (error) {
      console.error('Error saving Meta config:', error);
      addToast('Erro ao salvar configuração', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Tem certeza que deseja desconectar o WhatsApp?')) return;

    setSaving(true);
    try {
      if (!supabase || !profile?.id) {
        throw new Error('Supabase client not available');
      }

      const { error } = await supabase
        .from('organization_settings')
        .update({
          whatsapp_provider: null,
          whatsapp_config: null,
        })
        .eq('organization_id', profile.id);

      if (error) throw error;

      setConfig(null);
      setQrCode(null);
      setMetaToken('');
      setMetaPhoneId('');
      addToast('WhatsApp desconectado', 'success');
    } catch (error) {
      console.error('Error disconnecting:', error);
      addToast('Erro ao desconectar', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
          <MessageSquare className="w-5 h-5 text-green-600 dark:text-green-400" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Configuração WhatsApp</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Conecte seu WhatsApp para enviar e receber mensagens
          </p>
        </div>
      </div>

      {/* Status */}
      {config?.whatsapp_provider && (
        <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="font-medium text-green-900 dark:text-green-100">
              WhatsApp Conectado ({config.whatsapp_provider === 'baileys' ? 'Baileys' : 'Meta'})
            </p>
            <p className="text-sm text-green-700 dark:text-green-200">
              Você pode enviar e receber mensagens
            </p>
          </div>
          <button
            onClick={handleDisconnect}
            disabled={saving}
            className="px-3 py-2 text-sm bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/40 rounded-lg transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Provider Selection */}
      <div className="space-y-4">
        <label className="block text-sm font-medium text-slate-900 dark:text-white">
          Escolha um provedor
        </label>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Baileys Option */}
          <button
            onClick={() => setProvider('baileys')}
            className={`p-4 rounded-xl border-2 text-left transition-all ${
              provider === 'baileys'
                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                : 'border-slate-200 dark:border-white/10 bg-white dark:bg-dark-card hover:border-slate-300 dark:hover:border-white/20'
            }`}
          >
            <h4 className="font-bold text-slate-900 dark:text-white mb-2">Baileys (Recomendado)</h4>
            <ul className="text-sm text-slate-600 dark:text-slate-300 space-y-1">
              <li>✓ Sem necessidade de conta Meta</li>
              <li>✓ Rápido para começar</li>
              <li>✓ Perfeito para MVP</li>
            </ul>
          </button>

          {/* Meta Option */}
          <button
            onClick={() => setProvider('meta')}
            className={`p-4 rounded-xl border-2 text-left transition-all ${
              provider === 'meta'
                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                : 'border-slate-200 dark:border-white/10 bg-white dark:bg-dark-card hover:border-slate-300 dark:hover:border-white/20'
            }`}
          >
            <h4 className="font-bold text-slate-900 dark:text-white mb-2">Meta/WhatsApp API</h4>
            <ul className="text-sm text-slate-600 dark:text-slate-300 space-y-1">
              <li>✓ Oficial e confiável</li>
              <li>✓ Para produção</li>
              <li>✓ Suporte 24/7</li>
            </ul>
          </button>
        </div>
      </div>

      {/* Baileys Connection */}
      {provider === 'baileys' && !config?.whatsapp_provider && (
        <div className="space-y-4">
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
            <div className="text-sm text-blue-900 dark:text-blue-100">
              Ao conectar, você precisará escanear um QR Code com seu WhatsApp pessoal.
            </div>
          </div>
          
          {qrCode ? (
            <div className="space-y-4">
              <div className="p-4 bg-white dark:bg-dark-card rounded-lg">
                <p className="text-sm font-medium text-slate-900 dark:text-white mb-3">
                  Escaneie com seu WhatsApp:
                </p>
                <div className="bg-white p-4 rounded-lg w-fit">
                  <Image
                    src={qrCode}
                    alt="QR Code para WhatsApp"
                    width={256}
                    height={256}
                    unoptimized
                  />
                </div>
              </div>
              <button
                onClick={() => setQrCode(null)}
                className="w-full px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              onClick={handleConnectBaileys}
              disabled={isConnecting}
              className="w-full px-4 py-3 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 font-medium"
            >
              {isConnecting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Conectando...
                </>
              ) : (
                <>
                  <QrCode className="w-4 h-4" />
                  Gerar QR Code
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* Meta Configuration */}
      {provider === 'meta' && !config?.whatsapp_provider && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">
              Token de Acesso Meta
            </label>
            <input
              type="password"
              value={metaToken}
              onChange={(e) => setMetaToken(e.target.value)}
              placeholder="Seu token de acesso Meta/WhatsApp"
              className="w-full px-4 py-2 border border-slate-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5 text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              <a href="https://developers.facebook.com/" target="_blank" rel="noopener noreferrer" className="text-primary-500 hover:underline">
                Obter em developers.facebook.com
              </a>
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">
              ID do Telefone Meta
            </label>
            <input
              type="text"
              value={metaPhoneId}
              onChange={(e) => setMetaPhoneId(e.target.value)}
              placeholder="Seu ID de telefone Meta"
              className="w-full px-4 py-2 border border-slate-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5 text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <button
            onClick={handleSaveMeta}
            disabled={saving || !metaToken || !metaPhoneId}
            className="w-full px-4 py-3 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 font-medium"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Salvando...
              </>
            ) : (
              'Salvar Configuração'
            )}
          </button>
        </div>
      )}

      {/* Info */}
      {!config?.whatsapp_provider && (
        <div className="p-4 bg-slate-50 dark:bg-slate-900/20 rounded-lg text-sm text-slate-600 dark:text-slate-300">
          <p className="font-medium mb-2">Precisa de ajuda?</p>
          <ul className="space-y-1 text-xs">
            <li>• Para Baileys: Simplesmente clique em "Gerar QR Code"</li>
            <li>• Para Meta: Acesse sua conta de desenvolvedor Meta</li>
            <li>• Ambas as opções permitem enviar e receber mensagens</li>
          </ul>
        </div>
      )}
    </div>
  );
}
