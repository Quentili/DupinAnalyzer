import { Status } from "../../types";
import { AdaptiveStatusIcon } from "../Icons/Icons";
import styles from "./StatusPill.module.css";

type StatusPillProps = {
    status: Status;
    count: number;
    progress: number;
};

export function StatusPill({ status, count, progress }: StatusPillProps) {
    const labels: Record<Status, string> = {
        idle: "Idle",
        running: `Analyzing (${progress.toFixed(0)}%)`,
        done: `Done - ${count} ${count === 1 ? "match" : "matches"}`,
        error: "Failed",
    };

    const statusClass =
        status === "idle"
            ? styles.pillIdle
            : status === "running"
                ? styles.pillRunning
                : status === "done"
                    ? styles.pillDone
                    : styles.pillError;

    return (
        <div className={`${styles.pill} ${statusClass}`}>
            <AdaptiveStatusIcon status={status} className={styles.pillHeart} />
            {labels[status]}
        </div>
    );
}