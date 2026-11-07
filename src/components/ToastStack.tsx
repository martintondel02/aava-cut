import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { useEditorStore } from '../store/editorStore';

export function ToastStack() {
  const toasts = useEditorStore((state) => state.toasts);
  const dismiss = useEditorStore((state) => state.dismissToast);
  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.kind}`}>
          <span className="toast-icon">
            {toast.kind === 'success' ? <CheckCircle2 size={16} /> : toast.kind === 'error' ? <AlertTriangle size={16} /> : <Info size={16} />}
          </span>
          <span className="toast-message">{toast.message}</span>
          <button type="button" onClick={() => dismiss(toast.id)}><X size={13} /></button>
        </div>
      ))}
    </div>
  );
}
