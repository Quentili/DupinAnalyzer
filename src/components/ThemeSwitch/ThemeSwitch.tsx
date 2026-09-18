import { Theme } from "../../types";
import { BowIcon } from "../Icons/Icons";
import styles from "./ThemeSwitch.module.css";

type ThemeSwitchProps = {
    theme: Theme;
    onChange: (t: Theme) => void;
};

export function ThemeSwitch({ theme, onChange }: ThemeSwitchProps) {
    return (
        <div className={styles.themeSwitch} role="group" aria-label="Themes">
            <button
                className={`${styles.themeSwitchBtn} ${theme === "dark" ? styles.isActive : ""}`}
                onClick={() => onChange("dark")}
                title="Dark"
            >
                <span className={styles.themeSwitchGlyph}>◐</span> Dark
            </button>
            <button
                className={`${styles.themeSwitchBtn} ${theme === "kitty" ? styles.isActive : ""}`}
                onClick={() => onChange("kitty")}
                title="Hello kitty"
            >
                <BowIcon className={styles.themeSwitchBow} /> Kitty
            </button>
        </div>
    );
}