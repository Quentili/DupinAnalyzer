import { IconProps, Status } from "../../types";
import { useTheme } from "../../context/ThemeContext";

const HEART_PATH = "M12 20.6 4.2 12.8a4.7 4.7 0 0 1 6.6-6.6l1.2 1.2 1.2-1.2a4.7 4.7 0 0 1 6.6 6.6z";

export function HeartIcon({ className, title }: IconProps) {
    return (
        <svg className={`icon icon--heart ${className ?? ""}`} viewBox="0 0 24 24" aria-hidden={!title}>
            {title && <title>{title}</title>}
            <path d={HEART_PATH} fill="currentColor" />
        </svg>
    );
}

export function HeartOutlineIcon({ className, title }: IconProps) {
    return (
        <svg className={`icon icon--heart ${className ?? ""}`} viewBox="0 0 24 24" aria-hidden={!title}>
            {title && <title>{title}</title>}
            <path d={HEART_PATH} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
    );
}

export function HeartBrokenIcon({ className, title }: IconProps) {
    return (
        <svg className={`icon icon--heart ${className ?? ""}`} viewBox="0 0 24 24" aria-hidden={!title}>
            {title && <title>{title}</title>}
            <path d={HEART_PATH} fill="currentColor" />
            <path
                d="M12 5.4 10.2 9.4l3 1.9-2.4 3.6 1.2 4.2"
                fill="none"
                stroke="var(--crack-color, #fff)"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

export function HeartSearchIcon({ className }: IconProps) {
    return (
        <svg className={`icon icon--search ${className ?? ""}`} viewBox="0 0 24 24" aria-hidden="true">
            <path
                d="M10.6 15.4 5.1 9.9a3.9 3.9 0 0 1 5.5-5.5l.9.9.9-.9a3.9 3.9 0 0 1 5.5 5.5z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinejoin="round"
            />
            <path d="m14.4 13.6 5.6 5.6" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
        </svg>
    );
}

export function SearchIcon({ className }: IconProps) {
    return (
        <svg className={`icon icon--search ${className ?? ""}`} viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="m16.5 16.5 4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
    );
}

export function WarningIcon({ className }: IconProps) {
    return (
        <svg className={`icon ${className ?? ""}`} viewBox="0 0 24 24" aria-hidden="true">
            <path
                d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
            />
            <line x1="12" y1="9" x2="12" y2="13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <circle cx="12" cy="17" r="1.1" fill="currentColor" />
        </svg>
    );
}

export function DotIcon({ className }: IconProps) {
    return (
        <svg className={`icon ${className ?? ""}`} viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="5" fill="currentColor" />
        </svg>
    );
}

export function CloseIcon({ className }: IconProps) {
    return (
        <svg className={`icon ${className ?? ""}`} viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
    );
}

export function BowIcon({ className }: IconProps) {
    return (
        <svg className={`icon icon--bow ${className ?? ""}`} viewBox="0 0 32 24" aria-hidden="true">
            <path
                d="M16 12c-2.6-4.6-5.6-7.4-9-7.4C3.6 4.6 1.6 7 1.6 10.4 1.6 15 5.4 19 10.5 19c2.4 0 4.3-2.3 5.5-7z"
                fill="currentColor"
            />
            <path
                d="M16 12c2.6-4.6 5.6-7.4 9-7.4 3.4 0 5.4 2.4 5.4 5.8 0 4.6-3.8 8.6-8.9 8.6-2.4 0-4.3-2.3-5.5-7z"
                fill="currentColor"
            />
            <ellipse cx="16" cy="12" rx="3.1" ry="3.6" fill="currentColor" />
        </svg>
    );
}

export function AdaptiveSearchIcon({ className }: IconProps) {
    const theme = useTheme();
    return theme === "kitty"
        ? <HeartSearchIcon className={className} />
        : <SearchIcon className={className} />;
}

export function AdaptiveStatusIcon({ status, className }: { status: Status; className?: string }) {
    const theme = useTheme();
    if (theme === "kitty") {
        if (status === "idle") return <HeartOutlineIcon className={className} />;
        if (status === "error") return <HeartBrokenIcon className={className} />;
        return <HeartIcon className={className} />;
    }
    if (status === "error") return <DotIcon className={`${className ?? ""}`} />;
    return <DotIcon className={className} />;
}

export function AdaptiveErrorIcon({ className }: IconProps) {
    const theme = useTheme();
    return theme === "kitty"
        ? <HeartBrokenIcon className={className} />
        : <WarningIcon className={className} />;
}

export function AdaptiveCatDot({ className }: IconProps) {
    const theme = useTheme();
    return theme === "kitty"
        ? <HeartIcon className={className} />
        : <DotIcon className={className} />;
}