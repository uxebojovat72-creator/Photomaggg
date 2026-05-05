import { api } from "./client";

export interface City {
  id: string;
  name: string;
  country: { id: string; name: string; code: string; flagEmoji: string | null };
}

export interface Country {
  id: string;
  name: string;
  code: string;
  currencyCode: string;
  flagEmoji: string | null;
}

export const geoApi = {
  cities: (params: { q?: string; country?: string }) =>
    api.get<City[]>("/geo/cities", { params }).then((r) => r.data),

  countries: () =>
    api.get<Country[]>("/geo/countries").then((r) => r.data),
};
