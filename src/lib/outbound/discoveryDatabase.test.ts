import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import { renderFactOpener } from './candidateOpener'
import { extractResearchFacts } from './discoveryResearch'

let db: PGlite
const actor = '00000000-0000-4000-8000-000000000001'
const campaign = '00000000-0000-4000-8000-000000000002'
const facts = extractResearchFacts('מרכז למידה עם צוות מורים בקבוצות קטנות. צוות של 3 מורים', 'https://tutor.test/')
const opener = renderFactOpener(facts, [0, 2])!
const migrations = [
  '20260907120000_outbound_engine.sql', '20260907140000_outbound_mailboxes.sql',
  '20260908130000_outbound_v2.sql', '20260916140000_outbound_candidate_discovery.sql',
  '20260916141000_outbound_daily_permission_limit.sql',
  '20260916142000_outbound_candidate_research_quality.sql', '20260916143000_outbound_quality_automation.sql',
  '20260917140000_outbound_business_qualification.sql',
  '20260917160000_outbound_team_size_advisory.sql',
]
async function scalar<T>(sql: string, params: unknown[] = []): Promise<T> {
  return Object.values((await db.query<Record<string, T>>(sql, params)).rows[0]!)[0]!
}
async function candidate(email = 'office@tutor.test') {
  return scalar<string>(
    "INSERT INTO outbound_candidates(business_name, email, website_url, email_source_url, source_url, research_facts, quality_score, personal_line, opener_status, opener_fact_ids, review_status) VALUES ('מרכז למידה', $1, 'https://tutor.test/', 'https://tutor.test/contact', 'https://tutor.test/', $2, 90, $3, 'generated', '{0,2}', 'ready_for_review') RETURNING id",
    [email, JSON.stringify(facts), opener],
  )
}
async function promote(id: string, automatic = true) {
  return scalar<string>('SELECT promote_outbound_candidate($1, $2, $3)', [id, automatic ? null : actor, automatic])
}
async function enable() {
  await db.query('UPDATE outbound_discovery_settings SET auto_approve = true, campaign_id = $1', [campaign])
}
beforeAll(async () => {
  db = new PGlite()
  await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE TABLE profiles(id uuid PRIMARY KEY); CREATE TABLE organizations(id uuid PRIMARY KEY); CREATE FUNCTION update_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END $$;")
  for (const file of migrations) await db.exec(await readFile('supabase/migrations/' + file, 'utf8'))
  await db.query('INSERT INTO profiles(id) VALUES ($1)', [actor])
  await db.query("INSERT INTO outbound_campaigns(id, name, subject, body_text) VALUES ($1, 'Permission request', 'hello', '{{personal_line}} Send demo?')", [campaign])
}, 30_000)
afterAll(async () => { await db?.close() })
beforeEach(async () => { await db.exec('BEGIN') })
afterEach(async () => { await db.exec('ROLLBACK') })

describe('outbound discovery database invariants', () => {
  it('caps NEW candidates at 50/day and never overwrites reviewed candidates', async () => {
    const places = Array.from({ length: 80 }, (_, i) => ({ provider_place_id: 'p' + i, business_name: 'מורה ' + i }))
    const reserve = () => scalar<{ found: number }>('SELECT reserve_outbound_candidates($1, $2)', [JSON.stringify(places), '[]'])
    expect((await reserve()).found).toBe(50)
    await db.exec("UPDATE outbound_candidates SET review_status = 'rejected' WHERE provider_place_id = 'p0'")
    expect((await reserve()).found).toBe(0)
    expect(await scalar("SELECT review_status FROM outbound_candidates WHERE provider_place_id = 'p0'")).toBe('rejected')
    expect(await scalar('SELECT count(*)::int FROM outbound_candidates')).toBe(50)
  })
  it('claims three jobs at a time, skips live leases and ignores stale completion', async () => {
    for (let i = 0; i < 5; i++) await db.query("INSERT INTO outbound_candidates(business_name,research_requested_at) VALUES ('Tutor', now())")
    const first = await db.query<{ id: string; research_claimed_at: Date }>('SELECT * FROM claim_outbound_research(50)')
    const second = await db.query<{ id: string }>('SELECT * FROM claim_outbound_research(50)')
    expect(first.rows).toHaveLength(3)
    expect(second.rows).toHaveLength(2)
    expect(new Set([...first.rows, ...second.rows].map((row) => row.id)).size).toBe(5)
    const row = first.rows[0]!
    await db.query('UPDATE outbound_candidates SET research_claimed_at = NULL WHERE id = $1', [row.id])
    expect(await scalar('SELECT complete_outbound_research($1, $2, $3, $4)', [row.id, row.research_claimed_at, '{}', '[]'])).toBe(false)
  })
  it('reclaims expired jobs but never starts a fourth attempt', async () => {
    await db.exec("INSERT INTO outbound_candidates(business_name,research_requested_at,research_claimed_at,research_attempts) VALUES ('retry',now(),now()-interval '11 minutes',2),('exhausted',now(),now()-interval '11 minutes',3)")
    const rows = (await db.query<{ business_name: string; research_attempts: number }>('SELECT * FROM claim_outbound_research(3)')).rows
    expect(rows).toMatchObject([{ business_name: 'retry', research_attempts: 3 }])
  })
  it('requires opt-in and binds automatic promotion to the selected campaign', async () => {
    const id = await candidate()
    expect(await promote(id)).toBe('paused')
    await enable()
    expect(await promote(id)).toBe('approved')
    expect(await promote(id)).toBe('not_ready')
    expect(await scalar('SELECT count(*)::int FROM outbound_prospects')).toBe(1)
    expect(await scalar("SELECT metadata->>'approval_mode' FROM outbound_prospects")).toBe('automatic')
  })
  it.each(['quality_score = 69', "research_facts = '[]'", "personal_line = 'Invented fact'", "opener_status = 'failed'", "email_source_url = NULL"])('blocks both approval paths when %s', async (patch) => {
    const id = await candidate()
    await enable()
    await db.query('UPDATE outbound_candidates SET ' + patch + ' WHERE id = $1', [id])
    expect(await promote(id)).toBe('quality_blocked')
    expect(await promote(id, false)).toBe('quality_blocked')
    expect(await scalar('SELECT count(*)::int FROM outbound_prospects')).toBe(0)
  })
  it('requires two distinct source-backed facts, not duplicates', async () => {
    const id = await candidate()
    await enable()
    await db.query('UPDATE outbound_candidates SET research_facts = $2 WHERE id = $1', [id, JSON.stringify([facts[0], facts[0]])])
    expect(await promote(id)).toBe('quality_blocked')
  })
  it('refuses campaigns that would drop the personal line', async () => {
    const id = await candidate()
    await enable()
    await db.exec("UPDATE outbound_campaigns SET body_text = 'Generic message'")
    expect(await promote(id)).toBe('no_campaign')
  })
  it('checks suppression and duplicate prospects again inside promotion', async () => {
    const blocked = await candidate('blocked@tutor.test')
    const duplicate = await candidate('duplicate@tutor.test')
    await enable()
    await db.exec("INSERT INTO outbound_suppressions(email,reason) VALUES ('blocked@tutor.test','manual')")
    await db.query("INSERT INTO outbound_prospects(campaign_id,email,unsubscribe_token) VALUES ($1,'duplicate@tutor.test','12345678901234567890123456789012')", [campaign])
    expect(await promote(blocked)).toBe('suppressed')
    expect(await promote(duplicate)).toBe('duplicate')
    expect(await scalar('SELECT count(*)::int FROM outbound_prospects')).toBe(1)
  })
  it('stops queued automatic prospects when automation is paused', async () => {
    const id = await candidate()
    await enable()
    expect(await promote(id)).toBe('approved')
    await db.exec('UPDATE outbound_discovery_settings SET auto_approve = false')
    expect(await scalar("SELECT count(*)::int FROM claim_next_outbound_prospects(now(),interval '30 minutes',5,NULL,date_trunc('day',now()),50)")).toBe(0)
    await enable()
    expect(await scalar("SELECT count(*)::int FROM claim_next_outbound_prospects(now(),interval '30 minutes',5,NULL,date_trunc('day',now()),50)")).toBe(1)
  })
  it('reserves the last daily slot across successive in-flight send batches', async () => {
    await db.query("INSERT INTO outbound_prospects(campaign_id,email,unsubscribe_token,status,sent_at) SELECT $1,'sent'||i||'@tutor.test',md5(i::text),'sent',now() FROM generate_series(1,49) i", [campaign])
    await db.query("INSERT INTO outbound_prospects(campaign_id,email,unsubscribe_token) SELECT $1,'queued'||i||'@tutor.test',md5('q'||i) FROM generate_series(1,5) i", [campaign])
    const claim = () => scalar<number>("SELECT count(*)::int FROM claim_next_outbound_prospects(now(),interval '30 minutes',5,NULL,date_trunc('day',now()),50)")
    expect(await claim()).toBe(1)
    expect(await claim()).toBe(0)
  })
  it('does not expose privileged functions to anonymous or authenticated roles', async () => {
    for (const role of ['anon', 'authenticated']) {
      expect(await scalar('SELECT has_function_privilege($1, $2, $3)', [role, 'promote_outbound_candidate(uuid,uuid,boolean)', 'EXECUTE'])).toBe(false)
      expect(await scalar('SELECT has_function_privilege($1, $2, $3)', [role, 'reserve_outbound_candidates(jsonb,jsonb)', 'EXECUTE'])).toBe(false)
    }
  })
})


describe('business identity and strict proposal eligibility', () => {
  it('never collects a college', async () => {
    expect((await scalar<{found:number}>('SELECT reserve_outbound_candidates($1,$2)',[JSON.stringify([{provider_place_id:'iitc',business_name:'מכללת IITC'}]),'[]'])).found).toBe(0)
  })
  it('shows an unknown-size business to a person but never promotes it automatically', async () => {
    const id=await candidate()
    await db.query('UPDATE outbound_candidates SET research_facts=$2 WHERE id=$1',[id,JSON.stringify(facts.slice(0,3))])
    expect(await scalar('SELECT outbound_team_status(research_facts,website_url) FROM outbound_candidates WHERE id=$1',[id])).toBe('unknown')
    expect(await scalar('SELECT count(*)::int FROM list_eligible_outbound_candidates()')).toBe(1)
    await enable()
    expect(await promote(id)).toBe('quality_blocked')
    expect(await promote(id,false)).toBe('approved')
  })
  it('lets a person decide on conflicting counts, not automation', async () => {
    const id=await candidate()
    await db.query('UPDATE outbound_candidates SET research_facts=$2 WHERE id=$1',[id,JSON.stringify([...facts,...extractResearchFacts('צוות של 8 מורים','https://tutor.test/')])])
    expect(await scalar('SELECT outbound_team_status(research_facts,website_url) FROM outbound_candidates WHERE id=$1',[id])).toBe('conflict')
    expect(await scalar('SELECT count(*)::int FROM list_eligible_outbound_candidates()')).toBe(1)
    await enable()
    expect(await promote(id)).toBe('quality_blocked')
  })
  it('blocks large teams even with a perfect quality score', async () => {
    const id=await candidate()
    await db.query('UPDATE outbound_candidates SET research_facts=$2,quality_score=100 WHERE id=$1',[id,JSON.stringify(extractResearchFacts('מרכז למידה עם צוות של 46 מורים בקבוצות קטנות', 'https://tutor.test/'))])
    expect(await scalar('SELECT count(*)::int FROM list_eligible_outbound_candidates()')).toBe(0)
    expect(await promote(id,false)).toBe('quality_blocked')
  })
  it('shows one proposal per business and blocks another address after promotion', async () => {
    const first=await candidate('one@tutor.test'), second=await candidate('two@tutor.test')
    expect(await scalar('SELECT count(*)::int FROM list_eligible_outbound_candidates()')).toBe(1)
    expect(await promote(first,false)).toBe('approved')
    expect(await scalar('SELECT count(*)::int FROM list_eligible_outbound_candidates()')).toBe(0)
    expect(await promote(second,false)).toBe('duplicate')
  })
  it('retains rejection after deletion and across a changed place id and email', async () => {
    const id=await candidate()
    await db.query("UPDATE outbound_candidates SET review_status='rejected',rejection_reason='MANUAL' WHERE id=$1",[id])
    await db.query('DELETE FROM outbound_candidates WHERE id=$1',[id])
    const places=[{provider_place_id:'different-place',business_name:'מרכז למידה חדש',website_url:'https://www.tutor.test/contact'}]
    expect((await scalar<{found:number}>('SELECT reserve_outbound_candidates($1,$2)',[JSON.stringify(places),'[]'])).found).toBe(0)
    expect(await scalar('SELECT count(*)::int FROM outbound_candidates')).toBe(0)
  })
  it('remembers a deleted prospect with another email on its business domain', async () => {
    await db.query("INSERT INTO outbound_prospects(campaign_id,email,unsubscribe_token,status,sent_at) VALUES ($1,'old@tutor.test','12345678901234567890123456789012','sent',now())",[campaign])
    await db.exec('DELETE FROM outbound_prospects')
    expect(await scalar("SELECT count(*)::int FROM outbound_business_history")).toBeGreaterThan(0)
    const inserted=await db.query("INSERT INTO outbound_candidates(business_name,email,website_url) VALUES ('מרכז למידה','new@tutor.test','https://tutor.test') RETURNING id")
    expect(inserted.rows).toHaveLength(0)
  })
  it('matches local and international phone forms but does not merge Gmail businesses', async () => {
    expect(await scalar("SELECT outbound_identity_keys(NULL,'050-1234567',NULL,NULL) && outbound_identity_keys(NULL,'+972501234567',NULL,NULL)")).toBe(true)
    expect(await scalar("SELECT outbound_identity_keys('one@gmail.com',NULL,NULL,NULL) && outbound_identity_keys('two@gmail.com',NULL,NULL,NULL)")).toBe(false)
  })
  it('holds conflicting and off-site teacher counts', async () => {
    for (const [text,url] of [['צוות של 3 מורים. צוות של 8 מורים','https://tutor.test/'],['צוות של 3 מורים','https://other.test/']]) {
      expect(await scalar('SELECT outbound_team_qualified($1,$2)',[JSON.stringify(extractResearchFacts(text!,url!)),'https://tutor.test/'])).toBe(false)
    }
  })
  it('prevents privileged callers bypassing the new gate via the old function', async () => {
    expect(await scalar("SELECT has_function_privilege('service_role','promote_outbound_candidate_quality_v1(uuid,uuid,boolean)','EXECUTE')")).toBe(false)
    for (const role of ['anon','authenticated']) {
      expect(await scalar('SELECT has_function_privilege($1,$2,$3)',[role,'list_eligible_outbound_candidates(integer)','EXECUTE'])).toBe(false)
    }
  })
})


it('upgrades existing data without losing sent history or returning old proposals', async () => {
  const legacy = new PGlite()
  try {
    await legacy.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE TABLE profiles(id uuid PRIMARY KEY); CREATE TABLE organizations(id uuid PRIMARY KEY); CREATE FUNCTION update_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END $$;")
    for (const file of migrations.slice(0,-2)) await legacy.exec(await readFile('supabase/migrations/'+file,'utf8'))
    await legacy.query("INSERT INTO outbound_campaigns(id,name,subject,body_text) VALUES ($1,'old','hello','hello')",[campaign])
    await legacy.query("INSERT INTO outbound_prospects(campaign_id,email,company,unsubscribe_token,status,sent_at) VALUES ($1,'sent@old.test','Old business','12345678901234567890123456789012','sent',now())",[campaign])
    await legacy.exec("INSERT INTO outbound_candidates(business_name,email,website_url,review_status) VALUES ('מרכז למידה ישן','other@old.test','https://old.test','ready_for_review'),('מרכז למידה חדש','new@new.test','https://new.test','ready_for_review'),('מרכז למידה פסול','no@rejected.test','https://rejected.test','rejected')")
    for (const file of migrations.slice(-2)) await legacy.exec(await readFile('supabase/migrations/'+file,'utf8'))
    const rows=(await legacy.query<{email:string;review_status:string;research_requested_at:unknown}>('SELECT email,review_status,research_requested_at FROM outbound_candidates ORDER BY email')).rows
    expect(rows.find(r=>r.email==='other@old.test')?.review_status).toBe('duplicate')
    expect(rows.find(r=>r.email==='new@new.test')).toMatchObject({review_status:'new',research_requested_at:expect.anything()})
    expect(rows.find(r=>r.email==='no@rejected.test')?.review_status).toBe('rejected')
    expect((await legacy.query('SELECT * FROM list_eligible_outbound_candidates()')).rows).toHaveLength(0)
    expect((await legacy.query("SELECT id FROM outbound_prospects WHERE status='sent' AND sent_at IS NOT NULL")).rows).toHaveLength(1)
  } finally { await legacy.close() }
},30000)


it('uses the same numeric and Hebrew-word evidence rules in SQL',async()=>{
  for(const [text,expected] of [['צוות של שלושה מורים',true],['צוות המורים מונה שש מורות',false],['צוות של 3 מורים. צוות של שלושה מורים',true]] as const) {
    expect(await scalar('SELECT outbound_team_qualified($1,$2)',[JSON.stringify(extractResearchFacts(text,'https://tutor.test/')),'https://tutor.test/'])).toBe(expected)
  }
})
