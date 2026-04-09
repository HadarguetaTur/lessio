'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { StudentForm } from './StudentForm'

type ActionState = { error: string } | null
type FormAction = (prevState: ActionState, formData: FormData) => Promise<ActionState>

interface NewStudentSheetProps {
  action: FormAction
}

export function NewStudentSheet({ action }: NewStudentSheetProps) {
  const t = useTranslations('students')
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus size={15} className="ml-1.5" />
        {t('newStudent')}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto" dir="rtl">
          <SheetHeader className="mb-6">
            <SheetTitle>{t('newStudent')}</SheetTitle>
            <SheetDescription>{t('newStudentDescription')}</SheetDescription>
          </SheetHeader>
          <StudentForm
            action={action}
            onSuccess={() => setOpen(false)}
            onCancel={() => setOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </>
  )
}
