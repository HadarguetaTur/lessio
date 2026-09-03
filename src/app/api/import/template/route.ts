/**
 * GET /api/import/template?type=students|parents|teachers|lessons-schedule|lessons-history
 *
 * Returns a downloadable UTF-8 CSV template for the given entity type.
 */

import { NextRequest, NextResponse } from 'next/server'
import { commonError } from '@/lib/i18n/actionErrors'
import { getAppLocale } from '@/lib/i18n/serverTranslator'
import { getSession } from '@/lib/auth/session'
import { generateTemplate, getTemplateFilename } from '@/lib/import/templates'
import type { EntityType } from '@/lib/import/validators'

const VALID_TYPES: EntityType[] = ['students', 'parents', 'teachers', 'lessons-schedule', 'lessons-history', 'family-list']

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!['owner', 'admin'].includes(session.role)) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  const entityType = request.nextUrl.searchParams.get('type') as string

  if (!VALID_TYPES.includes(entityType as EntityType)) {
    return NextResponse.json({ error: await commonError('invalidData') }, { status: 400 })
  }

  const locale = await getAppLocale()
  const buffer = await generateTemplate(entityType as EntityType, locale)
  const filename = getTemplateFilename(entityType as EntityType, locale)
  const asciiFilename = getTemplateFilename(entityType as EntityType, 'en')

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  })
}
