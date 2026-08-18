import { supabase } from "@/integrations/supabase/client";

export const televotingPublicServer = (supabase as any).schema("televoting");
