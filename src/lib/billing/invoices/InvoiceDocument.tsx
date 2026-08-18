import path from 'path'
import React from 'react'
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from '@react-pdf/renderer'

// ─── Register Heebo font for Hebrew RTL support ─────────────────────────────

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

// ─── Types ──────────────────────────────────────────────────────────────────

export interface InvoiceLineItem {
  description: string
  amount: number
}

/**
 * Every label the invoice prints, pre-resolved by the generator.
 *
 * The document is rendered by @react-pdf/renderer outside a request scope, so
 * it cannot call `getTranslations()` itself — the caller resolves the recipient's
 * locale and passes the finished strings in.
 */
export interface InvoiceLabels {
  title: string
  taxIdPrefix: string
  invoiceNumber: string
  date: string
  billingPeriod: string
  recipient: string
  studentPrefix: string
  voids: string
  colDescription: string
  colAmount: string
  subtotal: string
  vat: string
  grandTotal: string
}

export interface InvoiceDocumentProps {
  labels: InvoiceLabels
  /** BCP 47 tag for number formatting, e.g. "he-IL" or "en-US". */
  intlLocale: string
  // Org branding
  orgLegalName: string
  orgTaxId: string | null
  orgAddress: string | null
  orgLogoUrl: string | null
  currency: string

  // Recipient
  parentName: string
  studentName: string

  // Billing details
  billingMonth: string // e.g. "2026-04"
  lineItems: InvoiceLineItem[]
  subtotal: number
  vatAmount: number
  total: number

  // Invoice metadata
  invoiceNumber: string
  invoiceDate: string // formatted date string

  // Optional: header title override (used by CreditNoteDocument)
  headerTitle?: string
  headerColor?: string
  referenceInvoice?: string
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Heebo',
    fontSize: 10,
    padding: 40,
    direction: 'rtl',
  },
  header: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    marginBottom: 30,
    paddingBottom: 15,
    borderBottomWidth: 2,
    borderBottomColor: '#2563eb',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 700,
    color: '#2563eb',
    textAlign: 'right',
  },
  orgInfo: {
    textAlign: 'right',
    flex: 1,
  },
  orgName: {
    fontSize: 14,
    fontWeight: 700,
    marginBottom: 4,
  },
  orgDetail: {
    fontSize: 9,
    color: '#6b7280',
    marginBottom: 2,
  },
  metaSection: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    marginBottom: 25,
  },
  metaBlock: {
    textAlign: 'right',
  },
  metaLabel: {
    fontSize: 8,
    color: '#9ca3af',
    marginBottom: 2,
  },
  metaValue: {
    fontSize: 11,
    fontWeight: 700,
  },
  recipientSection: {
    marginBottom: 25,
    textAlign: 'right',
  },
  recipientLabel: {
    fontSize: 8,
    color: '#9ca3af',
    marginBottom: 4,
  },
  recipientName: {
    fontSize: 12,
    fontWeight: 700,
  },
  recipientStudent: {
    fontSize: 10,
    color: '#6b7280',
    marginTop: 2,
  },
  table: {
    marginBottom: 20,
  },
  tableHeader: {
    flexDirection: 'row-reverse',
    backgroundColor: '#f3f4f6',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  tableRow: {
    flexDirection: 'row-reverse',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  colDescription: {
    flex: 3,
    textAlign: 'right',
  },
  colAmount: {
    flex: 1,
    textAlign: 'left',
  },
  tableHeaderText: {
    fontSize: 9,
    fontWeight: 700,
    color: '#6b7280',
  },
  tableRowText: {
    fontSize: 10,
  },
  totalsSection: {
    alignItems: 'flex-start',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 2,
    borderTopColor: '#e5e7eb',
  },
  totalRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    width: 200,
    marginBottom: 4,
  },
  totalLabel: {
    fontSize: 10,
    color: '#6b7280',
    textAlign: 'right',
  },
  totalValue: {
    fontSize: 10,
    textAlign: 'left',
  },
  grandTotalRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    width: 200,
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#2563eb',
  },
  grandTotalLabel: {
    fontSize: 13,
    fontWeight: 700,
    textAlign: 'right',
  },
  grandTotalValue: {
    fontSize: 13,
    fontWeight: 700,
    textAlign: 'left',
  },
  referenceNote: {
    marginTop: 8,
    fontSize: 9,
    color: '#6b7280',
    textAlign: 'right',
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    textAlign: 'center',
    fontSize: 8,
    color: '#9ca3af',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 10,
  },
})

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatCurrency(amount: number, currency: string, intlLocale: string): string {
  return new Intl.NumberFormat(intlLocale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function InvoiceDocument({
  labels,
  intlLocale,
  orgLegalName,
  orgTaxId,
  orgAddress,
  currency,
  parentName,
  studentName,
  billingMonth,
  lineItems,
  subtotal,
  vatAmount,
  total,
  invoiceNumber,
  invoiceDate,
  headerTitle,
  headerColor = '#2563eb',
  referenceInvoice,
}: InvoiceDocumentProps) {
  const headerStyles = {
    ...styles.header,
    borderBottomColor: headerColor,
  }
  const titleStyles = {
    ...styles.headerTitle,
    color: headerColor,
  }

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={headerStyles}>
          <View style={styles.orgInfo}>
            <Text style={titleStyles}>{headerTitle ?? labels.title}</Text>
            <Text style={styles.orgName}>{orgLegalName}</Text>
            {orgTaxId && (
              <Text style={styles.orgDetail}>
                {labels.taxIdPrefix}{orgTaxId}
              </Text>
            )}
            {orgAddress && (
              <Text style={styles.orgDetail}>{orgAddress}</Text>
            )}
          </View>
        </View>

        {/* Meta: invoice number, date, billing month */}
        <View style={styles.metaSection}>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>{labels.invoiceNumber}</Text>
            <Text style={styles.metaValue}>{invoiceNumber}</Text>
          </View>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>{labels.date}</Text>
            <Text style={styles.metaValue}>{invoiceDate}</Text>
          </View>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>{labels.billingPeriod}</Text>
            <Text style={styles.metaValue}>{billingMonth}</Text>
          </View>
        </View>

        {/* Recipient */}
        <View style={styles.recipientSection}>
          <Text style={styles.recipientLabel}>{labels.recipient}</Text>
          <Text style={styles.recipientName}>{parentName}</Text>
          <Text style={styles.recipientStudent}>
            {labels.studentPrefix}{studentName}
          </Text>
        </View>

        {/* Reference invoice (for credit notes) */}
        {referenceInvoice && (
          <View style={{ marginBottom: 15 }}>
            <Text style={styles.referenceNote}>
              {labels.voids}{referenceInvoice}
            </Text>
          </View>
        )}

        {/* Line items table */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <View style={styles.colDescription}>
              <Text style={styles.tableHeaderText}>{labels.colDescription}</Text>
            </View>
            <View style={styles.colAmount}>
              <Text style={styles.tableHeaderText}>{labels.colAmount}</Text>
            </View>
          </View>

          {lineItems.map((item, i) => (
            <View key={i} style={styles.tableRow}>
              <View style={styles.colDescription}>
                <Text style={styles.tableRowText}>{item.description}</Text>
              </View>
              <View style={styles.colAmount}>
                <Text style={styles.tableRowText}>
                  {formatCurrency(item.amount, currency, intlLocale)}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View style={styles.totalsSection}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>{labels.subtotal}</Text>
            <Text style={styles.totalValue}>
              {formatCurrency(subtotal, currency, intlLocale)}
            </Text>
          </View>
          {vatAmount > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{labels.vat}</Text>
              <Text style={styles.totalValue}>
                {formatCurrency(vatAmount, currency, intlLocale)}
              </Text>
            </View>
          )}
          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>{labels.grandTotal}</Text>
            <Text style={styles.grandTotalValue}>
              {formatCurrency(total, currency, intlLocale)}
            </Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text>{orgLegalName}</Text>
        </View>
      </Page>
    </Document>
  )
}
