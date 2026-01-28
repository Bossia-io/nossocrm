'use client';

import { useEffect, useState } from 'react';
import { MessageSquare, Send, Phone, MapPin, AlertCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface WhatsAppConversation {
  id: string;
  wa_id: string;
  lead_id: string | null;
  contact_id: string | null;
  created_at: string;
  updated_at: string;
  last_message?: string;
  contact?: {
    name: string;
    phone: string;
  };
  lead?: {
    name: string;
    phone: string;
  };
}

interface WhatsAppMessage {
  id: string;
  conversation_id: string;
  from_wa_id: string;
  content: string;
  direction: 'inbound' | 'outbound';
  created_at: string;
  status?: string;
}

export default function WhatsAppConversationsPage() {
  const router = useRouter();
  const supabase = createClient();
  
  const [conversations, setConversations] = useState<WhatsAppConversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<WhatsAppConversation | null>(null);
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [messageText, setMessageText] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);

  // Load conversations on mount
  useEffect(() => {
    loadConversations();
  }, []);

  // Load messages when conversation is selected
  useEffect(() => {
    if (selectedConversation) {
      loadMessages(selectedConversation.id);
    }
  }, [selectedConversation]);

  const loadConversations = async () => {
    setLoading(true);
    try {
      if (!supabase) {
        throw new Error('Supabase client not available');
      }
      const { data, error } = await supabase
        .from('whatsapp_conversations')
        .select(`
          *,
          contact:contacts(*),
          lead:leads(*)
        `)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setConversations(data || []);
      
      // Auto-select first conversation
      if (data && data.length > 0) {
        setSelectedConversation(data[0]);
      }
    } catch (error) {
      console.error('Error loading conversations:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (conversationId: string) => {
    try {
      if (!supabase) {
        throw new Error('Supabase client not available');
      }
      const { data, error } = await supabase
        .from('whatsapp_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages(data || []);
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim() || !selectedConversation) return;

    setSendingMessage(true);
    try {
      const response = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: selectedConversation.id,
          message: messageText,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to send message');
      }

      setMessageText('');
      // Reload messages
      loadMessages(selectedConversation.id);
    } catch (error) {
      console.error('Error sending message:', error);
      alert('Erro ao enviar mensagem');
    } finally {
      setSendingMessage(false);
    }
  };

  const getDisplayName = (conv: WhatsAppConversation) => {
    if (conv.contact?.name) return conv.contact.name;
    if (conv.lead?.name) return conv.lead.name;
    return conv.wa_id;
  };

  const getDisplayPhone = (conv: WhatsAppConversation) => {
    if (conv.contact?.phone) return conv.contact.phone;
    if (conv.lead?.phone) return conv.lead.phone;
    return conv.wa_id;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-120px)] gap-4 p-4">
      {/* Conversation List */}
      <div className="w-80 border border-slate-200 dark:border-white/10 rounded-xl bg-white dark:bg-dark-card overflow-hidden flex flex-col">
        <div className="border-b border-slate-200 dark:border-white/10 p-4">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-primary-500" />
            Conversas WhatsApp
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {conversations.length} conversa{conversations.length !== 1 ? 's' : ''}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="p-4 text-center text-slate-500 dark:text-slate-400">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>Nenhuma conversa ainda</p>
            </div>
          ) : (
            conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => setSelectedConversation(conv)}
                className={`w-full p-4 border-b border-slate-100 dark:border-white/5 text-left transition-colors ${
                  selectedConversation?.id === conv.id
                    ? 'bg-primary-50 dark:bg-primary-950'
                    : 'hover:bg-slate-50 dark:hover:bg-white/5'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 dark:text-white truncate">
                      {getDisplayName(conv)}
                    </p>
                    <p className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-1">
                      <Phone className="w-3 h-3" />
                      {getDisplayPhone(conv)}
                    </p>
                    {conv.last_message && (
                      <p className="text-xs text-slate-600 dark:text-slate-300 truncate mt-1">
                        {conv.last_message}
                      </p>
                    )}
                  </div>
                  <div className="text-xs text-slate-400">
                    {new Date(conv.updated_at).toLocaleDateString('pt-BR')}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 border border-slate-200 dark:border-white/10 rounded-xl bg-white dark:bg-dark-card overflow-hidden flex flex-col">
        {selectedConversation ? (
          <>
            {/* Header */}
            <div className="border-b border-slate-200 dark:border-white/10 p-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  {getDisplayName(selectedConversation)}
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <Phone className="w-4 h-4" />
                  {getDisplayPhone(selectedConversation)}
                </p>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 dark:bg-black/20">
              {messages.length === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-400">
                  <div className="text-center">
                    <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>Nenhuma mensagem nesta conversa</p>
                  </div>
                </div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                        msg.direction === 'outbound'
                          ? 'bg-primary-500 text-white rounded-br-none'
                          : 'bg-white dark:bg-dark-card border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white rounded-bl-none'
                      }`}
                    >
                      <p className="text-sm">{msg.content}</p>
                      <p className={`text-xs mt-1 ${
                        msg.direction === 'outbound'
                          ? 'text-primary-100'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}>
                        {new Date(msg.created_at).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Message Input */}
            <div className="border-t border-slate-200 dark:border-white/10 p-4">
              <form onSubmit={handleSendMessage} className="flex gap-2">
                <input
                  type="text"
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder="Digite sua mensagem..."
                  disabled={sendingMessage}
                  className="flex-1 px-4 py-2 border border-slate-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5 text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <button
                  type="submit"
                  disabled={sendingMessage || !messageText.trim()}
                  className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  {sendingMessage ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="h-full flex items-center justify-center text-slate-400">
            <div className="text-center">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>Selecione uma conversa para começar</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
