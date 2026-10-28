import { expect, it } from "vitest";
import { containsPostgresExecute, definitionWritesTable } from "./v3-s16-postgres-function-writers";
const fn = (body: string) => `CREATE FUNCTION f() RETURNS void LANGUAGE plpgsql AS $function$ BEGIN ${body} END $function$;`;
it("does not turn observational command labels or comments into dynamic writer authority", () => {
 const read = fn("perform * from public.results; perform 'publication.show.execute'; /* execute results */");
 expect(containsPostgresExecute(read)).toBe(false);
 expect(definitionWritesTable(read, "public.results")).toBe(false);
 expect(containsPostgresExecute(fn("perform $$execute$$; perform 'it''s execute'; -- execute\n perform 1;"))).toBe(false);
 expect(containsPostgresExecute(fn('perform "execute" from public.results;'))).toBe(false);
});
it("still discovers every direct mutation verb and actual dynamic SQL", () => {
 for (const sql of ["insert into public.results values (1)", "update public.results set rank=1", "delete from public.results", "merge into public.results using input on true when matched then delete", "EXECUTE format('UPDATE public.results SET rank = %s', 1)", "execute 'DELETE FROM results'", "-- results\n EXECUTE unknown_runtime_query"]) {
  expect(definitionWritesTable(fn(sql), "public.results")).toBe(true);
 }
});
it("handles nested comments and quoted SQL without losing a later real EXECUTE", () => {
 const sql = fn("/* outer /* execute */ still comment */ perform $sql$execute$sql$; EXECUTE format('select * from public.results');");
 expect(containsPostgresExecute(sql)).toBe(true);
 expect(definitionWritesTable(sql,"public.results")).toBe(true);
 expect(containsPostgresExecute(fn("perform E'escaped\\' execute'; perform 1;"))).toBe(false);
});

it("does not hide a real EXECUTE after a standard-conforming string ending in a backslash", () => {
 expect(containsPostgresExecute(fn("perform 'trailing\\'; EXECUTE query_for_results;"))).toBe(true);
});
