import path from 'path'
import React from 'react'
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer'

import type { ProgressReportData } from '@/lib/students/progressReport'
import { formatProgressReportLessonDate } from '@/lib/students/progressReport'

Font.register({
  family: 'Heebo',
  fonts: [
    {
      src: path.join(process.cwd(), 'public/fonts/Heebo-Regular.ttf'),
      fontWeight: 400,
    },
    {
      src: path.join(process.cwd(), 'public/fonts/Heebo-Bold.ttf'),
      fontWeight: 700,
    },
  ],
})

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Heebo',
    fontSize: 10,
    padding: 40,
    paddingBottom: 56,
    direction: 'rtl',
  },
  header: {
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: '#2563eb',
  },
  title: {
    fontSize: 20,
    fontWeight: 700,
    color: '#2563eb',
    textAlign: 'right',
    marginBottom: 6,
  },
  orgName: {
    fontSize: 13,
    fontWeight: 700,
    textAlign: 'right',
  },
  orgDetail: {
    fontSize: 9,
    color: '#6b7280',
    textAlign: 'right',
    marginTop: 2,
  },
  meta: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    marginBottom: 20,
    gap: 8,
  },
  metaBlock: { textAlign: 'right', flex: 1 },
  metaLabel: { fontSize: 8, color: '#9ca3af', marginBottom: 2 },
  metaValue: { fontSize: 11, fontWeight: 700 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: '#111827',
    textAlign: 'right',
    marginTop: 14,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingBottom: 4,
  },
  paragraph: {
    textAlign: 'right',
    fontSize: 10,
    color: '#374151',
    marginBottom: 6,
    lineHeight: 1.4,
  },
  tableHeader: {
    flexDirection: 'row-reverse',
    backgroundColor: '#f3f4f6',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  tableRow: {
    flexDirection: 'row-reverse',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  th: { fontSize: 8, fontWeight: 700, color: '#6b7280', textAlign: 'right' },
  td: { fontSize: 9, textAlign: 'right', color: '#111827' },
  col1: { flex: 2 },
  col2: { flex: 1 },
  colScore: { flex: 1, textAlign: 'left' },
  goalItem: {
    marginBottom: 6,
    paddingRight: 8,
    borderRightWidth: 2,
    borderRightColor: '#e5e7eb',
  },
  goalSubject: { fontSize: 9, color: '#6b7280', textAlign: 'right' },
  goalDesc: { fontSize: 10, textAlign: 'right', marginTop: 2 },
  noteBox: {
    backgroundColor: '#f9fafb',
    padding: 8,
    marginBottom: 8,
    borderRadius: 4,
    textAlign: 'right',
  },
  noteMeta: { fontSize: 8, color: '#9ca3af', marginTop: 4, textAlign: 'right' },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 40,
    right: 40,
    textAlign: 'center',
    fontSize: 8,
    color: '#9ca3af',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 8,
  },
})

export interface ProgressReportDocumentProps {
  data: ProgressReportData
  orgTimezone: string
  /**
   * Translator bound to `studentProfile.progressReportPdf`, resolved by the
   * caller in the recipient's locale. The document is rendered by
   * @react-pdf/renderer outside a request scope, so it cannot resolve one itself.
   */
  t: (key: string, values?: Record<string, string | number | Date>) => string
}

export default function ProgressReportDocument({ data, orgTimezone, t }: ProgressReportDocumentProps) {
  const { student, org, period, attendance, homework, exams, goals, visibleNotes, generatedAtIso } = data

  const genLabel = formatProgressReportLessonDate(generatedAtIso, orgTimezone)

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>
            {t('title')}
          </Text>
          <Text style={styles.orgName}>{org.name}</Text>
          {org.businessAddress ? (
            <Text style={styles.orgDetail}>{org.businessAddress}</Text>
          ) : null}
          {org.whatsappNumber ? (
            <Text style={styles.orgDetail}>{org.whatsappNumber}</Text>
          ) : null}
        </View>

        <View style={styles.meta}>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>{t('student')}</Text>
            <Text style={styles.metaValue}>{student.name}</Text>
          </View>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>{t('period')}</Text>
            <Text style={styles.metaValue}>
              {period.labelFrom} – {period.labelTo}
            </Text>
          </View>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>{t('generatedAt')}</Text>
            <Text style={styles.metaValue}>{genLabel}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>{t('attendance')}</Text>
        <Text style={styles.paragraph}>
          {t('attendanceLine', {
            completed: attendance.completed,
            total: attendance.total,
            percent: attendance.ratePercent,
          })}
          {attendance.cancelled > 0 || attendance.noShow > 0
            ? t('attendanceExtra', { cancelled: attendance.cancelled, noShow: attendance.noShow })
            : ''}
        </Text>

        <Text style={styles.sectionTitle}>{t('homework')}</Text>
        <Text style={styles.paragraph}>
          {t('homeworkLine', {
            completed: homework.completed,
            total: homework.total,
            percent: homework.completionRatePercent,
          })}
          {homework.avgScore != null ? t('homeworkAvg', { score: homework.avgScore }) : ''}
        </Text>
        {homework.rows.length > 0 && (
          <View style={{ marginTop: 8 }}>
            <View style={styles.tableHeader}>
              <View style={styles.col1}>
                <Text style={styles.th}>{t('colTask')}</Text>
              </View>
              <View style={styles.col2}>
                <Text style={styles.th}>{t('colStatus')}</Text>
              </View>
              <View style={styles.colScore}>
                <Text style={styles.th}>{t('colScore')}</Text>
              </View>
            </View>
            {homework.rows.map((r, i) => (
              <View key={i} style={styles.tableRow} wrap={false}>
                <View style={styles.col1}>
                  <Text style={styles.td}>{r.assignmentTitle}</Text>
                </View>
                <View style={styles.col2}>
                  <Text style={styles.td}>{t(`hwStatus.${r.status}`)}</Text>
                </View>
                <View style={styles.colScore}>
                  <Text style={styles.td}>
                    {r.score != null ? `${r.score}/${r.maxScore}` : '—'}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {exams.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>{t('exams')}</Text>
            <View style={styles.tableHeader}>
              <View style={styles.col1}>
                <Text style={styles.th}>{t('colDate')}</Text>
              </View>
              <View style={styles.col1}>
                <Text style={styles.th}>{t('colTitle')}</Text>
              </View>
              <View style={styles.col2}>
                <Text style={styles.th}>{t('colSubject')}</Text>
              </View>
              <View style={styles.colScore}>
                <Text style={styles.th}>{t('colScore')}</Text>
              </View>
            </View>
            {exams.map((ex) => (
              <View key={ex.id} style={styles.tableRow} wrap={false}>
                <View style={styles.col1}>
                  <Text style={styles.td}>{ex.examDate}</Text>
                </View>
                <View style={styles.col1}>
                  <Text style={styles.td}>{ex.title}</Text>
                </View>
                <View style={styles.col2}>
                  <Text style={styles.td}>{ex.subject}</Text>
                </View>
                <View style={styles.colScore}>
                  <Text style={styles.td}>{`${ex.score}/${ex.maxScore}`}</Text>
                </View>
              </View>
            ))}
          </>
        )}

        <Text style={styles.sectionTitle}>{t('goals')}</Text>
        {goals.active.length === 0 && goals.achieved.length === 0 && goals.abandoned.length === 0 ? (
          <Text style={styles.paragraph}>{t('noGoals')}</Text>
        ) : (
          <>
            {goals.active.length > 0 && (
              <Text style={{ ...styles.paragraph, fontWeight: 700 }}>{t('goalsActive')}</Text>
            )}
            {goals.active.map((g) => (
              <View key={g.id} style={styles.goalItem}>
                <Text style={styles.goalSubject}>{g.subject}</Text>
                <Text style={styles.goalDesc}>{g.description}</Text>
              </View>
            ))}
            {goals.achieved.length > 0 && (
              <Text style={{ ...styles.paragraph, fontWeight: 700, marginTop: 8 }}>{t('goalsAchieved')}</Text>
            )}
            {goals.achieved.map((g) => (
              <View key={g.id} style={styles.goalItem}>
                <Text style={styles.goalSubject}>{g.subject}</Text>
                <Text style={styles.goalDesc}>{g.description}</Text>
              </View>
            ))}
            {goals.abandoned.length > 0 && (
              <Text style={{ ...styles.paragraph, fontWeight: 700, marginTop: 8 }}>{t('goalsAbandoned')}</Text>
            )}
            {goals.abandoned.map((g) => (
              <View key={g.id} style={styles.goalItem}>
                <Text style={styles.goalSubject}>{g.subject}</Text>
                <Text style={styles.goalDesc}>{g.description}</Text>
              </View>
            ))}
          </>
        )}

        {visibleNotes.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>
              {t('teacherNotes')}
            </Text>
            {visibleNotes.map((n, i) => (
              <View key={i} style={styles.noteBox} wrap={false}>
                <Text style={styles.paragraph}>{n.body}</Text>
                <Text style={styles.noteMeta}>
                  {n.teacherName}
                  {n.lessonStartAt
                    ? ` · ${formatProgressReportLessonDate(n.lessonStartAt, orgTimezone)}`
                    : ''}
                </Text>
              </View>
            ))}
          </>
        )}

        <View style={styles.footer}>
          <Text>{org.name}</Text>
          <Text style={{ marginTop: 4 }}>
            {t('generatedBy')}
          </Text>
        </View>
      </Page>
    </Document>
  )
}
