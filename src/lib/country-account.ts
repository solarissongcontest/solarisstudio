import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase as typedSupabase } from "@/integrations/supabase/client";
import type { Country } from "@/lib/data";

const supabase = typedSupabase as any;

export type AccountAccess = {
  userId: string | null;
  isOrganizer: boolean;
  countryId: string | null;
  countryStatus: "active" | "suspended" | null;
  suspensionReason: string | null;
  schemaReady: boolean;
};

export type AvailableCountryClaim = {
  id: string;
  name: string;
  short_code: string;
  flag_image: string | null;
  accent_color: string;
  region: string;
};

export type AdminCountryAccount = {
  user_id: string;
  email: string | null;
  country_id: string;
  country_name: string;
  short_code: string;
  flag_image: string | null;
  status: "active" | "suspended";
  suspension_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type CountryProfile = {
  country_id: string;
  capital: string | null;
  government_type: string | null;
  leader_name: string | null;
  leader_title: string | null;
  demonym: string | null;
  official_languages: string | null;
  currency: string | null;
  motto: string | null;
  population: string | null;
  established: string | null;
  summary: string | null;
  updated_at: string;
};

export type CountryProfileSection = {
  id: string;
  country_id: string;
  heading: string;
  body: string;
  image_url: string | null;
  image_caption: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type CountryMedia = {
  id: string;
  country_id: string;
  storage_path: string;
  public_url: string;
  caption: string | null;
  alt_text: string | null;
  sort_order: number;
  created_at: string;
};

export type CountryWorldProfile = {
  schemaReady: boolean;
  profile: CountryProfile | null;
  sections: CountryProfileSection[];
  media: CountryMedia[];
};

function missingCountrySchema(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: string; message?: string };
  const message = candidate.message?.toLowerCase() ?? "";
  return (
    candidate.code === "42P01" ||
    candidate.code === "PGRST205" ||
    candidate.code === "PGRST204" ||
    message.includes("country_accounts") ||
    message.includes("country_profiles") ||
    message.includes("available_country_claims") ||
    message.includes("admin_country_accounts") ||
    message.includes("suspension_reason")
  );
}

export async function getCurrentAccountAccess(userId?: string | null): Promise<AccountAccess> {
  let resolvedUserId = userId ?? null;

  if (!resolvedUserId) {
    const { data } = await typedSupabase.auth.getUser();
    resolvedUserId = data.user?.id ?? null;
  }

  if (!resolvedUserId) {
    return {
      userId: null,
      isOrganizer: false,
      countryId: null,
      countryStatus: null,
      suspensionReason: null,
      schemaReady: true,
    };
  }

  const [roleResult, countryResult] = await Promise.all([
    typedSupabase
      .from("user_roles")
      .select("role")
      .eq("user_id", resolvedUserId)
      .eq("role", "organizer")
      .maybeSingle(),
    supabase
      .from("country_accounts")
      .select("country_id,status,suspension_reason")
      .eq("user_id", resolvedUserId)
      .maybeSingle(),
  ]);

  if (roleResult.error && !missingCountrySchema(roleResult.error)) {
    console.warn("Could not resolve organizer role", roleResult.error);
  }

  if (countryResult.error && !missingCountrySchema(countryResult.error)) {
    console.warn("Could not resolve country account", countryResult.error);
  }

  return {
    userId: resolvedUserId,
    isOrganizer: Boolean(roleResult.data),
    countryId: countryResult.data?.country_id ?? null,
    countryStatus: countryResult.data?.status ?? null,
    suspensionReason: countryResult.data?.suspension_reason ?? null,
    schemaReady: !missingCountrySchema(countryResult.error),
  };
}

export function useAvailableCountryClaims() {
  return useQuery({
    queryKey: ["available-country-claims"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("available_country_claims");
      if (missingCountrySchema(error)) {
        return { schemaReady: false, countries: [] as AvailableCountryClaim[] };
      }
      if (error) throw error;
      return {
        schemaReady: true,
        countries: (data ?? []) as AvailableCountryClaim[],
      };
    },
    staleTime: 15_000,
  });
}

export function useMyCountryAccount() {
  return useQuery({
    queryKey: ["my-country-account"],
    queryFn: async () => {
      const access = await getCurrentAccountAccess();
      if (!access.userId || !access.countryId) {
        return { access, country: null as Country | null };
      }

      const { data, error } = await typedSupabase
        .from("countries")
        .select("*")
        .eq("id", access.countryId)
        .maybeSingle();
      if (error) throw error;

      return { access, country: (data as Country | null) ?? null };
    },
    staleTime: 30_000,
  });
}

export function useAdminCountryAccounts(enabled = true) {
  return useQuery({
    enabled,
    queryKey: ["admin-country-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_country_accounts");
      if (missingCountrySchema(error)) {
        return { schemaReady: false, accounts: [] as AdminCountryAccount[] };
      }
      if (error) throw error;
      return { schemaReady: true, accounts: (data ?? []) as AdminCountryAccount[] };
    },
    staleTime: 10_000,
  });
}

export function useAdminSetCountryAccountStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      userId: string;
      status: "active" | "suspended";
      reason?: string;
    }) => {
      const { data, error } = await supabase.rpc("admin_set_country_account_status", {
        _user_id: input.userId,
        _status: input.status,
        _reason: input.reason ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin-country-accounts"] }),
        qc.invalidateQueries({ queryKey: ["my-country-account"] }),
      ]);
    },
  });
}

export function useCountryWorldProfile(countryId?: string) {
  return useQuery({
    enabled: Boolean(countryId),
    queryKey: ["country-world-profile", countryId],
    queryFn: async (): Promise<CountryWorldProfile> => {
      const [profileResult, sectionsResult, mediaResult] = await Promise.all([
        supabase
          .from("country_profiles")
          .select("*")
          .eq("country_id", countryId)
          .maybeSingle(),
        supabase
          .from("country_profile_sections")
          .select("*")
          .eq("country_id", countryId)
          .order("sort_order")
          .order("created_at"),
        supabase
          .from("country_media")
          .select("*")
          .eq("country_id", countryId)
          .order("sort_order")
          .order("created_at"),
      ]);

      const missing = [profileResult.error, sectionsResult.error, mediaResult.error].some(
        missingCountrySchema,
      );
      if (missing) {
        return { schemaReady: false, profile: null, sections: [], media: [] };
      }

      if (profileResult.error) throw profileResult.error;
      if (sectionsResult.error) throw sectionsResult.error;
      if (mediaResult.error) throw mediaResult.error;

      return {
        schemaReady: true,
        profile: (profileResult.data as CountryProfile | null) ?? null,
        sections: (sectionsResult.data ?? []) as CountryProfileSection[],
        media: (mediaResult.data ?? []) as CountryMedia[],
      };
    },
    staleTime: 30_000,
  });
}

export function useClaimCountryAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (countryId: string) => {
      const { data, error } = await supabase.rpc("claim_country_account", {
        _country_id: countryId,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["my-country-account"] }),
        qc.invalidateQueries({ queryKey: ["available-country-claims"] }),
        qc.invalidateQueries({ queryKey: ["admin-country-accounts"] }),
      ]);
    },
  });
}

type IdentityInput = {
  name: string;
  nativeName: string;
  region: string;
  description: string;
  accentColor: string;
  flagImage: string | null;
};

export function useUpdateCountryIdentity(countryId?: string, organizerOverride = false) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: IdentityInput) => {
      const fn = organizerOverride ? "admin_update_country_identity" : "update_owned_country_identity";
      const args = organizerOverride
        ? {
            _country_id: countryId,
            _name: input.name,
            _native_name: input.nativeName,
            _region: input.region,
            _description: input.description,
            _accent_color: input.accentColor,
            _flag_image: input.flagImage,
          }
        : {
            _name: input.name,
            _native_name: input.nativeName,
            _region: input.region,
            _description: input.description,
            _accent_color: input.accentColor,
            _flag_image: input.flagImage,
          };

      if (organizerOverride && !countryId) throw new Error("No country is selected.");
      const { data, error } = await supabase.rpc(fn, args);
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["countries"] }),
        qc.invalidateQueries({ queryKey: ["my-country-account"] }),
        qc.invalidateQueries({ queryKey: ["contest_entities"] }),
        qc.invalidateQueries({ queryKey: ["admin-country-accounts"] }),
      ]);
    },
  });
}

export function useUpdateOwnedCountryIdentity() {
  return useUpdateCountryIdentity();
}

export function useSaveCountryProfile(countryId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      values: Omit<CountryProfile, "country_id" | "updated_at">,
    ) => {
      if (!countryId) throw new Error("No country account is selected.");
      const { data, error } = await supabase
        .from("country_profiles")
        .upsert({ country_id: countryId, ...values }, { onConflict: "country_id" })
        .select("*")
        .single();
      if (error) throw error;
      return data as CountryProfile;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["country-world-profile", countryId] });
    },
  });
}

export function useSaveCountrySection(countryId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (section: {
      id?: string;
      heading: string;
      body: string;
      image_url?: string | null;
      image_caption?: string | null;
      sort_order?: number;
    }) => {
      if (!countryId) throw new Error("No country account is selected.");
      const payload = {
        country_id: countryId,
        heading: section.heading.trim(),
        body: section.body,
        image_url: section.image_url ?? null,
        image_caption: section.image_caption?.trim() || null,
        sort_order: section.sort_order ?? 0,
      };
      if (!payload.heading) throw new Error("Section heading is required.");

      const query = section.id
        ? supabase
            .from("country_profile_sections")
            .update(payload)
            .eq("id", section.id)
            .eq("country_id", countryId)
        : supabase.from("country_profile_sections").insert(payload);

      const { data, error } = await query.select("*").single();
      if (error) throw error;
      return data as CountryProfileSection;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["country-world-profile", countryId] });
    },
  });
}

export function useDeleteCountrySection(countryId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sectionId: string) => {
      if (!countryId) throw new Error("No country account is selected.");
      const { error } = await supabase
        .from("country_profile_sections")
        .delete()
        .eq("id", sectionId)
        .eq("country_id", countryId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["country-world-profile", countryId] });
    },
  });
}

export function useAddCountryMedia(countryId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (media: {
      storagePath: string;
      publicUrl: string;
      caption?: string;
      altText?: string;
    }) => {
      if (!countryId) throw new Error("No country account is selected.");
      const { data, error } = await supabase
        .from("country_media")
        .insert({
          country_id: countryId,
          storage_path: media.storagePath,
          public_url: media.publicUrl,
          caption: media.caption?.trim() || null,
          alt_text: media.altText?.trim() || null,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as CountryMedia;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["country-world-profile", countryId] });
    },
  });
}

export function useDeleteCountryMedia(countryId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (media: CountryMedia) => {
      if (!countryId) throw new Error("No country account is selected.");

      const { error: sectionError } = await supabase
        .from("country_profile_sections")
        .update({ image_url: null, image_caption: null })
        .eq("country_id", countryId)
        .eq("image_url", media.public_url);
      if (sectionError) throw sectionError;

      const { error: rowError } = await supabase
        .from("country_media")
        .delete()
        .eq("id", media.id)
        .eq("country_id", countryId);
      if (rowError) throw rowError;

      const { error: storageError } = await typedSupabase.storage
        .from("country-media")
        .remove([media.storage_path]);
      if (storageError) throw storageError;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["country-world-profile", countryId] });
    },
  });
}

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function safeFileName(name: string) {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || "image";
}

export async function uploadCountryAsset(
  countryId: string,
  file: File,
  folder: "flags" | "gallery",
) {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error("Use a JPG, PNG, WebP or GIF image.");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("Images can be at most 8 MB.");
  }

  const storagePath = `${countryId}/${folder}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
  const { error } = await typedSupabase.storage.from("country-media").upload(storagePath, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type,
  });
  if (error) throw error;

  const { data } = typedSupabase.storage.from("country-media").getPublicUrl(storagePath);
  return { storagePath, publicUrl: data.publicUrl };
}

type EntryInput = {
  participantId: string | null;
  editionId: string;
  showId: string | null;
  artist: string;
  song: string;
  notes: string;
};

export function useSaveCountryEntry(countryId?: string, organizerOverride = false) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: EntryInput) => {
      const fn = organizerOverride ? "admin_upsert_country_entry" : "upsert_owned_country_entry";
      const args = organizerOverride
        ? {
            _country_id: countryId,
            _participant_id: input.participantId,
            _edition_id: input.editionId,
            _show_id: input.showId,
            _artist: input.artist,
            _song: input.song,
            _notes: input.notes,
          }
        : {
            _participant_id: input.participantId,
            _edition_id: input.editionId,
            _show_id: input.showId,
            _artist: input.artist,
            _song: input.song,
            _notes: input.notes,
          };

      if (organizerOverride && !countryId) throw new Error("No country is selected.");
      const { data, error } = await supabase.rpc(fn, args);
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["participants"] }),
        qc.invalidateQueries({ queryKey: ["contest_entities"] }),
      ]);
    },
  });
}

export function useSaveOwnedCountryEntry() {
  return useSaveCountryEntry();
}
