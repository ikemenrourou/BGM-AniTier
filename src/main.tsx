import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initializeStorage } from './lib/appStorage';
import { StorageStatus } from './components/StorageStatus';

const root = createRoot(document.getElementById('root')!);
root.render(<div className="min-h-screen bg-zinc-950 text-white/70 grid place-items-center">正在恢复本地数据…</div>);
void initializeStorage().then(() => root.render(
  <StrictMode><App /><StorageStatus /></StrictMode>,
)).catch(() => root.render(
  <div className="min-h-screen bg-zinc-950 text-white grid place-items-center">读取存档失败，原始数据未删除。请关闭其他页面后重试。</div>,
));
