import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';

// 获取后端 API 基地址
function getApiBase(): string {
  if (typeof window === 'undefined') return '';
  // 本地开发 → NestJS 后端；生产环境（含 Wujie 沙箱）→ 主站域名（nginx 转发到后端）
  return window.location.hostname === 'localhost'
    ? 'http://localhost:3001'
    : 'https://zwg.autos';
}

// 将相对路径的图片 URL 补全为可访问的完整 URL
function resolveImageUrl(url: string | null | undefined): string {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  const base = getApiBase();
  return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  imageUrl?: string;
  isStreaming?: boolean;
  cartoonUrl?: string;
  isCartoonMock?: boolean;
}

// 简易 Markdown → HTML（不引入额外依赖）
function renderMarkdown(text: string): string {
  return text
    .replace(/### (.*?)(\n|$)/g, '<h3>$1</h3>')
    .replace(/## (.*?)(\n|$)/g, '<h2>$1</h2>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/^> (.*?)(\n|$)/gm, '<blockquote>$1</blockquote>')
    .replace(/^- (.*?)(\n|$)/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]*<\/li>)/g, '<ul>$1</ul>')
    .replace(/---/g, '<hr/>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br/>');
}

// 快捷提问按钮
const QUICK_PROMPTS = [
  { label: '📐 构图分析', prompt: '请详细分析这张照片的构图技巧' },
  { label: '🎨 色彩点评', prompt: '请分析这张照片的色彩运用和色调' },
  { label: '💡 光影解读', prompt: '请分析这张照片的光线和影调处理' },
  { label: '📝 生成标题', prompt: '请为这张照片生成 3 个有创意的标题和 SEO 描述' },
  { label: '⭐ 综合评分', prompt: '请从构图、色彩、光影、情感四个维度给这张照片打分(1-10)并说明理由' },
];

export default function AiAssistant() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isCartoonLoading, setIsCartoonLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastReceivedPhotoRef = useRef<string | null>(null); // 去重：同一张图只处理一次

  // 接收照片的统一处理函数
  const handleReceivePhoto = useCallback((photoUrl: string) => {
    // 去重：同一张图片的重试消息只处理第一次
    if (lastReceivedPhotoRef.current === photoUrl) return;
    lastReceivedPhotoRef.current = photoUrl;

    setSelectedImage(photoUrl);
    setImageUrl(photoUrl);
    // 自动添加系统消息
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      role: 'system',
      content: '已选择照片，请输入问题或使用下方快捷提问 👇',
      imageUrl: photoUrl,
    }]);
  }, []);

  // 方式1：通过 postMessage 从主应用接收图片 URL（iframe 模式 + Wujie 模式）
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'SELECT_PHOTO' && e.data?.imageUrl) {
        handleReceivePhoto(e.data.imageUrl);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [handleReceivePhoto]);

  // 方式2：通过 Wujie bus 接收（生产环境备用）
  useEffect(() => {
    const wujie = (window as any).__WUJIE;
    if (wujie?.bus) {
      const handler = (photoUrl: string) => handleReceivePhoto(photoUrl);
      wujie.bus.$on('select-photo', handler);
      return () => wujie.bus.$off('select-photo', handler);
    }
  }, [handleReceivePhoto]);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = useCallback(async (prompt?: string) => {
    const text = prompt || input.trim();
    const img = imageUrl || selectedImage;

    if (!text && !img) return;
    if (isLoading) return;

    // 添加用户消息
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text || '请分析这张照片',
      imageUrl: img || undefined,
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    // 准备 AI 消息占位
    const aiMsgId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, {
      id: aiMsgId,
      role: 'assistant',
      content: '',
      isStreaming: true,
    }]);

    try {
      // 构建历史记录（最近 6 条）
      const history = messages
        .filter(m => m.role !== 'system')
        .slice(-6)
        .map(m => ({
          role: m.role,
          content: m.content,
        }));

      const res = await fetch(`${getApiBase()}/api/ai/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: img || '',
          prompt: text,
          history,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No reader');

      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          if (data === '[DONE]') break;

          try {
            const parsed = JSON.parse(data);
            if (parsed.error) throw new Error(parsed.error);
            if (parsed.content) {
              fullContent += parsed.content;
              setMessages(prev => prev.map(m =>
                m.id === aiMsgId ? { ...m, content: fullContent } : m
              ));
            }
          } catch (e) {
            if ((e as Error).message && !(e as Error).message.includes('JSON')) throw e;
          }
        }
      }

      // 标记流结束
      setMessages(prev => prev.map(m =>
        m.id === aiMsgId ? { ...m, isStreaming: false } : m
      ));
    } catch (error: any) {
      setMessages(prev => prev.map(m =>
        m.id === aiMsgId
          ? { ...m, content: `⚠️ 分析失败：${error.message || '请稍后重试'}`, isStreaming: false }
          : m
      ));
    } finally {
      setIsLoading(false);
    }
  }, [input, imageUrl, selectedImage, isLoading, messages]);

  // 生成卡通图片
  const generateCartoon = useCallback(async () => {
    const img = imageUrl || selectedImage;
    if (!img || isCartoonLoading) return;

    setIsCartoonLoading(true);

    // 添加用户消息
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      role: 'user',
      content: '🎨 生成卡通风格图片',
      imageUrl: img,
    }]);

    // AI 占位消息
    const aiMsgId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, {
      id: aiMsgId,
      role: 'assistant',
      content: '🎨 正在生成卡通风格图片，请稍候...',
      isStreaming: true,
    }]);

    try {
      const res = await fetch(`${getApiBase()}/api/ai/cartoon`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: img }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();

      setMessages(prev => prev.map(m =>
        m.id === aiMsgId
          ? {
              ...m,
              content: data.message,
              cartoonUrl: data.cartoonUrl,
              isCartoonMock: data.isMock,
              isStreaming: false,
            }
          : m
      ));
    } catch (error: any) {
      setMessages(prev => prev.map(m =>
        m.id === aiMsgId
          ? { ...m, content: `⚠️ 卡通图片生成失败：${error.message || '请稍后重试'}`, isStreaming: false }
          : m
      ));
    } finally {
      setIsCartoonLoading(false);
    }
  }, [imageUrl, selectedImage, isCartoonLoading]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50" style={{ overscrollBehavior: 'contain' }}>
      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3" style={{ overscrollBehavior: 'contain' }}>
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-6 gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-sky-400 to-blue-500 flex items-center justify-center shadow-lg shadow-sky-500/20">
              <span className="text-2xl">🤖</span>
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-700">AI 摄影助手</h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                选择一张照片或输入图片 URL，<br/>
                我来帮你分析构图、色彩、光影
              </p>
            </div>

            {/* URL 输入 */}
            <div className="w-full mt-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="粘贴图片 URL..."
                  value={imageUrl}
                  onChange={e => setImageUrl(e.target.value)}
                  className="flex-1 px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400/30 transition-all"
                />
                {imageUrl && (
                  <button
                    onClick={() => sendMessage('请全面分析这张照片')}
                    className="px-3 py-2 bg-sky-500 text-white text-xs font-bold rounded-xl hover:bg-sky-600 transition-colors shrink-0"
                  >
                    分析
                  </button>
                )}
              </div>
            </div>

            {/* 提示 */}
            <p className="text-[10px] text-slate-300 mt-2">
              💡 也可以从主页点击照片后发送到这里分析
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
              msg.role === 'user'
                ? 'bg-sky-500 text-white rounded-br-md'
                : msg.role === 'system'
                ? 'bg-sky-50 text-sky-600 border border-sky-100 text-xs'
                : 'bg-white text-slate-700 border border-slate-100 shadow-sm rounded-bl-md'
            }`}>
              {/* 图片缩略图 */}
              {msg.imageUrl && (
                <div className="mb-2 rounded-lg overflow-hidden border border-white/20">
                  <img
                    src={resolveImageUrl(msg.imageUrl)}
                    alt=""
                    className="w-full max-h-32 object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                </div>
              )}

              {/* 卡通图片展示 */}
              {msg.cartoonUrl && (
                <div className="mb-2 rounded-lg overflow-hidden border border-sky-200 shadow-sm">
                  <img
                    src={resolveImageUrl(msg.cartoonUrl)}
                    alt="Cartoon"
                    className={`w-full max-h-48 object-cover ${
                      msg.isCartoonMock
                        ? 'saturate-[1.8] contrast-[1.4] brightness-[1.05] hue-rotate-[10deg]'
                        : ''
                    }`}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                  {msg.isCartoonMock && (
                    <div className="bg-sky-50 px-2 py-1 text-[10px] text-sky-500 text-center font-medium">
                      卡通滤镜效果 · 配置 API Key 后可生成 AI 卡通图
                    </div>
                  )}
                </div>
              )}

              {/* 消息内容 */}
              {msg.role === 'assistant' ? (
                <div className={msg.isStreaming ? 'typing-cursor' : ''}>
                  <div
                    className="ai-markdown text-[13px]"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content || '思考中...') }}
                  />
                </div>
              ) : (
                <span className="text-[13px]">{msg.content}</span>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* 快捷提问 */}
      {selectedImage && !isLoading && !isCartoonLoading && (
        <div className="px-3 pb-2">
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1">
            {/* 卡通生成按钮 - 特殊样式 */}
            <button
              onClick={generateCartoon}
              disabled={isCartoonLoading}
              className="shrink-0 px-3 py-1.5 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl text-[11px] font-bold text-white hover:from-purple-600 hover:to-pink-600 transition-all shadow-sm shadow-purple-500/20 disabled:opacity-50"
            >
              {isCartoonLoading ? '⏳ 生成中...' : '🖼️ 生成卡通'}
            </button>
            {QUICK_PROMPTS.map((q) => (
              <button
                key={q.label}
                onClick={() => sendMessage(q.prompt)}
                className="shrink-0 px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-[11px] font-medium text-slate-500 hover:bg-sky-50 hover:border-sky-200 hover:text-sky-600 transition-all"
              >
                {q.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 输入区域 */}
      <div className="border-t border-slate-200 bg-white p-3">
        {/* 图片预览卡片 */}
        {selectedImage && (
          <div className="flex items-start gap-3 mb-3 p-2 rounded-xl bg-gradient-to-r from-sky-50 to-blue-50 border border-sky-100">
            <img
              src={resolveImageUrl(selectedImage)}
              alt="预览"
              className="w-[60px] h-[60px] rounded-lg object-cover border border-sky-200 shadow-sm flex-shrink-0"
            />
            <div className="flex-1 min-w-0 py-1">
              <p className="text-xs font-medium text-slate-700 truncate">当前分析照片</p>
              <p className="text-[10px] text-slate-400 mt-0.5">输入问题或使用快捷提问开始 AI 构图分析</p>
            </div>
            <button
              onClick={() => { setSelectedImage(null); setImageUrl(''); lastReceivedPhotoRef.current = null; }}
              className="flex-shrink-0 mt-1 w-5 h-5 rounded-full bg-slate-200/80 hover:bg-red-100 text-slate-400 hover:text-red-500 flex items-center justify-center transition-colors"
              title="移除图片"
            >
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3">
                <line x1="4" y1="4" x2="12" y2="12" />
                <line x1="12" y1="4" x2="4" y2="12" />
              </svg>
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={selectedImage ? '描述你想分析的内容...' : '粘贴图片 URL 或输入问题...'}
            rows={1}
            className="flex-1 px-3 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400/30 resize-none transition-all max-h-20"
            style={{ minHeight: '36px' }}
          />
          <button
            onClick={() => sendMessage()}
            disabled={isLoading || (!input.trim() && !imageUrl && !selectedImage)}
            className={`p-2 rounded-xl transition-all shrink-0 ${
              isLoading
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                : 'bg-sky-500 text-white hover:bg-sky-600 shadow-sm shadow-sky-500/20'
            }`}
          >
            {isLoading ? (
              <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="32" className="opacity-25" />
                <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
              </svg>
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
