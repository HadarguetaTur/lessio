-- Sprint 4: transactional lead conversion
-- Converts one lead into one parent + one student + one primary relationship.

create or replace function convert_lead(
  p_lead_id uuid,
  p_org_id uuid,
  p_parent_full_name text,
  p_student_full_name text,
  p_grade text default null
)
returns table(parent_id uuid, student_id uuid)
language plpgsql
as $$
declare
  v_phone text;
  v_status text;
begin
  select phone, status
  into v_phone, v_status
  from leads
  where id = p_lead_id
    and organization_id = p_org_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'lead_not_found';
  end if;

  if v_status = 'converted' then
    raise exception using errcode = 'P0001', message = 'lead_already_converted';
  end if;

  if exists (
    select 1
    from parents
    where organization_id = p_org_id
      and phone = v_phone
  ) then
    raise exception using errcode = 'P0001', message = 'phone_already_parent';
  end if;

  insert into parents (organization_id, full_name, phone)
  values (p_org_id, p_parent_full_name, v_phone)
  returning id into parent_id;

  insert into students (organization_id, full_name, grade)
  values (p_org_id, p_student_full_name, nullif(p_grade, ''))
  returning id into student_id;

  insert into relationships (organization_id, parent_id, student_id, is_primary)
  values (p_org_id, parent_id, student_id, true);

  update leads
  set status = 'converted',
      updated_at = now()
  where id = p_lead_id
    and organization_id = p_org_id;

  return next;
exception
  when unique_violation then
    if exists (
      select 1
      from parents
      where organization_id = p_org_id
        and phone = v_phone
    ) then
      raise exception using errcode = 'P0001', message = 'phone_already_parent';
    end if;

    raise;
end;
$$;
