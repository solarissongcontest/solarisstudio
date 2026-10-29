// Generate an executable local SQL oracle from the existing deterministic
// preview engine. SQL persistence must preserve pools, allocations and ranking.
import { readFileSync, writeFileSync } from 'node:fs';
import { computeCombined, type ComponentSourceInput } from '../src/integrations/televoting/combined-math';
const setup = readFileSync('.github/tests/v3-combined-calculation-authority.sql','utf8').split("select set_config('test.calc.version'")[0];
const literal = (x: unknown) => `'${JSON.stringify(x).replaceAll("'", "''")}'::jsonb`;
const source = (n: number, mode: ComponentSourceInput['inputMode'], weight: number, values: Record<string,number>, extra: Partial<ComponentSourceInput> = {}): ComponentSourceInput => ({id:`29072852-0000-4000-8000-${String(800+n).padStart(12,'0')}`,name:`source ${n}`,type:mode==='activity_points'?'activity':mode==='correction'?'correction':'round',inputMode:mode,percentageWeight:weight,enabled:true,displayOrder:n,values,...extra});
const cases: ComponentSourceInput[][] = [
 [source(1,'raw_results',100,{AA:10,BB:10})],
 [source(1,'raw_results',33.33,{AA:5,BB:12}),source(2,'activity_points',33.33,{AA:8,BB:1}),source(3,'converted_points',33.34,{AA:12,BB:6})],
 [source(1,'raw_results',50,{AA:5,BB:7}),source(2,'converted_points',50,{AA:12,BB:6}),source(3,'correction',0,{AA:2,BB:-2},{correctionScope:'source',correctionTargetSourceId:source(1,'raw_results',0,{}).id})],
 [source(1,'activity_points',100,{AA:3,BB:2}),source(2,'correction',0,{AA:-10,BB:10},{correctionScope:'final'})],
 [source(1,'converted_points',50,{AA:1,BB:3}),source(2,'raw_results',50,{AA:3,BB:1})],
 [source(1,'raw_results',100,{AA:10,BB:10},{distributions:{AA:[5,5],BB:[10]}})],
];
let sql=setup+`insert into televoting.countries(code,name) values('AA','Parity A'),('BB','Parity B'),('XX','Voting') on conflict do nothing;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"29072852-0000-4000-8000-000000000001","session_id":"29072852-0000-4000-8000-000000000011"}',true);\n`;
for(const [i,sources] of cases.entries()) {
 const total= i===1?101:i===5?2:100; const exponent=i===0?1:1.33;
 const result=computeCombined({participants:['AA','BB'],sources,totalPoints:total,rankExponent:exponent});
 if(result.errors.length) throw new Error(result.errors.join(';'));
 sql+=`delete from televoting.combined_televote_results where aggregation_id='29072852-0000-4000-8000-000000000071';
 delete from televoting.televote_aggregation_sources where aggregation_id='29072852-0000-4000-8000-000000000071';
 update televoting.televote_aggregations set total_points_to_distribute=${total},rank_exponent=${exponent} where id='29072852-0000-4000-8000-000000000071';\n`;
 for(const s of sources) {
  let roundId: string | null = null;
  if (s.distributions) {
   roundId = `29072852-0000-4000-8000-${String(1000+i*10+s.displayOrder).padStart(12,'0')}`;
   sql+=`insert into televoting.editions(id,name) values('${roundId}','Distribution parity');
   insert into televoting.rounds(id,edition_id,name,status,closes_at,televote_engine_version) values('${roundId}','${roundId}','Distribution parity','open',now()+interval '1 hour','rank-weighted-v1');
   insert into televoting.round_entries(round_id,entry_type,entry_key,country_code,display_order) values('${roundId}','country','AA','AA',0),('${roundId}','country','BB','BB',1);\n`;
   let n=0;
   for(const [code,points] of Object.entries(s.distributions)) for(const value of points) {
    const ballot=`29072852-0000-4000-8000-${String(2000+i*100+n++).padStart(12,'0')}`;
    sql+=`insert into televoting.vote_submissions(id,round_id,username,username_normalized,country_code) values('${ballot}','${roundId}','${ballot}','${ballot}','XX');
    insert into televoting.vote_entries(submission_id,target_country_code,points) values('${ballot}','${code}',${value});\n`;
   }
  }
  sql+=`insert into televoting.televote_aggregation_sources(id,aggregation_id,source_name,source_type,percentage_weight,input_mode,display_order,correction_scope,correction_target_source_id,source_round_id) values('${s.id}','29072852-0000-4000-8000-000000000071','${s.name}','${s.type}',${s.percentageWeight},'${s.inputMode}',${s.displayOrder},'${s.correctionScope??'final'}',${s.correctionTargetSourceId?`'${s.correctionTargetSourceId}'`:'null'},${roundId?`'${roundId}'`:'null'});\n`;
  for(const [code,value] of Object.entries(s.values)) sql+=`insert into televoting.external_score_entries(source_id,country_code,value) values('${s.id}','${code}',${value});\n`;
 }
 const rows=result.rows.map(r=>({country_code:r.code,points:r.finalCombinedPoints,rank:r.finalRank})).sort((a,b)=>a.country_code.localeCompare(b.country_code));
 sql+=`select televoting.v3_calculate_combined('29072852-0000-4000-8000-000000000071',(select command_version from televoting.televote_aggregations where id='29072852-0000-4000-8000-000000000071'),'29072852-0000-4000-8000-${String(900+i).padStart(12,'0')}','parity:${i}');
 do $assert$ begin
 if (select jsonb_agg(jsonb_build_object('country_code',country_code,'points',final_combined_points,'rank',final_rank) order by country_code) from televoting.combined_televote_results where aggregation_id='29072852-0000-4000-8000-000000000071' and calculation_version=${i+1}) is distinct from ${literal(rows)} then raise exception 'Combined SQL/preview parity case ${i} failed'; end if;
 end $assert$;\n`;
}
sql+='rollback;\n';
const path=process.argv.find(x=>x.startsWith('--out='))?.slice(6);
if(!path) throw new Error('--out=<disposable SQL fixture> required');
writeFileSync(path,sql);
console.log(`Generated ${cases.length} calculation parity cases: ${path}`);
