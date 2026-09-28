-- Run once in a new Supabase project's SQL Editor. No secret keys in the app.
begin;
create table public.pantry_items (
 user_id uuid not null references auth.users(id) on delete cascade,
 id uuid not null,
 data jsonb not null,
 version integer not null default 1 check(version > 0),
 mutation_id uuid not null,
 deleted boolean not null default false,
 updated_at timestamptz not null default now(),
 primary key(user_id,id),
 constraint item_data_shape check (coalesce(
  jsonb_typeof(data)='object' and (data->>'id')=id::text
  and jsonb_typeof(data->'name')='string' and length(btrim(data->>'name')) between 1 and 50
  and jsonb_typeof(data->'quantity')='number' and (data->>'quantity')::numeric > 0 and (data->>'quantity')::numeric <= 9999
  and data->>'place' in ('냉장','냉동','실온') and data->>'unit' in ('개','팩','봉','g','ml','단')
  and data->>'dateKind' in ('useby','sellby','unknown') and jsonb_typeof(data->'verified')='boolean'
  and data->>'ingredient' in ('두부','달걀','우유','요거트','치즈','대파','양파','당근','감자','애호박','버섯','시금치','양배추','토마토','오이','김치','밥','면','참치','기타')
  and jsonb_typeof(data->'demo')='boolean'
  and jsonb_typeof(data->'opened')='boolean' and jsonb_typeof(data->'note')='string' and length(data->>'note')<=150
 ,false))
);
alter table public.pantry_items enable row level security;
revoke all on public.pantry_items from anon, authenticated;
grant select on public.pantry_items to authenticated;
create policy "owner reads own pantry" on public.pantry_items for select to authenticated using ((select auth.uid())=user_id);

create function public.sync_pantry(p_changes jsonb default '[]'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 uid uuid := auth.uid(); change jsonb; item_id uuid; mutation uuid; base integer;
 current_row public.pantry_items%rowtype; found_row boolean; payload jsonb; date_value text;
 applied jsonb := '[]'; conflicts jsonb := '[]'; records jsonb;
begin
 if uid is null then raise exception 'Authentication required'; end if;
 if p_changes is null or jsonb_typeof(p_changes)<>'array' or jsonb_array_length(p_changes)>100 then raise exception 'Invalid changes'; end if;
 -- One transaction per owner prevents concurrent first-insert and row-limit races.
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 for change in select value from jsonb_array_elements(p_changes) loop
  if not(change ?& array['id','mutation_id','base_version','data','deleted']) then raise exception 'Missing fields'; end if;
  item_id := (change->>'id')::uuid; mutation := (change->>'mutation_id')::uuid; base := (change->>'base_version')::integer;
  if item_id is null or mutation is null or base is null or base<0 or jsonb_typeof(change->'deleted')<>'boolean' then raise exception 'Invalid mutation'; end if;
  payload := change->'data';
  if jsonb_typeof(payload)<>'object' or not(payload ?& array['id','name','ingredient','quantity','unit','place','date','dateKind','verified','opened','note','demo']) then raise exception 'Invalid item'; end if;
  if (select count(*) from jsonb_object_keys(payload))<>12 or payload->>'id'<>item_id::text or octet_length(payload::text)>4096 then raise exception 'Invalid item fields'; end if;
  if payload->>'ingredient' not in ('두부','달걀','우유','요거트','치즈','대파','양파','당근','감자','애호박','버섯','시금치','양배추','토마토','오이','김치','밥','면','참치','기타') then raise exception 'Invalid ingredient'; end if;
  date_value := payload->>'date';
  if date_value is null or jsonb_typeof(payload->'date')<>'string' then raise exception 'Invalid date'; end if;
  if date_value<>'' then
   if date_value !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$' or to_char(date_value::date,'YYYY-MM-DD')<>date_value or payload->'verified'<>'true'::jsonb then raise exception 'Unconfirmed date'; end if;
  end if;
  select * into current_row from public.pantry_items where user_id=uid and id=item_id;
  found_row := found;
  if found_row and current_row.mutation_id=mutation then
   applied := applied || jsonb_build_array(jsonb_build_object('id',item_id,'mutation_id',mutation,'version',current_row.version));
   continue;
  end if;
  if (found_row and current_row.version<>base) or (not found_row and base<>0) then
   conflicts := conflicts || jsonb_build_array(jsonb_build_object('id',item_id,'mutation_id',mutation)); continue;
  end if;
  if not (change->>'deleted')::boolean and (not found_row or current_row.deleted) and (select count(*) from public.pantry_items where user_id=uid and not deleted)>=100 then raise exception 'Pantry limit reached'; end if;
  insert into public.pantry_items(user_id,id,data,version,mutation_id,deleted)
  values(uid,item_id,payload,base+1,mutation,(change->>'deleted')::boolean)
  on conflict(user_id,id) do update set data=excluded.data,version=excluded.version,mutation_id=excluded.mutation_id,deleted=excluded.deleted,updated_at=now();
  applied := applied || jsonb_build_array(jsonb_build_object('id',item_id,'mutation_id',mutation,'version',base+1));
 end loop;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'data',data,'version',version,'mutation_id',mutation_id,'deleted',deleted,'updated_at',updated_at)),'[]'::jsonb) into records from public.pantry_items where user_id=uid;
 return jsonb_build_object('records',records,'applied',applied,'conflicts',conflicts);
end $$;
revoke all on function public.sync_pantry(jsonb) from public, anon;
grant execute on function public.sync_pantry(jsonb) to authenticated;
commit;
