delete from televoting.historical_vote_observations
where source_key='ssc20_grand_final_country_detailed_pdf_2026_09_09';

with edition as (
  select id from public.editions where edition_number=20 order by created_at limit 1
),
targets(code) as (
  select value from jsonb_array_elements_text('["JAU","ABE","NOR","AQU","LUN","ONY","CYC","VOL","UDI","SWA","EDR","FEN","YAR","LIN","MIZ","VEN","DIA","OTE","CIL","OLA","INT","AET","AOT","ZAR","AST","ORN"]'::jsonb)
),
voters(code) as (
  select value from jsonb_array_elements_text('["ONY","ABE","OLA","CIL","EDR","INT","RAO","UDI","CYC","YAR","AST","FEN","AET","MIZ","OTE","JAU","LIN","DIA","AQU","VEN","NOR","WIT","AOT","SWA","ORN"]'::jsonb)
),
positive as (
  select v.key as voter_code, t.key as target_code, (t.value #>> '{}')::integer as score
  from jsonb_each('{"ONY":{"JAU":1,"ABE":5,"FEN":5,"VEN":1,"AET":5,"ORN":3},"ABE":{"JAU":1,"AQU":2,"ONY":4,"CYC":2,"UDI":1,"FEN":1,"YAR":1,"LIN":1,"INT":4,"AOT":3,"ORN":1},"OLA":{"SWA":2,"CIL":1,"AOT":17},"CIL":{"ABE":1,"NOR":1,"LUN":3,"ONY":4,"CYC":4,"FEN":1,"YAR":2,"MIZ":2,"VEN":1,"AOT":1},"EDR":{"ABE":1,"AQU":2,"YAR":6,"VEN":1,"DIA":3,"ZAR":7},"INT":{"AQU":6,"CYC":1,"EDR":1,"OTE":3,"AOT":9,"ZAR":1},"RAO":{"JAU":18},"UDI":{"JAU":1,"ABE":1,"NOR":1,"AQU":1,"ONY":1,"VOL":1,"SWA":1,"FEN":1,"YAR":1,"LIN":1,"MIZ":1,"VEN":1,"DIA":1,"OTE":1,"INT":1,"AET":1,"AOT":1,"ZAR":1,"AST":1,"ORN":1},"CYC":{"JAU":1,"NOR":1,"AQU":1,"ONY":1,"UDI":1,"SWA":1,"EDR":1,"FEN":2,"YAR":2,"LIN":1,"MIZ":1,"DIA":1,"OLA":1,"INT":1,"AET":1,"AOT":1,"AST":1,"ORN":1},"YAR":{"JAU":1,"NOR":1,"ONY":1,"CYC":1,"VOL":1,"UDI":1,"EDR":2,"FEN":1,"MIZ":1,"VEN":1,"DIA":1,"OTE":1,"CIL":1,"OLA":1,"INT":1,"AET":1,"AOT":1,"ORN":2},"AST":{"AQU":1,"CYC":3,"LIN":5,"DIA":1,"ORN":10},"FEN":{"JAU":1,"ABE":1,"NOR":2,"CYC":2,"UDI":1,"SWA":3,"EDR":2,"YAR":1,"DIA":2,"CIL":1,"OLA":3,"AST":1},"AET":{"JAU":5,"ONY":5,"CYC":3,"UDI":1,"YAR":4,"VEN":2},"MIZ":{"JAU":1,"ABE":1,"NOR":1,"AQU":1,"LUN":1,"ONY":1,"CYC":1,"VOL":1,"UDI":1,"SWA":1,"EDR":1,"FEN":1,"YAR":1,"DIA":1,"OTE":1,"CIL":1,"OLA":1,"INT":2,"ZAR":1},"OTE":{"JAU":1,"UDI":2,"SWA":2,"EDR":1,"YAR":2,"MIZ":3,"VEN":4,"INT":1,"ZAR":1,"ORN":3},"JAU":{"UDI":3,"YAR":3,"LIN":1,"MIZ":1,"VEN":1,"OTE":3,"AET":8},"LIN":{"ABE":1,"AQU":4,"DIA":2,"CIL":5,"AST":5,"ORN":3},"DIA":{"NOR":4,"SWA":4,"FEN":4,"ORN":8},"AQU":{"JAU":2,"ABE":6,"ONY":4,"CYC":5,"INT":2},"VEN":{"ABE":1,"ONY":2,"SWA":5,"EDR":1,"FEN":1,"OTE":3,"OLA":3,"INT":2,"AOT":2},"NOR":{"SWA":4,"FEN":4,"YAR":1,"DIA":4,"CIL":1,"AET":1,"AOT":1,"ZAR":1,"ORN":2},"WIT":{"ABE":2,"FEN":1,"AET":1,"AST":1,"ORN":15},"AOT":{"ONY":3,"FEN":4,"VEN":2,"OLA":5,"INT":5,"AET":1},"SWA":{"ABE":1,"NOR":2,"CYC":3,"UDI":2,"EDR":1,"FEN":3,"MIZ":2,"VEN":2,"DIA":2,"ORN":2},"ORN":{"ABE":4,"ONY":9,"CYC":1,"LIN":1,"DIA":1,"AOT":1,"AST":3}}'::jsonb) v
  cross join lateral jsonb_each(v.value) t
),
eligible as (
  select v.code voter_code,t.code target_code,coalesce(p.score,0)::integer score
  from voters v cross join targets t
  left join positive p on p.voter_code=v.code and p.target_code=t.code
  where t.code<>v.code
)
insert into televoting.historical_vote_observations (
  source_key,solaris_edition_id,edition_number,round_key,round_name,
  voter_country_code,target_country_code,score,source_label,metadata
)
select
  'ssc20_grand_final_country_detailed_pdf_2026_09_09',edition.id,20,'grand_final','Grand Final',
  e.voter_code,e.target_code,e.score,'Televoting SSC20.pdf · page 1',
  jsonb_build_object(
    'authority','organizer_pdf',
    'activity_points_excluded',true,
    'scale','legacy_country_contribution',
    'data_sha256','ac9bbae642fe14d728c989355997e1a0548e0c80d18f07540253007422e933b3'
  )
from eligible e cross join edition;

-- legacy_import_metadata exists only on some deployed histories. Historical
-- vote observations are canonical without it, so enrich it only when present.
do $$
begin
  if to_regclass('televoting.legacy_import_metadata') is not null then
    update televoting.legacy_import_metadata
    set metadata = jsonb_build_object(
      'edition_number',20,
      'round','Grand Final',
      'source','Televoting SSC20.pdf supplied by organizer in ChatGPT on 2026-09-09',
      'status','historical_import_corrected_from_pdf',
      'authority','uploaded_pdf_page_1',
      'historical_source_key','ssc20_grand_final_country_detailed_pdf_2026_09_09',
      'historical_observation_table','televoting.historical_vote_observations',
      'formula','weighted_score = raw * (28 - placement)^2',
      'participant_count',26,
      'country_voter_count',25,
      'eligible_country_observations',627,
      'activity_points_label','AP',
      'activity_points_meaning','Activity Points, not a country/delegation voter; excluded from friend-voting observations',
      'activity_points_by_target','{"JAU":25,"ABE":25,"NOR":25,"AQU":24,"LUN":0,"ONY":25,"CYC":25,"VOL":5,"UDI":25,"SWA":25,"EDR":23,"FEN":25,"YAR":23,"LIN":25,"MIZ":25,"VEN":25,"DIA":25,"OTE":20,"CIL":24,"OLA":25,"INT":25,"AET":25,"AOT":25,"ZAR":10,"AST":20,"ORN":24}'::jsonb,
      'raw_totals_by_target','{"JAU":58,"ABE":50,"NOR":38,"AQU":42,"LUN":4,"ONY":60,"CYC":51,"VOL":8,"UDI":38,"SWA":48,"EDR":33,"FEN":54,"YAR":47,"LIN":35,"MIZ":36,"VEN":41,"DIA":44,"OTE":32,"CIL":34,"OLA":39,"INT":44,"AET":44,"AOT":62,"ZAR":22,"AST":32,"ORN":75}'::jsonb,
      'raw_total',1071,
      'activity_points_total',573,
      'country_vote_contribution_total',498,
      'nonblank_country_vote_cells',219,
      'point_pool',2378,
      'floored_total',2365,
      'final_total',2378,
      'data_sha256','ac9bbae642fe14d728c989355997e1a0548e0c80d18f07540253007422e933b3',
      'validation',jsonb_build_object(
        'all_26_raw_rows_equal_ap_plus_country_cells',true,
        'official_round_result_total_unchanged',2378,
        'self_vote_nonblank_cells',0,
        'pdf_extracted_by_position_not_blank_offset_guessing',true
      )
    ), imported_at=now()
    where import_key='ssc20_grand_final_detailed_televote_2026_09_09';
  end if;
end
$$;
