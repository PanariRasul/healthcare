// client/src/context/ThemeContext.jsx
import { createContext, useContext, useEffect, useState } from "react";

const ThemeContext = createContext(null);

export const ThemeProvider = ({ children }) => {
  // const [dark, setDark] = useState(() => {
  //   const stored = localStorage.getItem("hms_theme");
  //   if (stored) return stored === "dark";
  //   return window.matchMedia("(prefers-color-scheme: dark)").matches;
  // });

  const [dark, setDark] = useState(() => {
    const stored = localStorage.setItem("hms_theme", "light");
    if (stored) return stored === "dark";

    // Default to light mode
    return false;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (dark) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    localStorage.setItem("hms_theme", dark ? "dark" : "light");
  }, [dark]);

  const toggle = () => setDark((d) => !d);

  return (
    <ThemeContext.Provider value={{ dark, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
