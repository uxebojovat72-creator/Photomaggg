import { create } from "zustand";
import { persist } from "zustand/middleware";

type Theme = "dark" | "light";

interface UiState {
  theme: Theme;
  currency: string;
  country: string;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
  setCurrency: (c: string) => void;
  setCountry: (c: string) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      theme: "dark",
      currency: "USD",
      country: "",

      toggleTheme: () =>
        set((s) => ({ theme: s.theme === "dark" ? "light" : "dark" })),

      setTheme: (theme) => set({ theme }),
      setCurrency: (currency) => set({ currency }),
      setCountry: (country) => set({ country }),
    }),
    { name: "priceradar-ui" }
  )
);
