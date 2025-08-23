import React, { useEffect } from 'react'
import { Routes, Route, Link } from 'react-router-dom'
import LoginPage from './pages/login'
import RegisterPage from './pages/register'
import WelcomePage from './pages/index'
import ProtectedRoute from './components/ProtectedRoute'
import { useDispatch } from 'react-redux'
import { fetchMe, setInitialized } from './services/authSlice'
import Layout from './components/Layout'

export default function App() {
  const dispatch = useDispatch()

  useEffect(() => {
    // Run initial auth check. When it finishes (success or failure),
    // mark the app as initialized so ProtectedRoute can decide.
    dispatch(fetchMe())
      .catch(() => {
        // swallow the error (401 expected when not authenticated)
      })
      .finally(() => {
        dispatch(setInitialized(true))
      })
  }, [dispatch])

  return (
    <Layout>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/welcome" element={<ProtectedRoute><WelcomePage /></ProtectedRoute>} />
        <Route path="/" element={<LoginPage />} />
      </Routes>
    </Layout>
  )
}