          {/* Bottom Intelligence Stream */}
          <div className="h-[280px] xl:h-[320px] flex gap-4 shrink-0">
            
            {/* Active Discussion Feed */}
            <div className="flex-1 as-glass rounded-[32px] flex flex-col min-h-0 overflow-hidden">
              <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-white/[0.01]">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[7.5px] font-mono text-purple-400/60 uppercase font-black tracking-widest">Live Intelligence Protocol</span>
                  <h4 className="text-[11px] font-black text-white/90 truncate max-w-[400px]">{activeConv?.topic || 'Listening for global signals...'}</h4>
                </div>
                {conversations.length > 0 && (
                  <div className="flex gap-1.5">
                    {conversations.slice(0, 4).map(conv => (
                      <button key={conv.id} onClick={() => setActiveConvId(conv.id)}
                        className={`w-2.5 h-2.5 rounded-full transition-all ${activeConvId===conv.id?'bg-purple-500 scale-110':'bg-white/10 hover:bg-white/20'}`}
                        title={conv.topic || 'Archived Stream'}/>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex-1 relative min-h-0">
                <div className="absolute inset-0 overflow-y-auto as-scroll p-6 space-y-2">
                  {loadingMsgs ? (
                    <div className="h-full flex items-center justify-center opacity-10 text-[11px] font-mono tracking-[0.5em] uppercase">Decrypting Neural Stream</div>
                  ) : (
                    <AnimatePresence initial={false}>
                      {visibleMessages.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center opacity-20 text-center py-10 gap-2">
                           <span className="text-3xl">��</span>
                           <p className="text-[10px] font-mono uppercase tracking-widest">Awaiting First Transmission</p>
                        </div>
                      ) : (
                        <>
                          {visibleMessages.map((msg, i) => <AgentMessage key={msg.id} msg={msg} idx={i}/>)}
                          <div ref={msgsEnd} className="h-4"/>
                        </>
                      )}
                    </AnimatePresence>
                  )}
                </div>
              </div>
            </div>

            {/* Intervention Panel */}
            <div className={`w-[340px] xl:w-[420px] rounded-[32px] overflow-hidden transition-all duration-500 ${showGodEye?'as-glass bg-amber-500/[0.03] border-amber-500/20 shadow-[0_0_80px_rgba(251,191,36,0.05)]':'as-glass opacity-40 grayscale pointer-events-none'}`}>
               <div className="h-full p-6 flex flex-col gap-4">
                 <div className="flex items-center gap-3">
                   <span className="text-[10px] font-black text-amber-400 uppercase tracking-[0.2em] italic">👁 God's Eye Console</span>
                   <div className="flex-1 h-px bg-amber-400/20"/>
                 </div>
                 <p className="text-[10px] font-mono text-white/40 leading-relaxed">
                   Authorized users can manually inject narrative catalysts into the simulation. All nodes will attempt to re-contextualize their internal models based on this stimulus.
                 </p>
                 <div className="flex-1"/>
                 <div className="relative group">
                    <div className="absolute -inset-1 bg-amber-500/20 rounded-2xl blur opacity-0 group-focus-within:opacity-100 transition-opacity"/>
                    <textarea value={godEyeInput} onChange={e => setGodEyeInput(e.target.value)}
                      onKeyDown={e => e.key==='Enter' && !e.shiftKey && injectGodEye()}
                      placeholder="Input event catalyst... (e.g. A global silicon shortage hits all AI clusters)"
                      className="relative w-full h-24 bg-black/60 text-[11px] font-mono text-white border border-white/10 rounded-2xl px-5 py-4 outline-none focus:border-amber-400/40 transition-all resize-none placeholder:text-white/10"/>
                 </div>
                 <button onClick={injectGodEye} disabled={generating || !godEyeInput.trim()}
                    className="w-full py-4 rounded-2xl bg-amber-400 font-black text-black text-[10px] uppercase tracking-[0.2em] disabled:opacity-20 hover:bg-amber-300 transition-all shadow-xl shadow-amber-400/10">
                    Propagate Event
                 </button>
               </div>
            </div>
          </div>
        </div>
      </div>

      {/* Direct Interview Portal (Agent Chat) */}
      <AnimatePresence>
        {chatAgent && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
            className="fixed inset-0 z-[500] flex items-center justify-center p-8"
            style={{background:'rgba(0,0,0,0.92)',backdropFilter:'blur(8px)'}}>
            <motion.div initial={{scale:0.9,opacity:0,y:40}} animate={{scale:1,opacity:1,y:0}} exit={{scale:0.9,opacity:0,y:40}}
              className="w-full max-w-[800px] as-glass rounded-[48px] overflow-hidden flex flex-col shadow-[0_64px_256px_rgba(0,0,0,1)] border-white/10"
              style={{maxHeight:'90vh'}}>
              
              {/* Portal Header */}
              <div className="px-10 py-8 border-b border-white/5 flex items-center gap-8 bg-white/[0.02]">
                <div className="w-20 h-20 as-glass rounded-2xl flex items-center justify-center text-5xl shrink-0 shadow-2xl">
                  {chatAgent.agent_flag || '🌐'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1.5">
                    <h3 className="text-2xl font-black text-white tracking-tight">{chatAgent.agent_name}</h3>
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse ml-2"/>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-[10px] font-mono text-purple-400 font-black uppercase tracking-[0.2em]">Bi-directional Secure Link</span>
                    <span className="text-[9px] font-mono text-white/20 uppercase">{chatAgent.agent_category?.replace(/_/g,' ')}</span>
                  </div>
                </div>
                <button onClick={() => {setChatAgent(null); setChatHistory([]);}} className="w-12 h-12 rounded-full as-glass flex items-center justify-center text-white/20 hover:text-white hover:border-white/20 transition-all">✕</button>
              </div>

              {/* Secure Stream (History) */}
              <div className="flex-1 overflow-y-auto as-scroll p-10 space-y-8 bg-black/40 min-h-[400px]">
                {chatHistory.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center text-center opacity-10 py-20 gap-6">
                     <div className="text-7xl">🔭</div>
                     <p className="text-[14px] font-mono uppercase tracking-[0.4em] max-w-sm">Direct neural handshake complete. Awaiting interrogation parameters.</p>
                  </div>
                )}
                <AnimatePresence initial={false}>
                  {chatHistory.map((m, i) => (
                    <motion.div initial={{opacity:0,y:20,scale:0.95}} animate={{opacity:1,y:0,scale:1}} key={i}
                      className={`flex ${m.role==='user'?'justify-end':'justify-start'}`}>
                      <div className={`max-w-[85%] rounded-[28px] px-8 py-5 text-[13px] font-mono leading-relaxed shadow-lg ${m.role==='user'?'bg-purple-600/10 border border-purple-500/30 text-purple-50 shadow-purple-900/10':'bg-white/5 border border-white/10 text-white/80'}`}>
                        <div className="text-[9px] font-black uppercase tracking-[0.2em] mb-3 opacity-30 flex items-center gap-2">
                          {m.role==='user' ? '► USER_QUERY' : '◄ AGENT_RESPONSE'}
                          <div className={`h-1 w-1 rounded-full ${m.role==='user'?'bg-purple-400':'bg-white/40'}`}/>
                        </div>
                        {m.content}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-white/5 border border-white/10 rounded-[28px] px-10 py-6 flex gap-2 items-center">
                      <div className="w-2 h-2 bg-purple-400/80 rounded-full animate-bounce"/>
                      <div className="w-2 h-2 bg-purple-400/80 rounded-full animate-bounce" style={{animationDelay:'0.2s'}}/>
                      <div className="w-2 h-2 bg-purple-400/80 rounded-full animate-bounce" style={{animationDelay:'0.4s'}}/>
                    </div>
                  </div>
                )}
              </div>

              {/* Secure Input Bar */}
              <div className="p-10 bg-white/[0.01] border-t border-white/5">
                <div className="relative group">
                  <div className="absolute -inset-1 bg-gradient-to-r from-purple-600/20 to-indigo-600/20 rounded-[32px] blur opacity-0 group-focus-within:opacity-100 transition-opacity duration-500"/>
                  <div className="relative flex gap-4">
                    <input autoFocus value={chatInput} onChange={e => setChatInput(e.target.value)}
                      onKeyDown={e => e.key==='Enter' && !e.shiftKey && chatWithAgent()}
                      placeholder={`Interview ${chatAgent.agent_name.split(' ')[0]} about systemic conditions...`}
                      className="flex-1 bg-black/60 border border-white/10 rounded-[28px] px-8 py-6 text-[14px] font-mono text-white outline-none focus:border-purple-500/40 transition-all placeholder:text-white/10"/>
                    <button onClick={chatWithAgent} disabled={chatLoading || !chatInput.trim()}
                      className="px-12 rounded-[28px] bg-white text-black text-[12px] font-black uppercase tracking-[0.2em] disabled:opacity-30 hover:bg-white/90 active:scale-95 transition-all shadow-2xl shadow-white/5">
                      {chatLoading ? 'Sync...' : 'Send'}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
