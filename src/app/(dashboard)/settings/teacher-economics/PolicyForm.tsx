'use client'

import { useState } from 'react'

interface PolicyFormProps {
  action: (formData: FormData) => void | Promise<void>
  labels: {
    newPolicy: string
    scope: string
    model: string
    hourly: string
    fixed: string
    percentage: string
    basePlus: string
    hourlyAmount: string
    fixedAmount: string
    revenuePercent: string
    participantAmount: string
    noShowPercent: string
    lateCancellationPercent: string
    effectiveFrom: string
    effectiveTo: string
    requiresConfirmation: string
    savePolicy: string
    organizationDefault: string
    required: string
    notUsed: string
    baseRateType: string
    baseHourly: string
    baseFixed: string
  }
  teachers: { id: string; name: string }[]
}

type Model = 'hourly' | 'fixed_per_lesson' | 'percentage_revenue' | 'base_plus_participant'
type BaseRateType = 'hourly' | 'fixed_per_lesson'
const selectClass = 'mt-1 block w-full rounded border border-input bg-background p-2 text-sm text-foreground'

function PolicyField({
  name,
  label,
  notUsedLabel,
  type = 'number',
  active = true,
  required = false,
  min,
  max,
  step,
  defaultValue,
}: {
  name: string
  label: string
  notUsedLabel: string
  type?: string
  active?: boolean
  required?: boolean
  min?: string
  max?: string
  step?: string
  defaultValue?: string
}) {
  const descriptionId = `${name}-help`
  const fieldClass = `mt-1 block w-full rounded border p-2 text-sm transition-colors ${
    active ? 'border-input bg-background text-foreground' : 'cursor-not-allowed border-muted bg-muted/60 text-muted-foreground'
  }`
  return (
    <div className={!active ? 'opacity-60' : undefined}>
      <label htmlFor={name} className="block text-sm font-medium text-foreground">
        {label} {required && <span className="text-red-600" aria-hidden="true">*</span>}
        {!active && <span className="ms-1 text-xs font-normal text-muted-foreground">({notUsedLabel})</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        min={min}
        max={max}
        step={step}
        defaultValue={defaultValue}
        disabled={!active}
        required={active && required}
        aria-required={active && required}
        aria-disabled={!active}
        aria-describedby={descriptionId}
        className={fieldClass}
      />
      <span id={descriptionId} className="sr-only">{active ? label : notUsedLabel}</span>
    </div>
  )
}

export function PolicyForm({ action, labels, teachers }: PolicyFormProps) {
  const [model, setModel] = useState<Model>('hourly')
  const [baseRateType, setBaseRateType] = useState<BaseRateType>('hourly')

  const isActive = (field: 'hourly' | 'fixed' | 'percentage' | 'participant') => {
    if (field === 'hourly') return model === 'hourly' || (model === 'base_plus_participant' && baseRateType === 'hourly')
    if (field === 'fixed') return model === 'fixed_per_lesson' || (model === 'base_plus_participant' && baseRateType === 'fixed_per_lesson')
    if (field === 'percentage') return model === 'percentage_revenue'
    return model === 'base_plus_participant'
  }

  return (
    <form action={action} className="grid gap-4 rounded-lg border bg-card p-5 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <h2 className="text-lg font-semibold">{labels.newPolicy}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          <span className="text-red-600" aria-hidden="true">*</span> {labels.required}
        </p>
      </div>

      <div>
        <label htmlFor="teacher_id" className="block text-sm font-medium text-foreground">{labels.scope}</label>
        <select id="teacher_id" name="teacher_id" className={selectClass}>
          <option value="">{labels.organizationDefault}</option>
          {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}
        </select>
      </div>

      <div>
        <label htmlFor="model" className="block text-sm font-medium text-foreground">{labels.model} <span className="text-red-600" aria-hidden="true">*</span></label>
        <select id="model" name="model" value={model} onChange={(event) => setModel(event.target.value as Model)} required className={selectClass}>
          <option value="hourly">{labels.hourly}</option>
          <option value="fixed_per_lesson">{labels.fixed}</option>
          <option value="percentage_revenue">{labels.percentage}</option>
          <option value="base_plus_participant">{labels.basePlus}</option>
        </select>
      </div>

      {model === 'base_plus_participant' && <div className="sm:col-span-2 rounded-md border border-blue-200 bg-blue-50/60 p-3">
        <label htmlFor="base_rate_type" className="block text-sm font-medium text-foreground">{labels.baseRateType} <span className="text-red-600" aria-hidden="true">*</span></label>
        <select id="base_rate_type" name="base_rate_type" value={baseRateType} onChange={(event) => setBaseRateType(event.target.value as BaseRateType)} required className={selectClass}>
          <option value="hourly">{labels.baseHourly}</option>
          <option value="fixed_per_lesson">{labels.baseFixed}</option>
        </select>
      </div>}
      {model !== 'base_plus_participant' && <input type="hidden" name="base_rate_type" value="" />}

      <PolicyField name="hourly_amount" label={labels.hourlyAmount} notUsedLabel={labels.notUsed} active={isActive('hourly')} required={isActive('hourly')} min="0" step="0.01" />
      <PolicyField name="fixed_amount" label={labels.fixedAmount} notUsedLabel={labels.notUsed} active={isActive('fixed')} required={isActive('fixed')} min="0" step="0.01" />
      <PolicyField name="revenue_percent" label={labels.revenuePercent} notUsedLabel={labels.notUsed} active={isActive('percentage')} required={isActive('percentage')} min="0" max="100" step="0.01" />
      <PolicyField name="participant_amount" label={labels.participantAmount} notUsedLabel={labels.notUsed} active={isActive('participant')} required={isActive('participant')} min="0" step="0.01" />
      <PolicyField name="no_show_percent" label={labels.noShowPercent} notUsedLabel={labels.notUsed} min="0" max="100" defaultValue="0" />
      <PolicyField name="late_parent_cancellation_percent" label={labels.lateCancellationPercent} notUsedLabel={labels.notUsed} min="0" max="100" defaultValue="0" />
      <PolicyField name="effective_from" label={labels.effectiveFrom} notUsedLabel={labels.notUsed} type="date" required />
      <PolicyField name="effective_to" label={labels.effectiveTo} notUsedLabel={labels.notUsed} type="date" />

      <label className="sm:col-span-2 flex items-center gap-2 text-sm">
        <input type="checkbox" name="requires_confirmation" className="h-4 w-4 rounded border-input" />
        {labels.requiresConfirmation}
      </label>
      <button className="sm:col-span-2 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground" type="submit">{labels.savePolicy}</button>
    </form>
  )
}
