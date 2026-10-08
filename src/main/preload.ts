import { contextBridge, ipcRenderer } from 'electron';
import type { OfficeAPI, OfficeSnapshot } from '../shared/types';
const api: OfficeAPI = {
 getSnapshot: () => ipcRenderer.invoke('office:snapshot'),
 onSnapshot(callback) { const listener = (_event: Electron.IpcRendererEvent, value: OfficeSnapshot) => callback(value); ipcRenderer.on('office:changed', listener); return () => ipcRenderer.removeListener('office:changed', listener); },
 focusSession: (id) => ipcRenderer.invoke('office:focus', id),
 dismissSession: (id) => ipcRenderer.invoke('office:dismiss', id),
 setDemo: (enabled) => ipcRenderer.invoke('office:demo', enabled),
};
contextBridge.exposeInMainWorld('office', api);
