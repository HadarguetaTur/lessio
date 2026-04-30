import { ShieldCheck } from 'lucide-react'

interface AdminHeaderProps {
  title: string
  description?: string
}

export function AdminHeader({ title, description }: AdminHeaderProps) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 text-xs text-indigo-600 font-semibold uppercase tracking-wider mb-1">
        <ShieldCheck size={13} />
        Platform Admin
      </div>
      <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
      {description && (
        <p className="text-gray-500 text-sm mt-0.5">{description}</p>
      )}
    </div>
  )
}
