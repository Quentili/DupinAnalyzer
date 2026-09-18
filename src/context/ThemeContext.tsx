import { createContext, useContext } from "react";
import { Theme } from "../types";

export const THEME_KEY = "dupin.theme";
export const ThemeCtx = createContext<Theme>("kitty");
export const useTheme = () => useContext(ThemeCtx);