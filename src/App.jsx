import React, { useEffect } from 'react'
import { Routes, Route, Link } from 'react-router-dom'
import LoginPage from './pages/login'
import RegisterPage from './pages/register'
import ProtectedRoute from './components/ProtectedRoute'
import HomePage from './pages/index'
import { useDispatch } from 'react-redux'
import { fetchMe, setInitialized } from './services/authSlice'
import Layout from './components/Layout'
import CreateQuizPage from './pages/create_quiz_page.jsx'
import MyQuizzesPage from './pages/my_quizzes_page.jsx'
import EditQuizPage from './pages/edit_quiz_page.jsx'
import QuizPreviewPage from './pages/quiz_preview_page.jsx'
import QuizReviewPage from './pages/quiz_review_page.jsx'

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
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        {/* placeholder routes for future pages */}
        <Route path="/create" element={<ProtectedRoute><CreateQuizPage /></ProtectedRoute>} />
        <Route path="/my-quizzes" element={<ProtectedRoute><MyQuizzesPage /></ProtectedRoute>} />
        <Route path="/my-quizzes/edit/:quizId" element={<ProtectedRoute><EditQuizPage /></ProtectedRoute>} />
        <Route path="/quiz/:quizId/preview" element={<ProtectedRoute><QuizPreviewPage /></ProtectedRoute>} />
        <Route path="/quiz/review/:attemptId" element={<ProtectedRoute><QuizReviewPage /></ProtectedRoute>} />
        <Route path="/attempts" element={<ProtectedRoute><div>Attempt History (todo)</div></ProtectedRoute>} />
      </Routes>
    </Layout>
  )
}