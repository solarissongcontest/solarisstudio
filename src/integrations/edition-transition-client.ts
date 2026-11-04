import { supabase } from "@/integrations/supabase/client";

/** Concrete database transport for the canonical Edition lifecycle adapter. */
export const editionTransitionRpcClient = supabase;
