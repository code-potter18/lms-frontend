import API from "@/api/axios";

export interface KpiPreferencesResponse {
  success: boolean;
  data: { kpis: string[] };
}

export interface KpiUsageResponse {
  success: boolean;
  data: { usage: Record<string, number> };
}

export const getKpiPreferences = async (): Promise<string[]> => {
  const res = await API.get<KpiPreferencesResponse>("/auth/me/kpi-preferences");
  return res.data?.data?.kpis ?? [];
};

export const saveKpiPreferences = async (kpis: string[]): Promise<string[]> => {
  const res = await API.put<KpiPreferencesResponse>("/auth/me/kpi-preferences", { kpis });
  return res.data?.data?.kpis ?? [];
};

export const getKpiUsage = async (): Promise<Record<string, number>> => {
  const res = await API.get<KpiUsageResponse>("/auth/me/kpi-usage");
  return res.data?.data?.usage ?? {};
};

export const saveKpiUsage = async (usage: Record<string, number>): Promise<Record<string, number>> => {
  const res = await API.put<KpiUsageResponse>("/auth/me/kpi-usage", { usage });
  return res.data?.data?.usage ?? {};
};