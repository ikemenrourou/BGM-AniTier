import { useSyncExternalStore } from 'react';
import { appStorage, getStorageStatus, subscribeStorage, retryStorage } from '../lib/appStorage';
import { createBackup } from '../lib/backup';

export function downloadBackup(value: unknown, filename: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function StorageStatus() {
  const status = useSyncExternalStore(subscribeStorage, getStorageStatus);
  const problem = /失败|不可用|无法|另一|权限|重启/.test(status);
  return <div data-testid="storage-status" role="status" className={`fixed bottom-2 right-3 z-[100] max-w-lg rounded-xl border px-3 py-2 text-[11px] ${problem ? 'bg-amber-950 text-amber-100 border-amber-400/40' : 'bg-zinc-950/75 text-white/55 border-white/10 opacity-0 hover:opacity-100 focus-within:opacity-100'}`}>
    <span>{status}</span>
    {problem && <div className="mt-1 flex gap-3">
      <button className="underline cursor-pointer" onClick={() => downloadBackup(createBackup(appStorage.snapshot()), 'bgm-anitier-emergency-backup.json')}>导出当前内容</button>
      <button className="underline cursor-pointer" onClick={() => void retryStorage()}>重试保存</button>
    </div>}
  </div>;
}
