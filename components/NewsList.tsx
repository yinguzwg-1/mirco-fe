import React from 'react';
import { Newspaper, ExternalLink, Clock } from 'lucide-react';

const MOCK_NEWS = [
  {
    id: 1,
    title: "Next.js 15 正式发布：带来全新的缓存机制",
    summary: "Next.js 15 引入了异步请求 API、改进的缓存策略以及对 React 19 的全面支持。",
    time: "2小时前111",
    source: "前端头条"
  },
  {
    id: 2,
    title: "React 19 稳定版：Actions 与新 Hooks 解析",
    summary: "React 19 引入了 useActionState, useFormStatus 等新 Hooks，极大简化了表单处理。",
    time: "5小时前",
    source: "技术社区"
  }
];

export default function NewsList() {
  return (
    <div className="flex flex-col h-full bg-white text-slate-900 overflow-hidden border-l border-slate-200 shadow-2xl">
      {/* Header */}
      <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <Newspaper className="w-5 h-5 text-rose-500" />
          <h2 className="font-bold text-lg">前端实时新闻</h2>
        </div>
        <span className="text-xs bg-rose-100 text-rose-600 px-2 py-0.5 rounded-full font-medium">LIVE</span>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {MOCK_NEWS.map((news) => (
          <div 
            key={news.id} 
            className="group p-3 rounded-xl border border-slate-100 hover:border-rose-200 hover:bg-rose-50/30 transition-all cursor-pointer"
          >
            <div className="flex justify-between items-start mb-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{news.source}</span>
              <div className="flex items-center gap-1 text-[10px] text-slate-400">
                <Clock className="w-3 h-3" />
                {news.time}
              </div>
            </div>
            <h3 className="font-bold text-sm group-hover:text-rose-600 transition-colors mb-2 line-clamp-2">
              {news.title}
            </h3>
            <p className="text-xs text-slate-500 line-clamp-3 leading-relaxed">
              {news.summary}
            </p>
            <div className="mt-3 flex items-center text-[10px] font-bold text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity">
              阅读全文 <ExternalLink className="w-3 h-3 ml-1" />
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-slate-100 bg-slate-50 text-center">
        <p className="text-[10px] text-slate-400">
          数据由 Micro Frontend News Service 提供
        </p>
      </div>
    </div>
  );
}
