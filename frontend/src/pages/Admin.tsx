import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import { useT } from '@/i18n'
import { Tabs } from '@/components/ui'

import AdminStages from '@/pages/admin/Stages'
import AdminFields from '@/pages/admin/Fields'
import AdminRequirements from '@/pages/admin/Requirements'
import AdminRoles from '@/pages/admin/Roles'
import AdminNotify from '@/pages/admin/Notify'
import AdminSettings from '@/pages/admin/Settings'

export default function AdminPage() {
  const t = useT()
  const { can } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const sections = [
    { value: 'stages', label: t('admin_stages'), perm: 'admin.stages' },
    { value: 'fields', label: t('admin_fields'), perm: 'admin.fields' },
    { value: 'requirements', label: t('admin_required'), perm: 'admin.fields' },
    { value: 'roles', label: t('admin_roles'), perm: 'admin.roles' },
    { value: 'notify', label: t('admin_notify'), perm: 'admin.notify' },
    { value: 'settings', label: t('admin_settings'), perm: 'admin.settings' },
  ].filter((s) => can(s.perm))

  if (sections.length === 0) return <Navigate to="/" replace />

  const current = pathname.split('/')[2] ?? sections[0].value

  return (
    <div className="p-4">
      <h1 className="mb-3 text-base font-semibold">{t('nav_admin')}</h1>

      <Tabs value={current} onChange={(v) => navigate(`/admin/${v}`)} items={sections} />

      <div className="mt-4">
        <Routes>
          <Route index element={<Navigate to={sections[0].value} replace />} />
          <Route path="stages" element={<AdminStages />} />
          <Route path="fields" element={<AdminFields />} />
          <Route path="requirements" element={<AdminRequirements />} />
          <Route path="roles" element={<AdminRoles />} />
          <Route path="notify" element={<AdminNotify />} />
          <Route path="settings" element={<AdminSettings />} />
        </Routes>
      </div>
    </div>
  )
}
