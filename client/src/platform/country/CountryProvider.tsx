import { createContext, useContext, useMemo, type ReactNode } from "react";
import { getCountryConfig } from "@/platform/country/profiles";
import { LIBERIA_DEFAULT, setActiveTenantConfig, type ResolvedTenantConfig } from "@/platform/country/tenant";
import type { CountryProfile } from "@/platform/country/types";

type CountryContextValue = { config: ResolvedTenantConfig; profile: CountryProfile };

const CountryContext = createContext<CountryContextValue>({ config: LIBERIA_DEFAULT, profile: getCountryConfig("LR") });

/**
 * Publishes the signed-in pharmacy's country configuration. The active
 * config is set during render, before any child formats a number, so the
 * first paint already uses the right currency and timezone.
 */
export function CountryProvider({ config, children }: { config: ResolvedTenantConfig | null | undefined; children: ReactNode }) {
  const value = useMemo(() => {
    const c = config ?? LIBERIA_DEFAULT;
    return { config: c, profile: getCountryConfig(c.countryCode) };
  }, [config]);
  setActiveTenantConfig(value.config);
  return <CountryContext.Provider value={value}>{children}</CountryContext.Provider>;
}

export function useCountry(): CountryContextValue {
  return useContext(CountryContext);
}
