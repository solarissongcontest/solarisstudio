/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * A deliberately permissive Supabase schema type for the isolated Televoting
 * namespace. The actual schema is versioned in SQL migrations; this type keeps
 * PostgREST query results structurally typed while avoiding a second generated
 * Supabase project type file.
 *
 * The important boundary is the schema name: every query made through these
 * clients is pinned to `televoting`, never the canonical Solaris `public`
 * schema.
 */
export type TelevotingJson =
  | string
  | number
  | boolean
  | null
  | { [key: string]: TelevotingJson | undefined }
  | TelevotingJson[];

type LooseRow = Record<string, any>;

type LooseRelationship = {
  foreignKeyName: string;
  columns: string[];
  isOneToOne: boolean;
  referencedRelation: string;
  referencedColumns: string[];
};

type LooseTable = {
  Row: LooseRow;
  Insert: LooseRow;
  Update: LooseRow;
  Relationships: LooseRelationship[];
};

type LooseFunction = {
  Args: Record<string, any>;
  Returns: any;
};

export type TelevotingDatabase = {
  __InternalSupabase: {
    PostgrestVersion: "14.15";
  };
  televoting: {
    Tables: Record<string, LooseTable>;
    Views: Record<string, never>;
    Functions: Record<string, LooseFunction>;
    Enums: {
      round_status: "draft" | "open" | "closed";
    };
    CompositeTypes: Record<string, never>;
  };
};
