'use client'

import { useState, useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertCircle, User, Users, Plus, Check, ArrowRight, FileUp } from 'lucide-react'
import { addTeacher, createOwnerTeacher } from '@/app/(onboarding)/onboarding/actions'
import { ImportFlow } from '@/components/import/ImportFlow'

type Mode = 'choose' | 'manual' | 'import'

interface TeachersStepProps {
  teachers: { id: string; full_name: string }[]
  orgId: string
  onNext: () => void
  onBack: () => void
  onCountChange: (count: number) => void
}

export function TeachersStep({
  teachers: initialTeachers,
  orgId,
  onNext,
  onBack,
  onCountChange,
}: TeachersStepProps) {
  const [mode, setMode] = useState<Mode>('choose')
  const [addedTeachers, setAddedTeachers] = useState<string[]>(
    initialTeachers.map((t) => t.full_name)
  )

  const [addState, addAction, addPending] = useActionState(
    async (_prev: { error: string } | null, formData: FormData) => {
      const result = await addTeacher(_prev, formData)
      if (!result) {
        const name = (formData.get('full_name') as string)?.trim()
        if (name) {
          setAddedTeachers((prev) => [...prev, name])
          onCountChange(addedTeachers.length + 1)
        }
      }
      return result
    },
    null
  )

  const handleSoloTeacher = async () => {
    await createOwnerTeacher()
    onCountChange(1)
    onNext()
  }

  if (mode === 'choose') {
    return (
      <div className="max-w-lg mx-auto">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-foreground">הוספת מורים</h2>
          <p className="text-muted-foreground mt-2">
            האם יש מורים נוספים שעובדים איתך?
          </p>
        </div>

        <div className="space-y-3">
          <button
            onClick={handleSoloTeacher}
            className="w-full flex items-center gap-4 rounded-xl border border-border p-5 hover:bg-muted/50 transition-colors text-right"
          >
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
              <User size={20} className="text-blue-600" />
            </div>
            <div>
              <div className="font-medium text-foreground">אני המורה היחיד</div>
              <div className="text-sm text-muted-foreground">אני מלמד/ת לבד ואין לי צוות</div>
            </div>
          </button>

          <button
            onClick={() => setMode('manual')}
            className="w-full flex items-center gap-4 rounded-xl border border-border p-5 hover:bg-muted/50 transition-colors text-right"
          >
            <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
              <Users size={20} className="text-emerald-600" />
            </div>
            <div>
              <div className="font-medium text-foreground">הוסף מורים</div>
              <div className="text-sm text-muted-foreground">הוספת מורים ידנית בשם ואימייל</div>
            </div>
          </button>

          <button
            onClick={() => setMode('import')}
            className="w-full flex items-center gap-4 rounded-xl border border-border p-5 hover:bg-muted/50 transition-colors text-right"
          >
            <div className="w-10 h-10 rounded-lg bg-violet-50 flex items-center justify-center shrink-0">
              <FileUp size={20} className="text-violet-600" />
            </div>
            <div>
              <div className="font-medium text-foreground">ייבוא מקובץ</div>
              <div className="text-sm text-muted-foreground">ייבוא רשימת מורים מקובץ Excel או CSV</div>
            </div>
          </button>
        </div>

        <div className="flex justify-between mt-8">
          <Button variant="outline" onClick={onBack}>
            <ArrowRight size={14} className="ml-1.5" />
            חזרה
          </Button>
          <Button variant="ghost" onClick={onNext}>
            דלג
          </Button>
        </div>
      </div>
    )
  }

  if (mode === 'import') {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-foreground">ייבוא מורים מקובץ</h2>
          <p className="text-muted-foreground mt-2">
            העלה קובץ Excel או CSV עם רשימת המורים. כל מורה יקבל הזמנה למערכת.
          </p>
        </div>

        <ImportFlow
          entityType="teachers"
          orgId={orgId}
          onComplete={(count) => {
            onCountChange(addedTeachers.length + count)
          }}
        />

        <div className="flex justify-between mt-8">
          <Button variant="outline" onClick={() => setMode('choose')}>
            <ArrowRight size={14} className="ml-1.5" />
            חזרה
          </Button>
          <Button onClick={onNext}>
            המשך
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-foreground">הוספת מורים</h2>
        <p className="text-muted-foreground mt-2">
          הזן שם ואימייל לכל מורה. הם יקבלו הזמנה למערכת.
        </p>
      </div>

      {/* Added teachers list */}
      {addedTeachers.length > 0 && (
        <div className="mb-6 space-y-2">
          {addedTeachers.map((name, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-lg border border-border p-3 bg-muted/20"
            >
              <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center">
                <Check size={14} className="text-emerald-600" />
              </div>
              <span className="text-sm font-medium">{name}</span>
            </div>
          ))}
        </div>
      )}

      {/* Add teacher form */}
      <form action={addAction} className="bg-card rounded-xl border border-border p-6 shadow-sm space-y-4">
        {addState?.error && (
          <div className="flex items-start gap-2.5 text-sm text-destructive bg-destructive/5 border border-destructive/20 p-3 rounded-lg">
            <AlertCircle size={15} className="shrink-0 mt-0.5" />
            <span>{addState.error}</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="teacher_name">שם מלא</Label>
            <Input
              id="teacher_name"
              name="full_name"
              type="text"
              required
              placeholder="שם המורה"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="teacher_email">אימייל</Label>
            <Input
              id="teacher_email"
              name="email"
              type="email"
              required
              placeholder="teacher@example.com"
              dir="ltr"
            />
          </div>
        </div>

        <Button type="submit" variant="outline" disabled={addPending} className="w-full">
          <Plus size={14} className="ml-1.5" />
          {addPending ? 'מוסיף...' : 'הוסף מורה'}
        </Button>
      </form>

      <div className="flex justify-between mt-8">
        <Button variant="outline" onClick={() => setMode('choose')}>
          <ArrowRight size={14} className="ml-1.5" />
          חזרה
        </Button>
        <Button onClick={onNext}>
          המשך
        </Button>
      </div>
    </div>
  )
}
