import { useEffect, useMemo, useState } from "react";
import styles from "./ProfileForm.module.css";
import type { ProfileRow } from "../../api/schemas";
import { clientbook } from "../../api/clientbook";
import { Button } from "../../components/ui/Button";
import { Field, Input, TextArea } from "../../components/ui/Input";

export function ProfileForm(props: {
    mode: "new" | "edit";
    profile: ProfileRow | null;
    onSaved: (id: string) => void;
    onDeleted: () => void;
    onDone: () => void;
}) {
    const p = props.profile;

    const [label, setLabel] = useState(p?.label ?? "");
    const [username, setUsername] = useState(p?.username ?? "");
    const [passwordPlain, setPasswordPlain] = useState("");
    const [notes, setNotes] = useState(p?.notes ?? "");

    useEffect(() => {
        setLabel(p?.label ?? "");
        setUsername(p?.username ?? "");
        setPasswordPlain("");
        setNotes(p?.notes ?? "");
    }, [p?.id]);

    const canSave = useMemo(() => {
        if (!label.trim() || !username.trim()) return false;
        if (props.mode === "new") return passwordPlain.trim().length > 0;
        return (
            passwordPlain.trim().length > 0 ||
            label.trim() !== (p?.label ?? "") ||
            username.trim() !== (p?.username ?? "") ||
            (notes.trim() || "") !== (p?.notes ?? "")
        );
    }, [label, username, passwordPlain, notes, props.mode, p]);

    return (
        <div className={styles.wrap}>
            <div className={styles.top}>
                <div className={styles.h1}>{props.mode === "new" ? "New profile" : (p?.label ?? "Profile")}</div>
                <div className={styles.actions}>
                    <Button variant="primary" disabled={!canSave} onClick={async () => {
                        const id = await clientbook.profiles.upsert({
                            id: props.mode === "edit" ? p?.id : undefined,
                            label: label.trim(),
                            username: username.trim(),
                            passwordPlain: passwordPlain.trim(),
                            notes: notes.trim() ? notes.trim() : null,
                        });
                        props.onSaved(id);
                    }}>Save</Button>

                    {props.mode === "edit" && p ? (
                        <Button variant="danger" onClick={async () => {
                            if (!confirm("Delete this profile?")) return;
                            await clientbook.profiles.remove(p.id);
                            props.onDeleted();
                        }}>Delete</Button>
                    ) : (
                        <Button onClick={props.onDone}>Done</Button>
                    )}
                </div>
            </div>

            <div className={styles.grid}>
                <Field label="Label">
                    <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="CRA Rep A" />
                </Field>

                <Field label="Username">
                    <Input mono value={username} onChange={(e) => setUsername(e.target.value)} placeholder="CRA username" />
                </Field>

                <Field label="Password" hint={props.mode === "edit" ? "Enter to change" : "Required"}>
                    <Input type="password" value={passwordPlain} onChange={(e) => setPasswordPlain(e.target.value)} />
                </Field>

                <Field label="Notes">
                    <TextArea value={notes ?? ""} onChange={(e) => setNotes(e.target.value)} placeholder="Optional…" />
                </Field>
            </div>

            <div className="faint" style={{ fontSize: "12px" }}>
                Stored encrypted by Electron safeStorage. Password never displayed.
            </div>
        </div>
    );
}