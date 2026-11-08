import { useEffect, useRef } from 'react';
import { useEditorStore } from '../store/editorStore';
import { useSettingsStore } from '../store/settingsStore';
import type { Project } from '../types';

const POLL_MS = 1200;
const SYNC_MS = 450;
const ACTIVITY_MS = 2800;

function changedClipIds(before: Project | null, after: Project): string[] {
  if (!before) return [];
  const previous = new Map(before.clips.map((clip) => [clip.id, clip]));
  const next = new Map(after.clips.map((clip) => [clip.id, clip]));
  const ids = new Set([...previous.keys(), ...next.keys()]);
  return [...ids].filter((id) => JSON.stringify(previous.get(id)) !== JSON.stringify(next.get(id)));
}

function makeToken() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `lc_${crypto.randomUUID().replace(/-/g, '')}`;
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return `lc_${Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')}`;
}

async function agentCall(path: string, token: string, init: RequestInit = {}) {
  return fetch(path, {
    ...init,
    headers: {
      ...(init.headers || {}),
      'content-type': 'application/json',
      'x-lumacut-agent-token': token
    }
  });
}

/**
 * Keeps a live editor session in sync with the local agent bridge.
 *
 * The app is the project owner: local edits are debounced into the session.
 * Agent commands increment the session revision; the poll applies newer remote
 * revisions back into the editor as a normal undoable project replacement.
 */
export function useAgentBridge() {
  const enabled = useSettingsStore((state) => state.agentBridgeEnabled);
  const token = useSettingsStore((state) => state.agentBridgeToken);
  const updateSettings = useSettingsStore((state) => state.update);
  const addToast = useEditorStore((state) => state.addToast);
  const setAgentRuntime = useEditorStore((state) => state.setAgentRuntime);
  const sessionRef = useRef<string | null>(null);
  const revisionRef = useRef(0);
  const lastPushedRef = useRef('');
  const applyingRemoteRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    let activeToken = token;
    if (!activeToken) {
      activeToken = makeToken();
      updateSettings({ agentBridgeToken: activeToken });
      return;
    }

    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    let syncTimer: ReturnType<typeof setTimeout> | undefined;
    let activityTimer: ReturnType<typeof setTimeout> | undefined;

    const showError = (message: string) => {
      if (!cancelled) addToast(message, 'error');
    };

    const applyRemote = (project: Project, message: string) => {
      const current = useEditorStore.getState().project;
      const changedIds = changedClipIds(current, project);
      applyingRemoteRef.current = true;
      useEditorStore.getState().applyExternalProject(project);
      applyingRemoteRef.current = false;
      lastPushedRef.current = JSON.stringify(project);
      const label = changedIds.length
        ? `Agent updated ${changedIds.length} ${changedIds.length === 1 ? 'clip' : 'clips'}`
        : message;
      setAgentRuntime({ connected: true, active: true, message: label, changedIds });
      if (activityTimer) clearTimeout(activityTimer);
      activityTimer = setTimeout(() => {
        setAgentRuntime({ active: false, changedIds: [] });
      }, ACTIVITY_MS);
      addToast(label, 'info');
    };

    const poll = async () => {
      if (cancelled) return;
      try {
        const response = await agentCall('/api/agent/current', activeToken);
        if (response.ok) {
          const data = await response.json() as { id: string; revision: number; project: Project; activity?: { active: boolean; label: string; updatedAt: number } };
          if (data.activity?.active) {
            if (activityTimer) clearTimeout(activityTimer);
            setAgentRuntime({ connected: true, active: true, message: data.activity.label || 'Agent working…' });
          } else if (useEditorStore.getState().agentRuntime.active) {
            if (activityTimer) clearTimeout(activityTimer);
            activityTimer = setTimeout(() => {
              setAgentRuntime({ active: false, changedIds: [] });
            }, 900);
          }
          if (data.id !== sessionRef.current) {
            sessionRef.current = data.id;
            revisionRef.current = data.revision;
            lastPushedRef.current = JSON.stringify(data.project);
          } else if (data.revision > revisionRef.current) {
            const current = useEditorStore.getState().project;
            if (!current || JSON.stringify(current) !== JSON.stringify(data.project)) {
              applyRemote(data.project, 'Agent updated the timeline');
            }
            revisionRef.current = data.revision;
            lastPushedRef.current = JSON.stringify(data.project);
          }
        }
      } catch {
        // The local server can restart independently; retry on the next tick.
      }
      if (!cancelled) pollTimer = setTimeout(poll, POLL_MS);
    };

    const pushProject = async (project: Project) => {
      if (cancelled || !sessionRef.current) return;
      if (applyingRemoteRef.current) return;
      const serialized = JSON.stringify(project);
      if (serialized === lastPushedRef.current) return;
      try {
        const response = await agentCall(`/api/agent/sessions/${sessionRef.current}/sync`, activeToken, {
          method: 'POST',
          body: JSON.stringify({ project, baseRevision: revisionRef.current })
        });
        if (response.status === 409) {
          const conflict = await response.json() as { revision: number; project: Project };
          revisionRef.current = conflict.revision;
          applyRemote(conflict.project, 'Agent changes took priority; timeline refreshed');
          return;
        }
        if (!response.ok) return;
        const data = await response.json() as { revision: number; project: Project };
        revisionRef.current = data.revision;
        lastPushedRef.current = JSON.stringify(data.project);
      } catch {
        // Keep editing offline; the next successful sync catches up.
      }
    };

    const schedulePush = (project: Project) => {
      if (syncTimer) clearTimeout(syncTimer);
      syncTimer = setTimeout(() => { void pushProject(project); }, SYNC_MS);
    };

    const start = async () => {
      const project = useEditorStore.getState().project;
      if (!project) return;
      try {
        const response = await agentCall('/api/agent/sessions', activeToken, {
          method: 'POST',
          body: JSON.stringify({ project, token: activeToken })
        });
        if (!response.ok) {
          showError('Agent Bridge could not start. Is the local server running?');
          return;
        }
        const data = await response.json() as { id: string; revision: number };
        sessionRef.current = data.id;
        revisionRef.current = data.revision;
        lastPushedRef.current = JSON.stringify(project);
        setAgentRuntime({ connected: true, active: false, message: 'Agent connected', changedIds: [] });
        addToast('Agent Bridge online — waiting for your harness', 'success');
        void poll();
      } catch {
        showError('Agent Bridge could not reach the local server');
      }
    };

    const unsubscribe = useEditorStore.subscribe((state, previous) => {
      if (!state.project || state.project === previous.project) return;
      if (applyingRemoteRef.current) return;
      schedulePush(state.project);
    });

    void start();

    return () => {
      cancelled = true;
      unsubscribe();
      if (pollTimer) clearTimeout(pollTimer);
      if (syncTimer) clearTimeout(syncTimer);
      if (activityTimer) clearTimeout(activityTimer);
      setAgentRuntime({ connected: false, active: false, message: '', changedIds: [] });
      const sessionId = sessionRef.current;
      sessionRef.current = null;
      revisionRef.current = 0;
      lastPushedRef.current = '';
      if (sessionId) {
        void agentCall(`/api/agent/sessions/${sessionId}`, activeToken, { method: 'DELETE' }).catch(() => {});
      }
    };
  }, [enabled, token, updateSettings, addToast, setAgentRuntime]);
}
