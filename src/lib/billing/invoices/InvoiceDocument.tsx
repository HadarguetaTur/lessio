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
      src: 'https://fonts.gstatic.com/s/heebo/v26/NGS6v5_NC0k9P9H0TbFhsqMA.ttf',
      fontWeight: 400,
    },
    {
      src: 'https://fonts.gstatic.com/s/heebo/v26/NGS6v5_NC0k9P9H0TbFzsKMA.ttf',
      fontWeight: 700,
    },
  ],
})

// ─── Types ──────────────────────────────────────────────────────────────────

export interface InvoiceLineItem {
  description: string
  amount: number
}

export interface InvoiceDocumentProps {
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

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function InvoiceDocument({
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
  headerTitle = '\u05D7\u05E9\u05D1\u05D5\u05E0\u05D9\u05EA \u05DE\u05E1', // חשבונית מס
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
            <Text style={titleStyles}>{headerTitle}</Text>
            <Text style={styles.orgName}>{orgLegalName}</Text>
            {orgTaxId && (
              <Text style={styles.orgDetail}>
                {'\u05E2.\u05DE. '}{orgTaxId}
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
            <Text style={styles.metaLabel}>{'\u05DE\u05E1\u05E4\u05E8 \u05D7\u05E9\u05D1\u05D5\u05E0\u05D9\u05EA'}</Text>
            <Text style={styles.metaValue}>{invoiceNumber}</Text>
          </View>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>{'\u05EA\u05D0\u05E8\u05D9\u05DA'}</Text>
            <Text style={styles.metaValue}>{invoiceDate}</Text>
          </View>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>{'\u05EA\u05E7\u05D5\u05E4\u05EA \u05D7\u05D9\u05D5\u05D1'}</Text>
            <Text style={styles.metaValue}>{billingMonth}</Text>
          </View>
        </View>

        {/* Recipient */}
        <View style={styles.recipientSection}>
          <Text style={styles.recipientLabel}>{'\u05DC\u05DB\u05D1\u05D5\u05D3'}</Text>
          <Text style={styles.recipientName}>{parentName}</Text>
          <Text style={styles.recipientStudent}>
            {'\u05EA\u05DC\u05DE\u05D9\u05D3/\u05D4: '}{studentName}
          </Text>
        </View>

        {/* Reference invoice (for credit notes) */}
        {referenceInvoice && (
          <View style={{ marginBottom: 15 }}>
            <Text style={styles.referenceNote}>
              {'\u05DE\u05D1\u05D8\u05DC\u05EA \u05D7\u05E9\u05D1\u05D5\u05E0\u05D9\u05EA \u05DE\u05E1\u05F3 '}{referenceInvoice}
            </Text>
          </View>
        )}

        {/* Line items table */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <View style={styles.colDescription}>
              <Text style={styles.tableHeaderText}>{'\u05EA\u05D9\u05D0\u05D5\u05E8'}</Text>
            </View>
            <View style={styles.colAmount}>
              <Text style={styles.tableHeaderText}>{'\u05E1\u05DB\u05D5\u05DD'}</Text>
            </View>
          </View>

          {lineItems.map((item, i) => (
            <View key={i} style={styles.tableRow}>
              <View style={styles.colDescription}>
                <Text style={styles.tableRowText}>{item.description}</Text>
              </View>
              <View style={styles.colAmount}>
                <Text style={styles.tableRowText}>
                  {formatCurrency(item.amount, currency)}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View style={styles.totalsSection}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>{'\u05E1\u05DB\u05D5\u05DD \u05D1\u05D9\u05E0\u05D9\u05D9\u05DD'}</Text>
            <Text style={styles.totalValue}>
              {formatCurrency(subtotal, currency)}
            </Text>
          </View>
          {vatAmount > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{'\u05DE\u05E2"\u05DE'}</Text>
              <Text style={styles.totalValue}>
                {formatCurrency(vatAmount, currency)}
              </Text>
            </View>
          )}
          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>{'\u05E1\u05D4"\u05DB \u05DC\u05EA\u05E9\u05DC\u05D5\u05DD'}</Text>
            <Text style={styles.grandTotalValue}>
              {formatCurrency(total, currency)}
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
