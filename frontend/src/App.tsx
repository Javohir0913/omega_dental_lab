import { useEffect } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import { AUTH_LOST } from '@/lib/api'
import { socket } from '@/lib/ws'
import { useT } from '@/i18n'
import Layout from '@/components/Layout'
import { toast } from '@/components/Toast'

import LoginPage from '@/pages/Login'
import KanbanPage from '@/pages/Kanban'
import OrdersPage from '@/pages/Orders'
import OrderPage from '@/pages/Order'
import PatientsPage from '@/pages/Patients'
import PatientDetailPage from '@/pages/PatientDetail'
import DoctorsPage from '@/pages/Doctors'
import DoctorDetailPage from '@/pages/DoctorDetail'
import ServicesPage from '@/pages/Services'
import UsersPage from '@/pages/Users'
import ChatsPage from '@/pages/Chats'
import ProfilePage from '@/pages/Profile'
import LogsPage from '@/pages/Logs'
import ReportsPage from '@/pages/Reports'
import AdminPage from '@/pages/Admin'

function Protected({ children, perm }: { children: JSX.Element; perm?: string }) {
  const { me, ready, can } = useAuth()
  if (!ready) return <Splash />
  if (!me) return <Navigate to="/login" replace />
  if (perm && !can(perm)) return <Navigate to="/" replace />
  return children
}

function Splash() {
  return (
    <div className="grid min-h-screen place-items-center bg-surface-muted dark:bg-[#131720]">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-200 border-t-brand-500" />
        <div className="text-sm text-ink-faint">OMEGA DENTAL LAB</div>
      </div>
    </div>
  )
}

export default function App() {
  const { me, ready, load, setMe } = useAuth()
  const navigate = useNavigate()
  const t = useT()

  useEffect(() => {
    load()
  }, [load])

  // Sessiya uzilishi (limit oshdi / admin chiqardi / parol o'zgardi) — bitta joyda
  useEffect(() => {
    const onLost = () => {
      setMe(null)
      socket.close()
      toast(t('session_lost'), 'error')
      navigate('/login', { replace: true })
    }
    window.addEventListener(AUTH_LOST, onLost)
    return () => window.removeEventListener(AUTH_LOST, onLost)
  }, [navigate, setMe, t])

  useEffect(() => {
    if (me) socket.connect()
    else socket.close()
  }, [me])

  if (!ready) return <Splash />

  return (
    <Routes>
      <Route path="/login" element={me ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route index element={<KanbanPage />} />
        <Route path="orders" element={<OrdersPage />} />
        <Route path="orders/:id" element={<OrderPage />} />
        <Route path="patients" element={<Protected perm="patient.view"><PatientsPage /></Protected>} />
        <Route path="patients/:id" element={<Protected perm="patient.view"><PatientDetailPage /></Protected>} />
        <Route path="doctors" element={<Protected perm="doctor.view"><DoctorsPage /></Protected>} />
        <Route path="doctors/:id" element={<Protected perm="doctor.view"><DoctorDetailPage /></Protected>} />
        <Route path="services" element={<Protected perm="service.view"><ServicesPage /></Protected>} />
        <Route path="users" element={<Protected perm="user.view"><UsersPage /></Protected>} />
        <Route path="chats" element={<ChatsPage />} />
        <Route path="chats/:chatId" element={<ChatsPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="logs" element={<Protected perm="log.system"><LogsPage /></Protected>} />
        <Route path="reports" element={<Protected perm="report.view"><ReportsPage /></Protected>} />
        <Route path="admin/*" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
