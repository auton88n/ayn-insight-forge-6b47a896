import { useState, useMemo } from 'react';
import { MessageSquare, Search, RefreshCw, User, Bot, ChevronDown, ChevronRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useAdminConversations, useAdminUserMessages } from '@/admin-app/hooks/useAdminQuery';

interface UserConvo {
  user_id: string; display_name: string; email: string; auth_provider: string;
  message_count: number; last_message: string; first_message: string;
}
interface Message {
  id: string; content: string; sender: string; created_at: string; mode_used: string | null;
}

export const ConversationViewer = () => {
  const { data: rawData, isLoading: loading } = useAdminConversations();
  const users = useMemo(() => (rawData || []).map((r: any) => ({
    user_id: r.user_id,
    display_name: r.display_name || r.email?.split('@')[0] || r.user_id?.slice(0,8),
    email: r.email || '',
    auth_provider: r.auth_provider || 'email',
    message_count: Number(r.message_count),
    last_message: r.last_message_at,
    first_message: r.last_message_at,
  })) as UserConvo[], [rawData]);

  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserConvo | null>(null);

  const { data: rawMessages, isLoading: loadingMsgs } = useAdminUserMessages(selectedUser?.user_id || null);
  const messages = useMemo(() => (Array.isArray(rawMessages) ? rawMessages : []) as Message[], [rawMessages]);

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    return !q || u.display_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  function timeStr(d: string) {
    return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white font-semibold text-lg flex items-center gap-2"><MessageSquare className="w-5 h-5 text-blue-400" />Conversation Viewer</h2>
          <p className="text-white/30 text-sm">{users.length} users with conversations</p>
        </div>
        <button onClick={fetchUsers} disabled={loading} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4 h-[600px]">
        {/* User list */}
        <div className="flex flex-col gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <Input placeholder="Search users..." value={search} onChange={e => setSearch(e.target.value)}
              className="pl-9 bg-white/5 border-white/10 text-white placeholder-white/30 h-9 text-sm" />
          </div>
          <div className="flex-1 overflow-y-auto space-y-1 pr-1">
            {loading ? <div className="text-center py-8 text-white/30 text-sm">Loading...</div>
            : filtered.map(u => (
              <button key={u.user_id} onClick={() => setSelectedUser(u)}
                className={`w-full text-left px-3 py-2.5 rounded-xl transition-colors ${selectedUser?.user_id === u.user_id ? 'bg-white/10 border border-white/15' : 'bg-white/3 border border-white/6 hover:bg-white/6'}`}>
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-white/50 text-xs flex-shrink-0">
                    {(u.display_name)[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-white/80 text-xs font-medium truncate">{u.display_name}</div>
                    <div className="text-white/30 text-xs">{u.message_count} messages</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Messages panel */}
        <div className="col-span-2 bg-white/2 border border-white/8 rounded-xl flex flex-col overflow-hidden">
          {!selectedUser ? (
            <div className="flex-1 flex items-center justify-center text-white/20 text-sm">Select a user to view their conversation</div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-white/8 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/50 text-sm">
                  {selectedUser.display_name[0].toUpperCase()}
                </div>
                <div>
                  <div className="text-white text-sm font-medium">{selectedUser.display_name}</div>
                  <div className="text-white/30 text-xs">{selectedUser.email} · {selectedUser.message_count} messages</div>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {loadingMsgs ? <div className="text-center py-8 text-white/30 text-sm">Loading messages...</div>
                : messages.length === 0 ? <div className="text-center py-8 text-white/30 text-sm">No messages found</div>
                : messages.map(m => {
                  const isUser = m.sender === 'user';
                  return (
                    <div key={m.id} className={`flex gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
                      {!isUser && <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0 mt-1"><Bot className="w-3 h-3 text-blue-400" /></div>}
                      <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${isUser ? 'bg-white/10 text-white/80 rounded-tr-sm' : 'bg-blue-500/10 text-white/70 rounded-tl-sm'}`}>
                        <div className="whitespace-pre-wrap break-words">{m.content?.slice(0, 500)}{(m.content?.length || 0) > 500 ? '…' : ''}</div>
                        <div className={`text-xs mt-1 ${isUser ? 'text-white/20 text-right' : 'text-white/20'}`}>{timeStr(m.created_at)}</div>
                      </div>
                      {isUser && <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0 mt-1"><User className="w-3 h-3 text-white/40" /></div>}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
