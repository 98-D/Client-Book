// apps/renderer/src/ui/popover/Popover.tsx
import { useEffect, useLayoutEffect, useRef, useState } from "react";

export function Popover(props: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    align?: "start" | "end";
    children: React.ReactNode;
}) {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const cardRef = useRef<HTMLDivElement | null>(null);
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

    useLayoutEffect(() => {
        if (!props.open) return;
        const host = hostRef.current;
        const card = cardRef.current;
        if (!host || !card) return;

        const r = host.getBoundingClientRect();
        const c = card.getBoundingClientRect();
        const pad = 8;

        const top = Math.min(window.innerHeight - c.height - pad, r.bottom + 6);
        const left =
            props.align === "end"
                ? Math.max(pad, Math.min(window.innerWidth - c.width - pad, r.right - c.width))
                : Math.max(pad, Math.min(window.innerWidth - c.width - pad, r.left));

        setPos({ top, left });
    }, [props.open, props.align]);

    useEffect(() => {
        if (!props.open) return;

        const onDown = (e: MouseEvent) => {
            const host = hostRef.current;
            const card = cardRef.current;
            const t = e.target as Node | null;
            if (!t) return;
            if (host?.contains(t)) return;
            if (card?.contains(t)) return;
            props.onOpenChange(false);
        };

        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") props.onOpenChange(false);
        };

        window.addEventListener("mousedown", onDown, true);
        window.addEventListener("keydown", onKey);
        return () => {
            window.removeEventListener("mousedown", onDown, true);
            window.removeEventListener("keydown", onKey);
        };
    }, [props.open, props]);

    return (
        <div className="popoverHost" ref={hostRef}>
            {props.open ? (
                <div className="popoverPortal">
                    <div className="popoverBackdrop" />
                    <div
                        className="popover"
                        ref={cardRef}
                        style={pos ? { top: pos.top, left: pos.left } : undefined}
                    >
                        {props.children}
                    </div>
                </div>
            ) : null}
        </div>
    );
}