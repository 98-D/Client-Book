// apps/renderer/src/ui/toast/ToastHost.tsx
import { useCallback, useMemo, useState } from "react";

export type Toast = { id: string; kind: "ok" | "err"; msg: string };

function uid() {
    return Math.random().toString(16).slice(2);
}

export function useToasts() {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const push = useCallback((t: Omit<Toast, "id">) => {
        const id = uid();
        setToasts((x) => [...x, { id, ...t }]);
        window.setTimeout(() => {
            setToasts((x) => x.filter((y) => y.id !== id));
        }, 1800);
    }, []);

    const dismiss = useCallback((id: string) => {
        setToasts((x) => x.filter((y) => y.id !== id));
    }, []);

    // ergonomic helpers
    const ok = useCallback((msg: string) => push({ kind: "ok", msg }), [push]);
    const err = useCallback((msg: string) => push({ kind: "err", msg }), [push]);

    return useMemo(
        () => ({
            push,
            ok,
            err,
            bindings: { toasts, dismiss },
        }),
        [push, ok, err, toasts, dismiss]
    );
}

export function ToastHost(props: { toasts: Toast[]; dismiss: (id: string) => void }) {
    return (
        <div className="toastHost">
            {props.toasts.map((t) => (
                <div key={t.id} className={"toast " + t.kind} onMouseDown={() => props.dismiss(t.id)}>
                    {t.msg}
                </div>
            ))}
        </div>
    );
}